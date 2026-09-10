import { redirect } from "next/navigation";

/** Legacy route from the mock prototype. Analytics now lives in the Brand Portal. */
export default function LegacyAnalyticsPage() {
  redirect("/brand/analytics");
}
