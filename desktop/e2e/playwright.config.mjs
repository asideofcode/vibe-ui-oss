import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "e2e", "artifacts");

export default defineConfig({
  testDir: path.join(root, "e2e", "tests"),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(artifacts, "report"), open: "never" }],
  ],
  outputDir: path.join(artifacts, "test-output"),
  use: {
    // Electron videos: launch({ recordVideo }) in helpers/electron.mjs
    // (config `video` only applies to browser projects). Needs:
    //   npx playwright install ffmpeg
    trace: "on",
    screenshot: "on",
    viewport: { width: 1440, height: 900 },
  },
  metadata: {
    appRoot: root,
  },
});
