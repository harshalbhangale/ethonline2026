import SectionPlaceholder from "@/components/brand/SectionPlaceholder";

export const metadata = {
  title: "Placements · StickerBomb",
};

export default function PlacementsPage() {
  return (
    <SectionPlaceholder
      title="Placements"
      sub="Track every physical asset from installation through independent verification."
      phase="Arrives in Phase 3"
      summary="Placement tracking needs the Worker PWA that installs and verifies assets. Until a worker can accept a job and submit proof, there is nothing real to show here."
      arriving={[
        "Each assigned approved location and its exact placement point",
        "Installation status and the installer's submitted evidence",
        "Independent verification by a different participant",
        "Cleanup and removal progress after a campaign expires",
      ]}
      dependsOn="Exact placement points stay hidden until a worker accepts the job, so this view will show approximate areas until verification completes."
    />
  );
}
