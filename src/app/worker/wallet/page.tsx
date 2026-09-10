"use client";

import { useWorker } from "@/components/worker/WorkerStore";
import { formatDate, formatMoney } from "@/lib/worker-data";

export default function Wallet() {
  const { wallet, ready } = useWorker();
  const history = wallet?.history ?? [];
  const currency = wallet?.currency ?? "USD";

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Wallet</h1>
      <p className="mt-1.5 text-[14px] text-[var(--muted)]">
        Paid straight to your wallet after each check.
      </p>

      <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-[13px] text-[var(--muted)]">Available</p>
        <p className="mt-2 text-[40px] font-extrabold leading-none tracking-[-0.03em]">
          {wallet ? formatMoney(wallet.earnedMinor, currency) : "-"}
        </p>
        <p className="mt-3 text-[13px] text-[var(--faint)]">
          {wallet
            ? `${formatMoney(wallet.pendingMinor, currency)} waiting on checks`
            : "Loading balance"}
        </p>
        <button className="mt-5 w-full rounded-2xl bg-[var(--solid)] py-3.5 text-[15px] font-bold text-[var(--solid-ink)] active:opacity-90">
          Cash out
        </button>
      </div>

      <h2 className="mt-8 text-[17px] font-bold tracking-[-0.02em]">Paid out</h2>

      <div className="mt-3 flex flex-col gap-2">
        {!ready ? (
          <p className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-[14px] text-[var(--muted)]">
            Loading payouts
          </p>
        ) : history.length === 0 ? (
          <p className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-[14px] text-[var(--muted)]">
            Nothing paid out yet.
          </p>
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
                  {job.kind === "INSTALLER_PAYOUT" ? "Placed" : "Checked"} · {formatDate(job.createdAt)}
                </p>
              </div>
              <span className="shrink-0 text-[15px] font-semibold text-[var(--good)]">
                +{formatMoney(job.amountMinor, currency)}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
