"use client";

import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ReceiptPrinter,
  type ReceiptPrinterStage,
} from "@/components/motion/ReceiptPrinter";
import { explorerTxUrl, shortHex } from "@/lib/chain/explorer";
import type { CampaignQuoteResponse } from "@/lib/quotes/types";

type Quote = NonNullable<CampaignQuoteResponse["quote"]>;

export type FundingReceiptData = {
  txHash: string | null;
  fundingReference: string;
  mocked: boolean;
};

/**
 * The moment the money moves, shown as a receipt printing out.
 *
 * While the treasury transaction is in flight the printer sits on
 * "processing" (it's a real Sepolia transaction, about a minute); when it
 * lands the receipt feeds out with the quote and the transaction on it.
 */
export default function FundingReceipt({
  campaignName,
  placements,
  quote,
  symbol,
  onchain,
  result,
  onDone,
}: {
  campaignName: string;
  placements: number;
  quote: Quote;
  symbol: string;
  onchain: boolean;
  /** Null while funding is still in flight. */
  result: FundingReceiptData | null;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<ReceiptPrinterStage>("processing");

  useEffect(() => {
    if (!result) {
      setStage("processing");
      return;
    }
    setStage("printing");
    const timer = window.setTimeout(() => setStage("complete"), 1_900);
    return () => window.clearTimeout(timer);
  }, [result]);

  const unit = onchain ? symbol : quote.currency;
  const printedAt = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 px-4 pt-[8vh] pb-10 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Funding receipt"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="flex w-full max-w-sm flex-col items-center"
      >
        <ReceiptPrinter.Root stage={stage} aria-label="Funding receipt">
          <ReceiptPrinter.Machine>
            <ReceiptPrinter.Header>
              <Image src="/logo_remove.png" alt="" width={120} height={72} className="h-6 w-auto object-contain" />
              <span className="pt-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
                Escrow · Sepolia
              </span>
            </ReceiptPrinter.Header>

            <ReceiptPrinter.Screen>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{campaignName}</p>
                    <p className="text-[12px] text-muted">
                      {placements} placement{placements === 1 ? "" : "s"}
                    </p>
                  </div>
                  <strong className="shrink-0 font-mono text-[15px] tabular-nums">
                    {quote.total} {unit}
                  </strong>
                </div>
                <ReceiptPrinter.Status
                  labels={{
                    processing: onchain
                      ? "Treasury signing · waiting for Sepolia"
                      : "Approving the quote",
                    printing: "Printing your receipt",
                    complete: onchain ? "Locked in escrow" : "Campaign funded",
                  }}
                />
              </div>
            </ReceiptPrinter.Screen>
          </ReceiptPrinter.Machine>

          <ReceiptPrinter.Output>
            <ReceiptPrinter.Paper>
              <div className="text-center">
                <p className="text-[13px] font-bold tracking-[0.2em]">STICKERBOMB</p>
                <p className="mt-0.5 text-[10.5px] opacity-60">Campaign funding receipt</p>
              </div>

              <div className="my-4 border-t border-dashed border-black/30" />

              <p className="truncate font-semibold">{campaignName}</p>
              <p className="text-[11px] opacity-60">{printedAt}</p>

              <dl className="mt-4 space-y-1.5">
                {quote.lineItems.map((item) => (
                  <div key={item.kind} className="flex justify-between gap-3">
                    <dt className="truncate opacity-75">{item.label}</dt>
                    <dd className="shrink-0 tabular-nums">{item.amount}</dd>
                  </div>
                ))}
              </dl>

              <div className="my-4 border-t border-dashed border-black/30" />

              <div className="flex justify-between text-[14px] font-bold">
                <span>TOTAL</span>
                <span className="tabular-nums">
                  {quote.total} {unit}
                </span>
              </div>

              <div className="my-4 border-t border-dashed border-black/30" />

              <dl className="space-y-1 text-[11px]">
                {result?.txHash ? (
                  <div className="flex justify-between gap-3">
                    <dt className="opacity-60">Tx</dt>
                    <dd>
                      <a
                        href={explorerTxUrl(result.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {shortHex(result.txHash)}
                      </a>
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="opacity-60">Held by</dt>
                  <dd>{onchain && !result?.mocked ? "CampaignEscrow" : "Quote approved"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="opacity-60">Released</dt>
                  <dd>per verified poster</dd>
                </div>
              </dl>

              <p className="mt-5 text-center text-[10.5px] leading-relaxed opacity-60">
                Workers are paid from escrow only after Chainlink confirms each
                poster is up. Thanks for putting it on the street.
              </p>
            </ReceiptPrinter.Paper>
          </ReceiptPrinter.Output>
        </ReceiptPrinter.Root>

        <AnimatePresence>
          {stage === "complete" ? (
            <motion.button
              type="button"
              onClick={onDone}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.1 }}
              whileTap={{ scale: 0.97 }}
              className="mt-6 flex h-11 items-center gap-2 rounded-xl bg-solid px-5 text-[14px] font-semibold text-solid-ink shadow-xl"
            >
              View campaign
              <ArrowRightIcon aria-hidden size={15} weight="bold" />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
