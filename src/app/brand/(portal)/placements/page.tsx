import PlacementBoard from "@/components/placements/PlacementBoard";
import { PageHeading } from "@/components/ui";

export const metadata = {
  title: "Placements · StickerBomb",
};

export default function PlacementsPage() {
  return (
    <>
      <PageHeading
        title="Placements"
        sub="Track every physical asset from installation through independent verification."
      />
      <PlacementBoard showCampaign />
    </>
  );
}
