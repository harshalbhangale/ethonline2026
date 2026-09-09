import BriefComposer from "@/components/BriefComposer";
import HowItWorks from "@/components/HowItWorks";
import { PageHeading } from "@/components/ui";

export default function Home() {
  return (
    <>
      <PageHeading
        title="Start a campaign"
        sub="Say what you want placed, where, and by when. StickerBomb handles printing, placement, proof and removal."
      />
      <HowItWorks />
      <BriefComposer />
    </>
  );
}
