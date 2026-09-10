"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

export default function PrivyProviders({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-center">
        <div className="max-w-md rounded-[20px] border border-fail/30 bg-surface p-8">
          <h1 className="text-[20px] font-bold">Privy is not configured</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Add NEXT_PUBLIC_PRIVY_APP_ID to the environment and restart the
            application.
          </p>
        </div>
      </main>
    );
  }

  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Fewer login methods and no WalletConnect keep Privy's startup light:
        // WalletConnect alone added ~0.8 s of network calls to every page load.
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: "dark",
          walletChainType: "ethereum-only",
          walletList: ["detected_wallets", "metamask", "coinbase_wallet"],
        },
        externalWallets: {
          walletConnect: { enabled: false },
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
