import type { NextConfig } from "next";

/** Optional peer dependencies that are intentionally absent. */
const unusedOptionalModules = ["@farcaster/mini-app-solana"];

const nextConfig: NextConfig = {
  /**
   * `next dev` and `next build` share `.next` by default, and a production build
   * run while a dev server is live overwrites its chunks, causing
   * "Cannot find module ./vendor-chunks/..." at runtime.
   *
   * Set NEXT_DIST_DIR to build or serve from a separate directory when a dev
   * server needs to keep running.
   */
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",

  turbopack: {
    // Turbopack ignores the webpack() hook below, and resolveAlias only accepts
    // a module path, so unused optional peers point at an empty stub.
    resolveAlias: Object.fromEntries(
      unusedOptionalModules.map((request) => [
        request,
        "./src/lib/empty-module.ts",
      ]),
    ),
  },

  // Retained so a webpack build still resolves identically.
  webpack(config) {
    for (const request of unusedOptionalModules) {
      config.resolve.alias[request] = false;
    }
    return config;
  },
};

export default nextConfig;
