// Runs a TypeScript script against the app's server modules (with the "@/"
// alias and .env loaded), without a separate build step.
//
//   node scripts/run-ts.cjs scripts/e2e-sepolia.ts
require("dotenv").config({ quiet: true });

const path = require("node:path");
const { createJiti } = require("jiti");

const root = path.resolve(__dirname, "..");
const jiti = createJiti(path.join(root, "/"), {
  alias: { "@": path.join(root, "src") },
});

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/run-ts.cjs <script.ts>");
  process.exit(1);
}

jiti.import(path.resolve(target)).catch((error) => {
  console.error(error);
  process.exit(1);
});
