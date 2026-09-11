"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Card, PageHeading } from "@/components/ui";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import { formatCampaignDate } from "@/lib/campaigns/format";
import { shortHex } from "@/lib/chain/explorer";
import { transactionKindLabel } from "@/lib/treasury/format";
import type {
  FundingRequestDto,
  TreasuryDto,
  TreasuryResponse,
} from "@/lib/treasury/types";

type Notice = { tone: "ok" | "fail"; text: string } | null;

type LoadState = {
  scope: string | null;
  treasury: TreasuryDto | null;
  loading: boolean;
  error: string | null;
};

function messageOf(caught: unknown, fallback: string) {
  return caught instanceof ClientApiError ? caught.message : fallback;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">{label}</p>
      <p className="mt-1.5 text-[26px] font-extrabold tracking-[-0.03em] tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

function FundingRequestRow({
  request,
  busy,
  onDecide,
}: {
  request: FundingRequestDto;
  busy: string | null;
  onDecide: (request: FundingRequestDto, decision: "approve" | "reject") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <Link href={`/brand/campaigns/${request.campaign.id}`} className="text-[14px] font-bold hover:underline">
          {request.campaign.name}
        </Link>
        <p className="mt-0.5 text-[12.5px] text-muted">
          ${request.amount} · {request.requestedByYou ? "requested by you" : "requested by a teammate"} ·{" "}
          {formatCampaignDate(request.createdAt, true)}
        </p>
        {request.failureReason ? (
          <p className="mt-1 text-[12px] text-fail">{request.failureReason}</p>
        ) : null}
      </div>
      {request.canDecide ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onDecide(request, "reject")}
            className="h-9 rounded-xl border border-line px-3.5 text-[12.5px] font-semibold hover:bg-raised disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onDecide(request, "approve")}
            className="h-9 rounded-xl bg-solid px-3.5 text-[12.5px] font-semibold text-solid-ink disabled:opacity-50"
          >
            {busy === `approve-${request.id}` ? "Funding…" : "Approve and fund"}
          </button>
        </div>
      ) : (
        <span className="rounded-full bg-raised px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          {request.status === "PENDING" ? "Awaiting a teammate" : request.status.toLowerCase()}
        </span>
      )}
    </div>
  );
}

/**
 * The organization's treasury: a Privy server wallet, the Privy policy that
 * constrains it, the second-approver rule and every onchain movement.
 */
export default function TreasuryDashboard() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;
  const sequence = useRef(0);
  const [state, setState] = useState<LoadState>({
    scope: null,
    treasury: null,
    loading: true,
    error: null,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [threshold, setThreshold] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const scope = userId;
    const current = ++sequence.current;
    setState((previous) => ({
      scope,
      treasury: previous.scope === scope ? previous.treasury : null,
      loading: true,
      error: null,
    }));

    try {
      const { treasury } = await authenticatedFetch<TreasuryResponse>(getAccessToken, "/api/treasury");
      if (current !== sequence.current) return;
      setState({ scope, treasury, loading: false, error: null });
      setThreshold(treasury.approvalThreshold ?? "");
    } catch (caught) {
      if (current !== sequence.current) return;
      setState((previous) => ({
        scope,
        treasury: previous.scope === scope ? previous.treasury : null,
        loading: false,
        error: messageOf(caught, "Could not load the treasury."),
      }));
    }
  }, [getAccessToken, userId]);

  const invalidate = useCallback(() => {
    ++sequence.current;
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      invalidate();
      setState({ scope: null, treasury: null, loading: false, error: null });
      return;
    }
    void load();
    return invalidate;
  }, [ready, userId, load, invalidate]);

  async function mutate(label: string, url: string, init: RequestInit, success: string) {
    setBusy(label);
    setNotice(null);
    try {
      const result = await authenticatedFetch<Partial<TreasuryResponse>>(getAccessToken, url, init);
      if (result.treasury && userId) {
        setState({ scope: userId, treasury: result.treasury, loading: false, error: null });
        setThreshold(result.treasury.approvalThreshold ?? "");
      } else {
        await load();
      }
      setNotice({ tone: "ok", text: success });
    } catch (caught) {
      setNotice({ tone: "fail", text: messageOf(caught, "That did not work. Try again.") });
    } finally {
      setBusy(null);
    }
  }

  function saveThreshold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = threshold.trim();
    void mutate(
      "threshold",
      "/api/treasury/settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalThreshold: value === "" ? null : value }),
      },
      value === "" ? "Second approval turned off." : `Funding above $${value} now needs a teammate's approval.`,
    );
  }

  function decide(request: FundingRequestDto, decision: "approve" | "reject") {
    void mutate(
      `${decision}-${request.id}`,
      `/api/funding-requests/${request.id}/${decision}`,
      { method: "POST" },
      decision === "approve"
        ? `${request.campaign.name} was funded from the treasury.`
        : "Funding request rejected.",
    );
  }

  const treasury = state.scope === userId ? state.treasury : null;
  const loading = !ready || (state.loading && !treasury);

  return (
    <>
      <PageHeading
        title="Treasury"
        sub="Your organization's stablecoin wallet. Privy holds the keys and enforces what it may sign."
      />

      {loading ? <div className="h-96 animate-pulse rounded-[20px] bg-raised" /> : null}

      {!loading && state.error && !treasury ? (
        <Card className="px-6 py-8 text-center">
          <h2 className="text-[17px] font-bold">Treasury unavailable</h2>
          <p className="mt-2 text-[13.5px] text-muted">{state.error}</p>
          <button onClick={() => void load()} className="mt-5 h-10 rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised">
            Try again
          </button>
        </Card>
      ) : null}

      {treasury ? (
        <div className="space-y-5">
          {notice ? (
            <div
              className={`rounded-2xl border px-5 py-3 text-[13px] ${
                notice.tone === "ok" ? "border-paid/30 bg-paid/5 text-paid" : "border-fail/30 bg-fail/5 text-fail"
              }`}
            >
              {notice.text}
            </div>
          ) : null}

          {!treasury.onchain ? (
            <Card className="px-6 py-6">
              <p className="text-[13.5px] text-muted">
                Onchain escrow is not configured on this server, so funding is simulated.
              </p>
            </Card>
          ) : null}

          {treasury.walletError ? (
            <Card className="border-fail/30 px-6 py-5">
              <p className="text-[13.5px] text-fail">{treasury.walletError}</p>
              <button onClick={() => void load()} className="mt-3 h-9 rounded-xl border border-line px-3.5 text-[12.5px] font-semibold hover:bg-raised">
                Retry
              </button>
            </Card>
          ) : null}

          {treasury.wallet && treasury.balances && treasury.token ? (
            <Card gradient className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-flex rounded-full border border-badge/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-badge">
                    {treasury.wallet.provider} · Sepolia
                  </span>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="break-all text-[14px] font-semibold">{treasury.wallet.address}</code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(treasury.wallet?.address ?? "");
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="rounded-lg border border-line px-2 py-0.5 text-[11.5px] font-semibold text-muted hover:text-ink"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <a href={treasury.wallet.explorerUrl} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-badge hover:underline">
                      Etherscan ↗
                    </a>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {treasury.token.mintable ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void mutate("top-up", "/api/treasury/top-up", { method: "POST" }, `Added 500 ${treasury.token?.symbol} to the treasury.`)
                      }
                      className="h-10 rounded-xl bg-solid px-4 text-[13px] font-semibold text-solid-ink disabled:opacity-50"
                    >
                      {busy === "top-up" ? "Adding funds…" : `Add 500 test ${treasury.token.symbol}`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy !== null || state.loading}
                    onClick={() => void load()}
                    className="h-10 rounded-xl border border-line px-4 text-[13px] font-semibold hover:bg-raised disabled:opacity-50"
                  >
                    {state.loading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>

              <div className="mt-7 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
                <Stat label="Available" value={`${treasury.balances.token} ${treasury.token.symbol}`} hint="Ready to fund campaigns" />
                <Stat label="Gas" value={`${treasury.balances.eth} ETH`} hint="Topped up automatically on Sepolia" />
                <Stat
                  label="Second approval"
                  value={treasury.approvalThreshold ? `Above $${treasury.approvalThreshold}` : "Off"}
                  hint={`${treasury.otherApprovers} other ${treasury.otherApprovers === 1 ? "approver" : "approvers"}`}
                />
              </div>
            </Card>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16px] font-bold">Privy policy</h2>
                {treasury.policy.id ? (
                  <code className="text-[11px] text-faint">{shortHex(treasury.policy.id)}</code>
                ) : null}
              </div>
              <p className="mt-1 text-[12.5px] text-muted">
                Enforced by Privy before it signs anything, even if StickerBomb&apos;s server were compromised.
              </p>
              <ul className="mt-4 space-y-2.5">
                {(treasury.policy.rules.length ? treasury.policy.rules : ["The policy is attached when the treasury wallet is created."]).map((rule) => (
                  <li key={rule} className="flex gap-2.5 text-[13px]">
                    <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-paid" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
              {treasury.escrow ? (
                <a href={treasury.escrow.explorerUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[12.5px] font-semibold text-badge hover:underline">
                  CampaignEscrow {shortHex(treasury.escrow.address)} ↗
                </a>
              ) : null}
            </Card>

            <Card className="p-6">
              <h2 className="text-[16px] font-bold">Funding approvals</h2>
              <p className="mt-1 text-[12.5px] text-muted">
                Campaign funding above this amount waits for a second member of your organization to approve it.
              </p>
              <form onSubmit={saveThreshold} className="mt-4 flex flex-wrap items-end gap-3">
                <label className="flex-1">
                  <span className="text-[12px] font-semibold text-muted">Threshold (USD)</span>
                  <div className="mt-1.5 flex items-center gap-1.5 rounded-xl border border-line bg-bg px-3.5 py-2.5">
                    <span className="text-muted">$</span>
                    <input
                      value={threshold}
                      onChange={(event) => setThreshold(event.target.value)}
                      inputMode="decimal"
                      placeholder="No threshold"
                      className="w-full bg-transparent text-[14px] font-semibold outline-none"
                    />
                  </div>
                </label>
                <button
                  disabled={busy !== null}
                  className="h-11 rounded-xl border border-line px-4 text-[13px] font-semibold hover:bg-raised disabled:opacity-50"
                >
                  {busy === "threshold" ? "Saving…" : "Save"}
                </button>
              </form>
              {treasury.otherApprovers === 0 ? (
                <p className="mt-3 text-[12px] text-faint">
                  You are the only member, so any threshold blocks funding above it until a teammate joins.
                </p>
              ) : null}
            </Card>
          </div>

          {treasury.fundingRequests.length > 0 ? (
            <Card className="overflow-hidden">
              <div className="border-b border-line px-5 py-4 sm:px-6">
                <h2 className="text-[16px] font-bold">Funding requests</h2>
              </div>
              <div className="divide-y divide-line">
                {treasury.fundingRequests.map((request) => (
                  <FundingRequestRow key={request.id} request={request} busy={busy} onDecide={decide} />
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <div className="border-b border-line px-5 py-4 sm:px-6">
              <h2 className="text-[16px] font-bold">Onchain activity</h2>
              <p className="text-[12.5px] text-muted">Every movement of treasury and escrow money, linked to Etherscan.</p>
            </div>
            {treasury.transactions.length === 0 ? (
              <p className="px-6 py-8 text-[13px] text-muted">No transactions yet. Add test funds, then fund a campaign.</p>
            ) : (
              <div className="divide-y divide-line">
                {treasury.transactions.map((transaction) => (
                  <a
                    key={transaction.id}
                    href={transaction.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="grid gap-2 px-5 py-3.5 transition-colors hover:bg-raised/60 sm:grid-cols-[minmax(0,1fr)_160px_130px_90px] sm:items-center sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold">
                        {transactionKindLabel(transaction.kind)}
                        {transaction.viaPrivy ? (
                          <span className="ml-2 rounded-full border border-badge/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-badge">
                            Privy signed
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-[12px] text-muted">
                        {transaction.campaign?.name ?? "Treasury"} · {shortHex(transaction.txHash)}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums">{transaction.amount ?? "—"}</span>
                    <span className="text-[12px] text-muted">{formatCampaignDate(transaction.createdAt, true)}</span>
                    <span
                      className={`text-[11px] font-bold uppercase tracking-[0.08em] ${
                        transaction.status === "CONFIRMED" ? "text-paid" : transaction.status === "FAILED" ? "text-fail" : "text-badge"
                      }`}
                    >
                      {transaction.status.toLowerCase()}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
