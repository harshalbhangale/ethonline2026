import { Suspense } from "react";
import BrandDashboard from "@/components/campaigns/BrandDashboard";
import CampaignWizard from "@/components/campaigns/wizard/CampaignWizard";

export const metadata = {
  title: "New campaign · StickerBomb",
};

/**
 * The wizard opens as a large dialog over the campaign list, which stays
 * visible behind it. The URL keeps the draft and step, so refresh resumes.
 */
export default function NewCampaignPage() {
  return (
    <>
      <BrandDashboard />
      <Suspense fallback={null}>
        <CampaignWizard />
      </Suspense>
    </>
  );
}
