import {
  EVMClient,
  EVMRestrictor,
  HTTPCapability,
  HTTPClient,
  HTTPClientRestrictor,
  Runner,
  TxStatus,
  bytesToHex,
  getNetwork,
  handlerInTee,
  hexToBase64,
  type HTTPPayload,
  type TeeRuntime,
  type Workflow,
} from "@chainlink/cre-sdk";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toBytes,
  type Hex,
} from "viem";
import { evaluatePlacement, type EvidenceBundle, type Verdict } from "./checks";

/**
 * StickerBomb confidential placement verifier.
 *
 * Trigger: HTTP request `{ "placementId": "<id>" }` from the StickerBomb app.
 *
 * Inside the TEE:
 *   1. The evidence API key and geofence salt are released by the Vault DON.
 *   2. The exact evidence bundle (both workers' GPS, the surface's exact point,
 *      worker identities, media fingerprints) is fetched from the app over a
 *      confidential HTTP call.
 *   3. Deterministic checks decide the verdict.
 *   4. A salted commitment to the evidence is computed.
 *
 * Leaves the enclave: `approved`, reason codes and the commitment. They go to
 * the app (for the brand's timeline) and, via a DON-signed report, to
 * CampaignEscrow.onReport, which pays the installer and verifier.
 */

type Config = {
  evidence_api_url: string;
  challenge_grace_seconds: number;
  secrets_ids: {
    evidence_api_key_id: string;
    geofence_salt_id: string;
  };
  evms: Array<{
    chain_selector_name: string;
    consumer_address: string;
    gas_limit: string;
  }>;
};

type VerificationResult = Verdict & {
  placementId: string;
  onchainPlacementId: string;
  evidenceHash: string;
  txHash?: string;
};

const CONSENSUS_CAPABILITY_ID = "consensus@1.0.0-alpha";
const PLACEMENT_ID_PATTERN = /^[a-z0-9]{10,40}$/;

const decode = (raw: Uint8Array) => new TextDecoder().decode(raw);

function requestJson(
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  url: string,
  apiKey: string,
  body?: Record<string, unknown>,
): Record<string, unknown> {
  const response = client
    .sendRequest(runtime, {
      url,
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-stickerbomb-cre-key": apiKey,
      },
      ...(body
        ? { body: Buffer.from(JSON.stringify(body)).toString("base64") }
        : {}),
    })
    .result();

  const text = decode(response.body);
  if (response.statusCode >= 400) {
    throw new Error(`request failed status=${response.statusCode}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Commitment to the evidence, salted with a secret so the exact coordinates
 * cannot be brute-forced from the public hash.
 */
function commitEvidence(bundle: EvidenceBundle, salt: string): Hex {
  const parts = [
    salt,
    bundle.onchainPlacementId,
    bundle.installation?.mediaHash ?? "",
    bundle.installation?.latitude.toFixed(6) ?? "",
    bundle.installation?.longitude.toFixed(6) ?? "",
    bundle.verification?.mediaHash ?? "",
    bundle.verification?.latitude.toFixed(6) ?? "",
    bundle.verification?.longitude.toFixed(6) ?? "",
  ];
  return keccak256(toBytes(parts.join("|")));
}

function writeVerdictOnchain(
  runtime: TeeRuntime<Config>,
  onchainPlacementId: Hex,
  verdict: Verdict,
  evidenceHash: Hex,
): string {
  const evm = runtime.config.evms[0];
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evm.chain_selector_name,
  });
  if (!network) throw new Error(`network not found: ${evm.chain_selector_name}`);

  const payload = encodeAbiParameters(
    parseAbiParameters("bytes32 placementId, bool approved, bytes32 evidenceHash"),
    [onchainPlacementId, verdict.approved, evidenceHash],
  );

  const dons = runtime.usingTheDons();
  const report = dons
    .report({
      encodedPayload: hexToBase64(payload),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const write = new EVMClient(network.chainSelector.selector)
    .writeReport(dons, {
      receiver: evm.consumer_address,
      report,
      gasConfig: { gasLimit: evm.gas_limit },
    })
    .result();

  if (write.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`onchain write failed with status ${write.txStatus}`);
  }

  return bytesToHex(write.txHash || new Uint8Array(32));
}

export const onVerificationRequest = async (
  runtime: TeeRuntime<Config>,
  payload: HTTPPayload,
): Promise<string> => {
  const request = JSON.parse(decode(payload.input)) as { placementId?: unknown };
  const placementId = typeof request.placementId === "string" ? request.placementId : "";
  if (!PLACEMENT_ID_PATTERN.test(placementId)) {
    throw new Error("invalid placementId");
  }

  const { secrets_ids, evidence_api_url, challenge_grace_seconds } = runtime.config;
  const secrets = runtime
    .getSecrets([
      { id: secrets_ids.evidence_api_key_id },
      { id: secrets_ids.geofence_salt_id },
    ])
    .result();
  const apiKey = secrets[secrets_ids.evidence_api_key_id].value;
  const salt = secrets[secrets_ids.geofence_salt_id].value;
  runtime.log("placement-verifier secrets released into enclave");

  const http = new HTTPClient();
  const bundle = requestJson(
    runtime,
    http,
    `${evidence_api_url}/${placementId}/evidence`,
    apiKey,
  ) as unknown as EvidenceBundle;
  runtime.log("placement-verifier evidence bundle received (contents stay in enclave)");

  const verdict = evaluatePlacement(bundle, challenge_grace_seconds);
  const evidenceHash = commitEvidence(bundle, salt);
  runtime.log(
    `placement-verifier verdict approved=${verdict.approved} reasons=${verdict.reasons.join(",") || "none"}`,
  );

  const result: VerificationResult = {
    placementId,
    onchainPlacementId: bundle.onchainPlacementId,
    evidenceHash,
    ...verdict,
  };

  result.txHash = writeVerdictOnchain(
    runtime,
    bundle.onchainPlacementId as Hex,
    verdict,
    evidenceHash,
  );
  runtime.log(`placement-verifier report written tx=${result.txHash}`);

  requestJson(runtime, http, `${evidence_api_url}/${placementId}/verdict`, apiKey, {
    approved: result.approved,
    reasons: result.reasons,
    evidenceHash: result.evidenceHash,
    txHash: result.txHash,
  });

  return JSON.stringify(result);
};

export const buildRestrictions = (config: Config) => {
  const restrictions = [
    new HTTPClientRestrictor().limitSendRequest(2),
    { method: { id: CONSENSUS_CAPABILITY_ID, method: "Report", maxCalls: 1 } },
  ];

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.evms[0].chain_selector_name,
  });
  if (network) {
    restrictions.push(
      new EVMRestrictor(BigInt(network.chainSelector.selector)).limitWriteReport(1),
    );
  }

  return {
    capabilities: {
      type: "CAPABILITY_RESTRICTION_TYPE_CLOSED" as const,
      maxTotalCalls: 4,
      restrictions,
    },
    secrets: {
      maxSecrets: 2,
      restrictions: [
        { exactSecret: { id: config.secrets_ids.evidence_api_key_id, namespace: "main" } },
        { exactSecret: { id: config.secrets_ids.geofence_salt_id, namespace: "main" } },
      ],
    },
  };
};

/**
 * The TEE pre-hook (capability and secret restrictions) is evaluated with an
 * empty config; the handler itself always receives the real one. The defaults
 * only need to produce the same restrictions.
 */
const PREHOOK_DEFAULT_CONFIG: Config = {
  evidence_api_url: "prehook-default",
  challenge_grace_seconds: 30,
  secrets_ids: {
    evidence_api_key_id: "evidence_api_key",
    geofence_salt_id: "geofence_salt",
  },
  evms: [
    {
      chain_selector_name: "ethereum-testnet-sepolia",
      consumer_address: "0x0000000000000000000000000000000000000000",
      gas_limit: "500000",
    },
  ],
};

export const initWorkflow = (config: Config): Workflow<Config> => {
  if (!config.evidence_api_url || !config.evms?.[0]?.consumer_address) {
    throw new Error("config requires evidence_api_url and evms[0].consumer_address");
  }

  return [
    handlerInTee(
      new HTTPCapability().trigger({}),
      onVerificationRequest,
      {}, // any registered TEE
      { preHook: (cfg: Config) => buildRestrictions(cfg) },
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({
    configParser: (raw: Uint8Array) => {
      const text = new TextDecoder().decode(raw);
      return text.trim() === "" ? PREHOOK_DEFAULT_CONFIG : (JSON.parse(text) as Config);
    },
  });
  await runner.run(initWorkflow);
}
