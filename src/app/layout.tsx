import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import PrivyProviders from "@/components/PrivyProviders";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "StickerBomb",
  description: "Turn a sentence into a verified physical campaign.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StickerBomb",
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
        <RegisterSW />
        <PrivyProviders>{children}</PrivyProviders>
      </body>
    </html>
  );
}
