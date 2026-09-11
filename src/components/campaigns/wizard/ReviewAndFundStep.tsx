"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";
import {
  authenticatedFetch,
  ClientApiError,
} from "@/lib/api/authenticated-fetch";
import {
  formatCampaignBudget,
  formatOptionalCampaignDate,
  notSetLabel,
} from "@/lib/campaigns/format";
import { formatRadius } from "@/lib/campaigns/geo";
import type { CampaignDto } from "@/lib/campaigns/types";
import type { FundCampaignResult } from "@/lib/funding/service";
import type { CampaignQuoteResponse } from "@/lib/quotes/types";
import type { TreasuryDto, TreasuryResponse } from "@/lib/treasury/types";

/** Turns the quote-readiness field errors into something a brand can act on. */
const fieldLabels: Record<string, string> = {
  placementCount: "Number of placements",
  budgetLimitMinor: "Budget",
  destinationUrl: "Scan destination",
  deadline: "Deadline",
  countryCode: "Country",
  countryName: "Country",
  city: "City",
  centerLatitude: "Campaign centre",
  centerLongitude: "Campaign centre",
  radiusMeters: "Campaign radius",
  locationStrategy: "Location strategy",
};

function extractMissingFields(error: ClientApiError) {
  const details = error.details;

  if (!details || typeof details !== "object") return [];

  const fields = (details as { fields?: Record<string, unknown> }).fields;
  if (!fields || typeof fields !== "object") return [];

  return [
    ...new Set(Object.keys(fields).map((key) => fieldLabels[key] ?? key)),
  ];
}

export default function ReviewAndFundStep({
  campaign,
  onFunded,
}: {
  campaign: CampaignDto;
  onFunded: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const [quote, setQuote] = useState<CampaignQuoteResponse["quote"] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [funding, setFunding] = useState(false);

  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  const cancelRequest = useCallback(() => {
    ++requestSequence.current;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const loadQuote = useCallback(async () => {
    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError(null);
    setMissing([]);

    try {
      // POST recomputes deterministically and returns the existing draft when
      // nothing has changed, so it is safe to call on every visit.
      const response = await authenticatedFetch<CampaignQuoteResponse>(
        getAccessToken,
        `/api/campaigns/${campaign.id}/quote`,
        { method: "POST", signal: controller.signal },
      );

      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      setQuote(response.quote);
      setLoading(false);
    } catch (caught) {
      if (controller.signal.aborted || sequence !== requestSequence.current) {
        return;
      }

      if (caught instanceof ClientApiError) {
        setError(caught.message);
        setMissing(extractMissingFields(caught));
      } else {
        setError("Could not produce a quote for this campaign.");
      }
      setLoading(false);
    } finally {
      if (sequence === requestSequence.current) {
        requestController.current = null;
      }
    }
  }, [campaign.id, getAccessToken]);

  useEffect(() => {
    void loadQuote();
    return cancelRequest;
  }, [loadQuote, cancelRequest]);

  const [treasury, setTreasury] = useState<TreasuryDto | null>(null);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);
  const [toppingUp, setToppingUp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTreasury = useCallback(async () => {
    try {
      const response = await authenticatedFetch<TreasuryResponse>(getAccessToken, "/api/treasury");
      setTreasury(response.treasury);
      setTreasuryError(response.treasury.walletError);
    } catch (caught) {
      setTreasuryError(
        caught instanceof ClientApiError ? caught.message : "Could not load your treasury.",
      );
    }
  }, [getAccessToken]);

  useEffect(() => {
    void loadTreasury();
  }, [loadTreasury]);

  async function topUp() {
    setToppingUp(true);
    setError(null);
    try {
      const response = await authenticatedFetch<TreasuryResponse>(getAccessToken, "/api/treasury/top-up", {
        method: "POST",
      });
      setTreasury(response.treasury);
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "Could not add test funds.");
    } finally {
      setToppingUp(false);
    }
  }

  async function fund() {
    setFunding(true);
    setError(null);
    setNotice(null);

    try {
      const result = await authenticatedFetch<FundCampaignResult>(
        getAccessToken,
        `/api/campaigns/${campaign.id}/fund`,
        { method: "POST" },
      );

      if (result.status === "PENDING_APPROVAL") {
        setNotice(
          "This funding is above your approval threshold. A teammate can approve it on the Treasury page; the treasury pays as soon as they do.",
        );
        setFunding(false);
        return;
      }

      onFunded();
    } catch (caught) {
      setError(
        caught instanceof ClientApiError
          ? caught.message
          : "Could not fund this campaign.",
      );
      setFunding(false);
      void loadTreasury();
    }
  }

  const onchain = treasury?.onchain ?? false;
  const symbol = treasury?.token?.symbol ?? "USDC";
  const neededUnits = quote ? BigInt(quote.totalMinor) * BigInt(10_000) : null;
  const heldUnits = treasury?.balances ? BigInt(treasury.balances.tokenUnits) : null;
  const shortfall = neededUnits !== null && heldUnits !== null && heldUnits < neededUnits;
  const needsApproval =
    quote && treasury?.approvalThresholdMinor
      ? BigInt(quote.totalMinor) > BigInt(treasury.approvalThresholdMinor)
      : false;
  const fundDisabled =
    !quote || funding || loading || (onchain && (!treasury?.wallet || shortfall));

  const summaryRows: [string, string][] = [
    ["Campaign", campaign.name],
    ["Country", campaign.countryName ?? notSetLabel],
    ["City", campaign.city ?? notSetLabel],
    [
      "Area",
      campaign.radiusMeters && campaign.city
        ? `${formatRadius(campaign.radiusMeters)} around ${campaign.city}`
        : (campaign.areaLabel ?? notSetLabel),
    ],
    [
      "Placements",
      quote
        ? `${quote.pricedPlacementCount} approved ${
            quote.pricedPlacementCount === 1 ? "surface" : "surfaces"
          }`
        : (campaign.placementCount?.toString() ?? notSetLabel),
    ],
    [
      "Locations chosen by",
      campaign.locationStrategy === "MANUAL_SELECTION"
        ? "You"
        : "StickerBomb",
    ],
    ["Deadline", formatOptionalCampaignDate(campaign.deadline, true)],
    ["Destination", campaign.destinationUrl ?? notSetLabel],
  ];

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-[16px] font-bold tracking-[-0.01em]">
            Campaign summary
          </h2>
        </div>
        <dl className="grid gap-px bg-line sm:grid-cols-2">
          {summaryRows.map(([label, value]) => (
            <div key={label} className="bg-surface px-6 py-3.5">
              <dt className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">
                {label}
              </dt>
              <dd className="mt-1 break-words text-[14px] font-semibold">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-[16px] font-bold tracking-[-0.01em]">Quote</h2>
          <p className="text-[13px] text-muted">
            Calculated from a fixed rate card, so the same campaign always prices
            the same.
          </p>
        </div>

        {loading ? (
          <div className="p-6">
            <div className="h-40 animate-pulse rounded-xl bg-raised" />
          </div>
        ) : error ? (
          <div className="p-6">
            <p className="text-[13.5px] text-fail">{error}</p>
            {missing.length > 0 ? (
              <div className="mt-3 rounded-xl border border-fail/25 bg-fail/5 px-4 py-3">
                <p className="text-[12.5px] font-semibold text-fail">
                  Still needed
                </p>
                <ul className="mt-1.5 space-y-1">
                  {missing.map((label) => (
                    <li key={label} className="text-[12.5px] text-fail">
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void loadQuote()}
              className="mt-4 h-10 rounded-xl border border-line px-4 text-[13px] font-semibold hover:bg-raised"
            >
              Try again
            </button>
          </div>
        ) : quote ? (
          <>
            <table className="w-full">
              <tbody>
                {quote.lineItems.map((item) => (
                  <tr key={item.kind} className="border-b border-line">
                    <th
                      scope="row"
                      className="px-6 py-3 text-left text-[13.5px] font-medium text-muted"
                    >
                      {item.label}
                    </th>
                    <td className="px-6 py-3 text-right text-[13.5px] font-semibold tabular-nums">
                      {formatCampaignBudget(item.amount, quote.currency)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th
                    scope="row"
                    className="px-6 py-4 text-left text-[15px] font-bold"
                  >
                    Total
                  </th>
                  <td className="px-6 py-4 text-right text-[17px] font-extrabold tabular-nums">
                    {formatCampaignBudget(quote.total, quote.currency)}
                  </td>
                </tr>
              </tbody>
            </table>

            {quote.exceedsBudget && quote.budgetLimit ? (
              <p className="border-t border-line bg-raised px-6 py-3.5 text-[12.5px] leading-relaxed text-muted">
                This quote is above the{" "}
                {formatCampaignBudget(quote.budgetLimit, quote.currency)} budget
                in your brief. You can still fund it, or go back and reduce the
                number of placements.
              </p>
            ) : null}

            {quote.requestedPlacementCount !== null &&
            quote.pricedPlacementCount < quote.requestedPlacementCount ? (
              <p className="border-t border-line bg-raised px-6 py-3.5 text-[12.5px] leading-relaxed text-muted">
                You asked for {quote.requestedPlacementCount} placements and{" "}
                {quote.pricedPlacementCount} approved{" "}
                {quote.pricedPlacementCount === 1 ? "surface was" : "surfaces were"}{" "}
                available, so only those are priced.
              </p>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-6 py-5">
          <span className="inline-flex rounded-full border border-badge/40 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-badge">
            {onchain ? "Onchain escrow · Sepolia" : "Simulated payment"}
          </span>
          <h2 className="mt-4 text-[16px] font-bold">Fund from your treasury</h2>
          <p className="mt-2 max-w-[64ch] text-[13.5px] leading-relaxed text-muted">
            {onchain
              ? `Your organization's Privy wallet deposits the quote into CampaignEscrow. Privy's policy only lets it approve and fund the escrow, and workers are paid from escrow only after Chainlink confidential verification. You never sign or pay gas.`
              : "Escrow is not configured on this server, so funding approves the quote and issues posters without moving money."}
          </p>

          {onchain ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-raised/50 px-4 py-3.5 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Treasury</p>
                <p className="mt-1 font-mono text-[12.5px] font-semibold">
                  {treasury?.wallet
                    ? `${treasury.wallet.address.slice(0, 6)}…${treasury.wallet.address.slice(-4)}`
                    : treasuryError
                      ? "Unavailable"
                      : "Loading…"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">Available</p>
                <p className={`mt-1 text-[14px] font-bold tabular-nums ${shortfall ? "text-fail" : ""}`}>
                  {treasury?.balances ? `${treasury.balances.token} ${symbol}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">This campaign</p>
                <p className="mt-1 text-[14px] font-bold tabular-nums">
                  {quote ? `${quote.total} ${symbol}` : "—"}
                </p>
              </div>
            </div>
          ) : null}

          {treasuryError ? <p className="mt-3 text-[12.5px] text-fail">{treasuryError}</p> : null}
          {needsApproval ? (
            <p className="mt-3 text-[12.5px] text-badge">
              This is above your approval threshold, so a teammate will need to approve it.
            </p>
          ) : null}
          {notice ? <p className="mt-3 text-[12.5px] font-semibold text-paid">{notice}</p> : null}
          {error && quote ? <p className="mt-3 text-[12.5px] text-fail">{error}</p> : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">
          {funding ? (
            <span className="mr-auto text-[12.5px] text-muted">
              Signing with your Privy treasury and waiting for Sepolia. This takes about a minute.
            </span>
          ) : null}
          {onchain && shortfall && treasury?.token?.mintable ? (
            <button
              type="button"
              disabled={toppingUp || funding}
              onClick={() => void topUp()}
              className="h-11 rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised disabled:opacity-50"
            >
              {toppingUp ? "Adding test funds…" : `Add 500 test ${symbol}`}
            </button>
          ) : null}
          <button
            type="button"
            disabled={fundDisabled}
            onClick={() => void fund()}
            className="h-11 rounded-xl bg-solid px-5 text-[14.5px] font-semibold text-solid-ink transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {funding
              ? "Funding campaign…"
              : onchain && quote
                ? `Fund ${quote.total} ${symbol}`
                : "Fund campaign"}
          </button>
        </div>
      </Card>
    </div>
  );
}
