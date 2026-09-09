import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import AppShell from "@/components/AppShell";
import PrivyProviders from "@/components/PrivyProviders";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "StickerBomb",
  description: "Turn a sentence into a verified physical campaign.",
};

const themeScript = `(function(){try{var t=localStorage.getItem("sb-theme")||"dark";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${jakarta.variable} font-sans antialiased`}>
        <PrivyProviders>
          <AppShell>{children}</AppShell>
        </PrivyProviders>
      </body>
    </html>
  );
}
