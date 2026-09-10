import { Suspense } from "react";
import CampaignWizard from "@/components/campaigns/wizard/CampaignWizard";

export const metadata = {
  title: "New campaign · StickerBomb",
};

function WizardFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <span className="inline-flex h-11 items-center rounded-xl border border-line px-5 text-[13.5px] font-semibold text-muted">
        Opening the campaign wizard…
      </span>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<WizardFallback />}>
      <CampaignWizard />
    </Suspense>
  );
}
