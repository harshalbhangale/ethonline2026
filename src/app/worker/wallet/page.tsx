"use client";

import { useWorker } from "@/components/worker/WorkerStore";
import { formatDate, formatMoney } from "@/lib/worker-data";

export default function Wallet() {
  const { wallet, ready } = useWorker();
  const history = wallet?.history ?? [];
  const currency = wallet?.currency ?? "USD";

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Earnings</h1>
      <p className="mt-1.5 text-[14px] text-[var(--muted)]">
        Paid straight to your wallet after each check.
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="p-5">
          <p className="text-[13px] text-[var(--muted)]">Paid out so far</p>
          {ready && wallet ? (
            <p className="mt-2 text-[40px] font-extrabold leading-none tracking-[-0.03em]">
              {formatMoney(wallet.earnedMinor, currency)}
            </p>
          ) : (
            <div className="mt-2 h-10 w-40 animate-pulse rounded-xl bg-[var(--raised)]" />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3.5">
          <span className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
            Waiting on checks
          </span>
          <span className="text-[14px] font-semibold text-[var(--amber)]">
            {ready && wallet ? formatMoney(wallet.pendingMinor, currency) : "—"}
          </span>
        </div>

        {wallet?.payoutAddress ? (
          <a
            href={`https://sepolia.etherscan.io/address/${wallet.payoutAddress}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3.5 active:bg-[var(--raised)]"
          >
            <span className="min-w-0">
              <span className="block text-[13px] text-[var(--muted)]">
                Paid by escrow to
              </span>
              <span className="mt-0.5 block truncate font-mono text-[13px] text-[var(--ink)]">
                {wallet.payoutAddress.slice(0, 10)}…{wallet.payoutAddress.slice(-8)}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-medium text-[var(--amber)]">
              Explorer ↗
            </span>
          </a>
        ) : null}
      </div>

      <h2 className="mt-8 text-[17px] font-bold tracking-[-0.02em]">Payouts</h2>

      <div className="mt-3 flex flex-col gap-2">
        {!ready ? (
          <>
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="h-3.5 w-[52%] animate-pulse rounded-full bg-[var(--raised)]" />
                  <div className="mt-2 h-3 w-[38%] animate-pulse rounded-full bg-[var(--raised)]" />
                </div>
                <div className="h-4 w-14 animate-pulse rounded-full bg-[var(--raised)]" />
              </div>
            ))}
          </>
        ) : history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center">
            <p className="text-[14px] font-semibold">Nothing paid out yet</p>
            <p className="mx-auto mt-1.5 max-w-[32ch] text-[13px] leading-relaxed text-[var(--muted)]">
              Finish a job and the escrow releases your payment as soon as it is
              verified.
            </p>
          </div>
        ) : (
          history.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium">
                  {job.venueName ?? "Placement payout"}
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--faint)]">
                  {job.kind === "INSTALLER_PAYOUT" ? "Placed" : "Checked"} ·{" "}
                  {formatDate(job.createdAt)}
                </p>
              </div>
              <span className="shrink-0 text-right">
                <span className="block text-[15px] font-semibold text-[var(--good)]">
                  +{formatMoney(job.amountMinor, currency)}
                </span>
                {job.explorerUrl ? (
                  <a
                    href={job.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[var(--amber)]"
                  >
                    Onchain ↗
                  </a>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
