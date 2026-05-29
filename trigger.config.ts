import { defineConfig } from "@trigger.dev/sdk/v3";

/**
 * Trigger.dev v3 configuration for Sprouty.
 *
 * Tasks live in `trigger/` at the repo root. The project ref is read from
 * `TRIGGER_PROJECT_ID` (set in `.env.local`) so we don't hard-code it; the
 * trigger.dev CLI also picks the value up from the same env at deploy time.
 *
 * Run locally:
 *   npx trigger.dev@latest dev
 *
 * Deploy to trigger.dev cloud:
 *   npx trigger.dev@latest deploy
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "",
  dirs: ["./trigger"],
  runtime: "node",
  logLevel: "info",
  // Webhook tasks are usually short — bail at 60s instead of the 5-min default
  // so a hung downstream alert provider can't run up the bill.
  maxDuration: 60,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      randomize: true,
    },
  },
});
