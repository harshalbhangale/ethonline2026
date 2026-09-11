import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StickerBomb Worker",
    short_name: "StickerBomb",
    description: "Place posters, check placements, get paid.",
    start_url: "/worker",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      { src: "/logo_remove.png", sizes: "192x192", type: "image/png" },
      { src: "/logo_remove.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
