import type { ReactNode } from "react";
import BrandAccessGate from "@/components/BrandAccessGate";

/**
 * Membership authorization for the whole Brand Portal, including the wizard.
 * The sidebar shell lives in the (portal) group so the wizard can render
 * full-screen without it.
 */
export default function BrandLayout({ children }: { children: ReactNode }) {
  return <BrandAccessGate>{children}</BrandAccessGate>;
}
