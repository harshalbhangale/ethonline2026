import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PlacementStatus, VerificationRunStatus } from "@/generated/prisma/client";
import { getChainConfig, isOnchainConfigured } from "@/lib/chain/config";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import { syncPlacementFromChain } from "@/lib/onchain/placements";

/**
 * Runs the Chainlink CRE confidential placement verifier through the CRE CLI
 * simulator, broadcasting its report to Sepolia.
 *
 * This is the local stand-in for a deployed CRE workflow: in production the
 * app would call the workflow's HTTP trigger instead. The workflow fetches its
 * own evidence from /api/cre over an authenticated call made inside the TEE.
 */

const RUN_TIMEOUT_MS = 6 * 60_000;
const LOG_LIMIT = 40_000;

export function creCliPath() {
  return process.env.CRE_CLI_PATH?.trim() || path.join(os.homedir(), ".local", "bin", "cre");
}

function creProjectRoot() {
  return path.join(process.cwd(), "cre");
}

export function isCreRunnerAvailable() {
  return isOnchainConfigured() && existsSync(creCliPath()) && existsSync(creProjectRoot());
}

/**
 * Writes a per-run workflow config pointing at this app and escrow. The CLI
 * rejects config paths longer than 97 characters and resolves relative ones
 * from the workflow folder, so this returns a short absolute path in `cre/`.
 */
function writeRunConfig(appUrl: string, runId: string, escrow: string) {
  const directory = path.join(creProjectRoot(), ".runs");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${runId.slice(-10)}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      evidence_api_url: `${appUrl.replace(/\/$/, "")}/api/cre/placements`,
      challenge_grace_seconds: 30,
      min_dwell_seconds: Number(process.env.STICKERBOMB_MIN_DWELL_SECONDS ?? 30),
      spot_check_percent: Number(process.env.STICKERBOMB_SPOT_CHECK_PERCENT ?? 10),
      secrets_ids: {
        evidence_api_key_id: "evidence_api_key",
        geofence_salt_id: "geofence_salt",
      },
      evms: [
        {
          chain_selector_name: "ethereum-testnet-sepolia",
          consumer_address: escrow,
          gas_limit: "500000",
        },
      ],
    }),
  );
  return file;
}

function redact(text: string) {
  let output = text;
  for (const secret of [
    process.env.PRIVATE_KEY,
    process.env.STICKERBOMB_EVIDENCE_API_KEY,
    process.env.STICKERBOMB_GEOFENCE_SALT,
  ]) {
    const value = secret?.trim().replace(/^0x/, "");
    if (value && value.length >= 8) output = output.split(value).join("[redacted]");
  }
  return output;
}

async function finishRun(runId: string, placementId: string, code: number | null, output: string) {
  const prisma = getPrismaClient();
  const txHash = output.match(/report written tx=(0x[0-9a-fA-F]{64})/)?.[1];
  const approved = output.match(/verdict approved=(true|false)/)?.[1];
  // A spot check is a finished verdict with nothing written onchain yet.
  const spotCheck = /spotCheck=true/.test(output);

  try {
    await prisma.verificationRun.update({
      where: { id: runId },
      data: {
        // The onchain report is what settles money; a later failure (such as
        // the verdict callback timing out) does not undo it.
        status:
          txHash || spotCheck ? VerificationRunStatus.SUCCEEDED : VerificationRunStatus.FAILED,
        log: redact(output).slice(-LOG_LIMIT),
        finishedAt: new Date(),
        ...(txHash ? { txHash } : {}),
        ...(approved ? { approved: approved === "true" } : {}),
      },
    });
    await syncPlacementFromChain(placementId);
  } catch (error) {
    console.error("Could not finalise verification run", error);
  }
}

export async function startVerificationRun(placementId: string, appUrl: string) {
  const prisma = getPrismaClient();
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    include: { campaign: { select: { escrowAddress: true } } },
  });
  if (!placement) throw new ApiError(404, "PLACEMENT_NOT_FOUND", "Placement not found.");

  if (placement.status !== PlacementStatus.READY_FOR_FINAL_VERIFICATION) {
    throw new ApiError(
      409,
      "PLACEMENT_NOT_READY",
      "Both proofs must be submitted before confidential verification.",
    );
  }

  if (!isCreRunnerAvailable()) {
    throw new ApiError(
      503,
      "CRE_UNAVAILABLE",
      "The Chainlink CRE CLI is not available on this server.",
    );
  }

  const active = await prisma.verificationRun.findFirst({
    where: {
      placementId,
      status: { in: [VerificationRunStatus.QUEUED, VerificationRunStatus.RUNNING] },
      startedAt: { gt: new Date(Date.now() - RUN_TIMEOUT_MS) },
    },
  });
  if (active) return active;

  const run = await prisma.verificationRun.create({
    data: {
      placementId,
      mode: "cre-simulate",
      status: VerificationRunStatus.RUNNING,
      startedAt: new Date(),
    },
  });

  const privateKey = process.env.PRIVATE_KEY?.trim().replace(/^0x/, "") ?? "";
  const child = spawn(
    creCliPath(),
    [
      "workflow",
      "simulate",
      "./placement-verifier",
      "--target",
      "staging-settings",
      "--non-interactive",
      "--trigger-index",
      "0",
      "--http-payload",
      JSON.stringify({ placementId }),
      "--broadcast",
      "--config",
      // The report must reach the escrow this campaign was funded into.
      writeRunConfig(appUrl, run.id, placement.campaign.escrowAddress ?? getChainConfig().escrow),
    ],
    {
      cwd: creProjectRoot(),
      env: { ...process.env, CRE_ETH_PRIVATE_KEY: privateKey, NO_COLOR: "1" },
    },
  );

  let output = "";
  const append = (chunk: Buffer) => {
    output += chunk.toString();
    if (output.length > LOG_LIMIT * 2) output = output.slice(-LOG_LIMIT);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("error", (error) => {
    output += `\n${error.message}`;
  });

  const timer = setTimeout(() => child.kill("SIGTERM"), RUN_TIMEOUT_MS);
  child.on("close", (code) => {
    clearTimeout(timer);
    void finishRun(run.id, placementId, code, output);
  });

  return run;
}
