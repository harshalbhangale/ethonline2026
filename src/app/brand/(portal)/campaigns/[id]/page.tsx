import CampaignDetails from "@/components/campaigns/CampaignDetails";

type CampaignPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;
  return <CampaignDetails campaignId={id} />;
}
