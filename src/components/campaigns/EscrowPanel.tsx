"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import { explorerTxUrl, shortHex } from "@/lib/chain/explorer";
import type { CampaignEscrowDto } from "@/lib/onchain/placements";
import { transactionKindLabel } from "@/lib/treasury/format";

type LoadState = {
  scope: string | null;
  escrow: CampaignEscrowDto | null;
  loading: boolean;
  error: string | null;
};

function Figure({ label, value, tone }: { label: string; value: string; tone?: "paid" | "badge" }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">{label}</p>
      <p
        className={`mt-1.5 text-[20px] font-extrabold tabular-nums tracking-[-0.02em] ${
          tone === "paid" ? "text-paid" : tone === "badge" ? "text-badge" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** Live CampaignEscrow balances for one campaign, read from Sepolia. */
export default function EscrowPanel({ campaignId, funded }: { campaignId: string; funded: boolean }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const userId = ready && authenticated ? user?.id ?? null : null;
  const scope = userId ? `${userId}:${campaignId}` : null;
  const sequence = useRef(0);
  const [state, setState] = useState<LoadState>({ scope: null, escrow: null, loading: true, error: null });
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(
    async (method: "GET" | "POST" = "GET") => {
      if (!scope) return;
      const current = ++sequence.current;
      if (method === "POST") setSyncing(true);
      setState((previous) => ({
        scope,
        escrow: previous.scope === scope ? previous.escrow : null,
        loading: true,
        error: null,
      }));

      try {
        const { escrow } = await authenticatedFetch<{ escrow: CampaignEscrowDto }>(
          getAccessToken,
          `/api/campaigns/${campaignId}/escrow`,
          { method },
        );
        if (current !== sequence.current) return;
        setState({ scope, escrow, loading: false, error: null });
      } catch (caught) {
        if (current !== sequence.current) return;
        setState((previous) => ({
          scope,
          escrow: previous.scope === scope ? previous.escrow : null,
          loading: false,
          error: caught instanceof ClientApiError ? caught.message : "Could not read the escrow.",
        }));
      } finally {
        if (method === "POST") setSyncing(false);
      }
    },
    [campaignId, getAccessToken, scope],
  );

  const invalidate = useCallback(() => {
    ++sequence.current;
  }, []);

  useEffect(() => {
    if (!ready || !scope || !funded) return;
    void load();
    return invalidate;
  }, [ready, scope, funded, load, invalidate]);

  if (!funded) {
    return (
      <Card className="p-5">
        <h2 className="text-[15px] font-bold">Escrow</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Funding deposits the approved quote from your treasury into CampaignEscrow on Sepolia. Workers are paid
          from escrow only after independent, confidential verification.
        </p>
      </Card>
    );
  }

  const escrow = state.scope === scope ? state.escrow : null;

  if (!escrow) {
    return state.error ? (
      <Card className="p-5">
        <p className="text-[13px] text-fail">{state.error}</p>
        <button onClick={() => void load()} className="mt-3 h-9 rounded-xl border border-line px-3.5 text-[12.5px] font-semibold hover:bg-raised">
          Try again
        </button>
      </Card>
    ) : (
      <div className="h-40 animate-pulse rounded-[20px] bg-raised" />
    );
  }

  if (!escrow.onchain || !escrow.campaignKey) {
    return (
      <Card className="p-5">
        <h2 className="text-[15px] font-bold">Escrow</h2>
        <p className="mt-2 text-[12.5px] text-muted">This campaign was funded before onchain escrow was enabled, so no money moved.</p>
      </Card>
    );
  }

  const unit = escrow.symbol;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 className="text-[16px] font-bold">Escrow</h2>
          <p className="text-[12.5px] text-muted">
            Held by CampaignEscrow on Sepolia. Balances are read live from the contract.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {escrow.escrowExplorerUrl ? (
            <a href={escrow.escrowExplorerUrl} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-badge hover:underline">
              Contract {shortHex(escrow.escrowAddress ?? "")} ↗
            </a>
          ) : null}
          <button
            type="button"
            disabled={syncing || state.loading}
            onClick={() => void load("POST")}
            className="h-9 rounded-xl border border-line px-3.5 text-[12.5px] font-semibold hover:bg-raised disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync with chain"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-5 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="Deposited" value={`${escrow.funded ?? "0.00"} ${unit}`} />
        <Figure label="Held in escrow" value={`${escrow.held ?? "0.00"} ${unit}`} />
        <Figure label="Paid to workers" value={`${escrow.paidOut ?? "0.00"} ${unit}`} tone="paid" />
        <Figure label="Cleanup reserve locked" value={`${escrow.cleanupReserveLocked ?? "0.00"} ${unit}`} tone="badge" />
        <Figure label="Uncommitted" value={`${escrow.available ?? "0.00"} ${unit}`} />
      </div>

      {escrow.fundingTxHash ? (
        <div className="border-t border-line px-6 py-3 text-[12.5px] text-muted">
          Funded by your Privy treasury in{" "}
          <a href={explorerTxUrl(escrow.fundingTxHash)} target="_blank" rel="noreferrer" className="font-semibold text-badge hover:underline">
            {shortHex(escrow.fundingTxHash)} ↗
          </a>
        </div>
      ) : null}

      {escrow.transactions.length > 0 ? (
        <div className="divide-y divide-line border-t border-line">
          {escrow.transactions.map((transaction) => (
            <a
              key={transaction.id}
              href={transaction.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 text-[12.5px] hover:bg-raised/60"
            >
              <span className="font-semibold">
                {transactionKindLabel(transaction.kind)}
                {transaction.viaPrivy ? <span className="ml-2 text-[10.5px] font-bold uppercase text-badge">Privy</span> : null}
              </span>
              <span className="tabular-nums text-muted">
                {transaction.amount ?? ""} · {shortHex(transaction.txHash)} ↗
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
