#!/usr/bin/env node
/**
 * Unpackaged `electron .` always docks as "Electron" with the stock icon —
 * macOS reads CFBundleName / electron.icns from the .app bundle.
 *
 * Copy Electron.app → .runtime/Vibe UI OSS.app, stamp name + icon, then launch.
 * Named distinctly from stock Mistral Vibe so both can sit in the Dock.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "Vibe UI OSS";
const APP_ID = "local.lechonk.vibe-ui-oss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcApp = path.join(
  root,
  "node_modules",
  "electron",
  "dist",
  "Electron.app",
);
const destApp = path.join(root, ".runtime", `${APP_NAME}.app`);
const legacyApp = path.join(root, ".runtime", "Vibe.app");
const iconSrc = [
  path.join(root, "build", "vibe.icns"),
  path.join(root, "build", "icon.icns"),
].find((p) => existsSync(p));
const marker = path.join(destApp, "Contents", "Resources", ".lechonk-brand");
const binary = path.join(destApp, "Contents", "MacOS", "Electron");

function plistSet(plist, key, value) {
  try {
    execFileSync("/usr/libexec/PlistBuddy", [
      "-c",
      `Set :${key} ${value}`,
      plist,
    ]);
  } catch {
    execFileSync("/usr/libexec/PlistBuddy", [
      "-c",
      `Add :${key} string ${value}`,
      plist,
    ]);
  }
}

if (!existsSync(srcApp)) {
  console.error(`Electron.app missing at ${srcApp}`);
  process.exit(1);
}
if (!iconSrc) {
  console.error("Missing build/vibe.icns (or build/icon.icns)");
  process.exit(1);
}

mkdirSync(path.dirname(destApp), { recursive: true });
// Drop the old "Vibe.app" brand so Dock/TCC don't collide with this rename.
if (existsSync(legacyApp)) {
  rmSync(legacyApp, { recursive: true, force: true });
}

const electronPlist = path.join(srcApp, "Contents", "Info.plist");
const needsCopy =
  !existsSync(binary) ||
  !existsSync(marker) ||
  statSync(electronPlist).mtimeMs > statSync(marker).mtimeMs;

if (needsCopy) {
  rmSync(destApp, { recursive: true, force: true });
  cpSync(srcApp, destApp, { recursive: true, dereference: true });
}

const resources = path.join(destApp, "Contents", "Resources");
const plist = path.join(destApp, "Contents", "Info.plist");
cpSync(iconSrc, path.join(resources, "electron.icns"));
plistSet(plist, "CFBundleName", APP_NAME);
plistSet(plist, "CFBundleDisplayName", APP_NAME);
plistSet(plist, "CFBundleIdentifier", APP_ID);
writeFileSync(marker, `${new Date().toISOString()}\n${iconSrc}\n${APP_NAME}\n`);

// Ad-hoc sign with a stable identifier. Stock Electron uses id "Electron", so
// every ensure:app copy looks like a new app to TCC and Accessibility / Screen
// Recording grants vanish. Prefer signing the main binary + helpers (not
// --deep): Electron Framework.framework is ambiguous to codesign.
const sign = (target, identifier) => {
  try {
    execFileSync(
      "codesign",
      ["--force", "--sign", "-", "--identifier", identifier, target],
      { stdio: "pipe" },
    );
  } catch (err) {
    console.error(`codesign warning (${identifier}): ${err?.message || err}`);
  }
};
sign(binary, APP_ID);
const frameworks = path.join(destApp, "Contents", "Frameworks");
if (existsSync(frameworks)) {
  for (const name of [
    "Electron Helper.app",
    "Electron Helper (GPU).app",
    "Electron Helper (Plugin).app",
    "Electron Helper (Renderer).app",
  ]) {
    const helperApp = path.join(frameworks, name);
    if (existsSync(helperApp)) {
      sign(helperApp, `${APP_ID}.${name.replace(/[ ()]/g, "-")}`);
    }
  }
}

// Bundle computer-use helper inside the app so TCC prompts attribute to us.
const wcSrc = path.resolve(root, "../cli/.native-build/window-control");
const wcDst = path.join(destApp, "Contents", "MacOS", "window-control");
if (existsSync(wcSrc)) {
  cpSync(wcSrc, wcDst);
  try {
    execFileSync("chmod", ["+x", wcDst], { stdio: "pipe" });
  } catch {
    /* ignore */
  }
  sign(wcDst, `${APP_ID}.window-control`);
}

console.error(`Branded runtime: ${destApp}`);
