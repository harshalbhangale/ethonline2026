"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

export default function PrivyProviders({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "NEXT_PUBLIC_PRIVY_APP_ID is not set — wallet sign-in is disabled. Add it to .env.local."
      );
    }
    return <>{children}</>;
  }

  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "dark",
          walletChainType: "ethereum-only",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: isHttps ? "users-without-wallets" : "off",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
