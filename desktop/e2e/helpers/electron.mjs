import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const electronBinary = path.join(
  root,
  "node_modules",
  "electron",
  "dist",
  "Electron.app",
  "Contents",
  "MacOS",
  "Electron",
);

/**
 * Launch the desktop app under Playwright's Electron harness.
 * Uses an isolated userData dir and a dedicated CDP port so a manual
 * `npm start` session can keep running on 9333.
 *
 * Video recording requires Playwright's ffmpeg binary:
 *   npx playwright install ffmpeg
 * Without it, `recordVideo` leaves the window URL empty and hangs.
 */
export async function launchApp(testInfo) {
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const userDataDir = path.join(root, "e2e", "artifacts", "user-data", runId);
  fs.mkdirSync(userDataDir, { recursive: true });

  const videoDir = testInfo.outputPath("video");
  fs.mkdirSync(videoDir, { recursive: true });

  const app = await electron.launch({
    executablePath: fs.existsSync(electronBinary) ? electronBinary : undefined,
    args: [".", `--user-data-dir=${userDataDir}`],
    cwd: root,
    env: {
      ...process.env,
      VIBE_UI_CDP_PORT: String(9400 + (testInfo.workerIndex % 50)),
      VIBE_UI_E2E: "1",
      // Keep e2e app-servers from colliding with a manual npm start session.
      VIBE_HOME: path.join(root, "e2e", "artifacts", "vibe-home", runId),
    },
    recordVideo: {
      dir: videoDir,
      size: { width: 1440, height: 900 },
    },
    timeout: 45_000,
  });

  const window = await app.firstWindow();
  await window.locator(".shell").waitFor({ state: "visible", timeout: 30_000 });
  return { app, window, userDataDir };
}

export async function closeApp(app, window, testInfo) {
  if (!app) return;
  try {
    const video = window?.video?.();
    await app.close();
    if (video && testInfo) {
      const videoPath = await video.path();
      if (videoPath && fs.existsSync(videoPath)) {
        await testInfo.attach("video", {
          path: videoPath,
          contentType: "video/webm",
        });
      }
    }
  } catch {
    try {
      await app.close();
    } catch {
      /* already closed */
    }
  }
}

export async function shot(window, testInfo, name) {
  const dir = testInfo.outputPath("shots");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await window.screenshot({ path: file, fullPage: false });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
  return file;
}
