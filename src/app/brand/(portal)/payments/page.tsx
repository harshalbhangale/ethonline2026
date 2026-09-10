import SectionPlaceholder from "@/components/brand/SectionPlaceholder";

export const metadata = {
  title: "Payments · StickerBomb",
};

export default function PaymentsPage() {
  return (
    <SectionPlaceholder
      title="Payments"
      sub="Follow campaign funding, worker payouts and the cleanup reserve."
      phase="Arrives in Phase 4"
      summary="Real funding runs through onchain escrow, which is Phase 4 work. Campaign funding in the wizard is currently a clearly-marked mock and moves no money."
      arriving={[
        "The campaign escrow funding transaction",
        "Installer and verifier payouts released after accepted verification",
        "The cleanup reserve held back until removal is proven",
        "Refunds for cancelled or unfulfilled placements",
      ]}
      dependsOn="Contract events become the financial source of truth once escrow is live, so nothing shown here will be derived from scan counts."
    />
  );
}
