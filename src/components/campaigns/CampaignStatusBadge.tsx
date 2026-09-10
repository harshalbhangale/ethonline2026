import type { CampaignStatusValue } from "@/lib/campaigns/types";
import { statusLabels } from "@/lib/campaigns/format";

const statusStyles: Record<CampaignStatusValue, string> = {
  DRAFT: "border-line text-muted",
  QUOTED: "border-badge/40 text-badge",
  FUNDED: "border-paid/40 text-paid",
  ASSETS_READY: "border-paid/40 text-paid",
  DEPLOYING: "border-scan/40 text-scan",
  VERIFYING: "border-badge/40 text-badge",
  LIVE: "border-paid/40 text-paid",
  EXPIRED: "border-line text-faint",
  REMOVING: "border-scan/40 text-scan",
  COMPLETE: "border-paid/40 text-paid",
  CANCELLED: "border-fail/40 text-fail",
  DISPUTED: "border-fail/40 text-fail",
};

export default function CampaignStatusBadge({
  status,
}: {
  status: CampaignStatusValue;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.08em] ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
