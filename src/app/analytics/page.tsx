import {
  ScanTrend,
  ScansByPlace,
  ScansByTime,
  StatRow,
} from "@/components/Charts";
import { PageHeading } from "@/components/ui";

export default function Analytics() {
  return (
    <>
      <PageHeading
        title="Analytics"
        sub="How your placements are performing in the real world."
      />

      <div className="space-y-4">
        <StatRow />
        <div className="grid gap-4 lg:grid-cols-2">
          <ScansByTime />
          <ScanTrend />
        </div>
        <ScansByPlace />
      </div>
    </>
  );
}
