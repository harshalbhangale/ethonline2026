import { Prisma, SelfieCheckStatus } from "@/generated/prisma/client";
import type { WorkerContext } from "@/lib/auth/require-worker";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import { isSelfieCheckEnabled } from "@/lib/world/config";
import { verifySelfieCheckProof, type WorldProofPayload } from "@/lib/world/verify";

/** Selfie Check credentials are issued with a 90-day validity. */
const VALIDITY_DAYS = 90;

export type SelfieCheckState = {
  enabled: boolean;
  status: SelfieCheckStatus;
  verifiedAt: string | null;
  expiresAt: string | null;
};

type ProfileRow = {
  selfieCheckStatus: SelfieCheckStatus;
  selfieVerifiedAt: Date | null;
  selfieExpiresAt: Date | null;
};

/** A check counts only while it is VERIFIED and not past its expiry. */
export function isSelfieCheckCurrent(profile: ProfileRow, now = new Date()) {
  if (profile.selfieCheckStatus !== SelfieCheckStatus.VERIFIED) return false;
  return !profile.selfieExpiresAt || profile.selfieExpiresAt > now;
}

export function toSelfieCheckState(profile: ProfileRow): SelfieCheckState {
  const expired =
    profile.selfieCheckStatus === SelfieCheckStatus.VERIFIED && !isSelfieCheckCurrent(profile);

  return {
    enabled: isSelfieCheckEnabled(),
    // An expired credential reads as never started: the action is to verify again.
    status: expired ? SelfieCheckStatus.NOT_STARTED : profile.selfieCheckStatus,
    verifiedAt: profile.selfieVerifiedAt?.toISOString() ?? null,
    expiresAt: profile.selfieExpiresAt?.toISOString() ?? null,
  };
}

export async function getSelfieCheckState(userId: string): Promise<SelfieCheckState> {
  const profile = await getPrismaClient().workerProfile.findUniqueOrThrow({
    where: { userId },
    select: { selfieCheckStatus: true, selfieVerifiedAt: true, selfieExpiresAt: true },
  });

  return toSelfieCheckState(profile);
}

/**
 * Verifies a proof with World and records the result against the worker.
 *
 * The nullifier is unique per credential, so a second account presenting the
 * same person's check is refused rather than silently allowed.
 */
export async function recordSelfieCheck(
  context: WorkerContext,
  payload: WorldProofPayload,
): Promise<SelfieCheckState> {
  const prisma = getPrismaClient();
  const { nullifier } = await verifySelfieCheckProof(payload);

  const verifiedAt = new Date();
  const expiresAt = new Date(verifiedAt.getTime() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  try {
    const profile = await prisma.workerProfile.update({
      where: { userId: context.userId },
      data: {
        selfieCheckStatus: SelfieCheckStatus.VERIFIED,
        selfieNullifier: nullifier,
        selfieVerifiedAt: verifiedAt,
        selfieExpiresAt: expiresAt,
      },
      select: { selfieCheckStatus: true, selfieVerifiedAt: true, selfieExpiresAt: true },
    });

    return toSelfieCheckState(profile);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(
        409,
        "SELFIE_CHECK_ALREADY_USED",
        "That check is already linked to another worker account.",
      );
    }
    throw error;
  }
}
