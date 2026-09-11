/**
 * Runs the Chainlink CRE confidential verifier for placements waiting on it.
 *
 * Vercel cannot run the CRE CLI (it's a real subprocess, not a serverless-safe
 * one), so this polls the database from a machine that has the CLI installed
 * and drives the same settlement path the app's own submit-proof handler
 * does: assign payout wallets onchain, then run confidential verification.
 * It never touches verification logic itself — it only decides *when* to
 * call it, and stops calling it for a placement that keeps failing.
 *
 *   APP_URL=https://ethonline2026.vercel.app node scripts/run-ts.cjs scripts/verification-watcher.ts
 */
import { PlacementStatus, VerificationRunStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/database/prisma";
import { assignPlacementWorkers, syncPlacementFromChain } from "@/lib/onchain/placements";
import { isCreRunnerAvailable, startVerificationRun } from "@/lib/verification/runner";

const POLL_MS = Number(process.env.WATCHER_POLL_MS ?? 15_000);
const STALE_RUN_MS = 6 * 60_000; // matches RUN_TIMEOUT_MS in runner.ts

// A placement is retried at most this often, regardless of why the previous
// attempt didn't finish — so a placement that can never succeed (a genuinely
// missing wallet, say) burns a bounded amount of CRE compute and Sepolia gas
// rather than being hammered every poll.
const RETRY_COOLDOWN_MS = 5 * 60_000;
// After this many attempts with no VERIFIED outcome, stop entirely and leave
// it for a human — the same placement failing five times running is a real
// problem, not bad luck.
const MAX_ATTEMPTS = 5;

function appUrl() {
  const url = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!url) {
    throw new Error("Set APP_URL to the deployed app, e.g. https://ethonline2026.vercel.app");
  }
  return url;
}

async function tick(url: string) {
  const prisma = getPrismaClient();

  const candidates = await prisma.placement.findMany({
    where: {
      status: PlacementStatus.READY_FOR_FINAL_VERIFICATION,
      NOT: {
        verificationRuns: {
          some: {
            OR: [
              // An attempt still in flight.
              {
                status: { in: [VerificationRunStatus.QUEUED, VerificationRunStatus.RUNNING] },
                startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) },
              },
              // Any attempt at all, too recently — win or lose.
              { startedAt: { gt: new Date(Date.now() - RETRY_COOLDOWN_MS) } },
            ],
          },
        },
      },
    },
    include: { _count: { select: { verificationRuns: true } } },
    take: 10,
  });

  for (const placement of candidates) {
    if (placement._count.verificationRuns >= MAX_ATTEMPTS) {
      console.warn(
        new Date().toISOString(),
        "giving up on",
        placement.id,
        `— ${placement._count.verificationRuns} attempts, still not verified. Needs a look.`,
      );
      continue;
    }

    try {
      // A report can land onchain and still leave the placement reading
      // READY_FOR_FINAL_VERIFICATION if the DB sync raced an unmined
      // transaction — seen in practice. A plain chain read is nearly free
      // next to a CRE run, so always try this first: it can turn a retry
      // into a no-op instead of a second, wasted onchain report.
      await syncPlacementFromChain(placement.id);
      const after = await prisma.placement.findUnique({
        where: { id: placement.id },
        select: { status: true },
      });
      if (after?.status !== PlacementStatus.READY_FOR_FINAL_VERIFICATION) {
        console.log(new Date().toISOString(), "already settled onchain, caught up", placement.id);
        continue;
      }

      // Idempotent: only sends a transaction when the escrow's payout wallets
      // don't already match. Verification must never run before this, or an
      // approved verdict can be reported onchain against no assigned payout
      // wallets, which the escrow accepts but silently does nothing with.
      await assignPlacementWorkers(placement.id);
      const run = await startVerificationRun(placement.id, url);
      console.log(new Date().toISOString(), "started", placement.id, run.id);
    } catch (error) {
      console.error(new Date().toISOString(), "failed to start", placement.id, error);
    }
  }
}

async function main() {
  const url = appUrl();
  if (!isCreRunnerAvailable()) {
    throw new Error("The CRE CLI is not available on this machine (check CRE_CLI_PATH and onchain config).");
  }

  console.log(new Date().toISOString(), "verification watcher up, polling every", POLL_MS, "ms against", url);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick(url);
    } catch (error) {
      console.error(new Date().toISOString(), "tick failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((error) => {
  console.error("WATCHER FAILED:", error);
  process.exit(1);
});
