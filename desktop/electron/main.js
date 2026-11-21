"use strict";

const { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { AppServerClient } = require("./app-server");
const terminal = require("./terminal");

const CLI_ROOT = path.resolve(__dirname, "..", "..", "cli");
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const APP_ICON_ICNS = path.join(DESKTOP_ROOT, "build", "vibe.icns");
const APP_ICON_PNG = path.join(
  DESKTOP_ROOT,
  "renderer",
  "public",
  "brand",
  "icon-512.png",
);
const APP_ICON = fs.existsSync(APP_ICON_ICNS) ? APP_ICON_ICNS : APP_ICON_PNG;
// Optional remote-debugging port (e2e / local DevTools). 9222 is often Chrome.
const DEBUG_PORT = Number(process.env.VIBE_UI_CDP_PORT || 9333);
const RUNTIME_DIR = path.join(DESKTOP_ROOT, ".runtime");
const CDP_INFO_PATH = path.join(RUNTIME_DIR, "cdp.json");

// Unpackaged `electron .` otherwise keeps the stock "Electron" name/menu.
// Distinct from stock Mistral "Vibe" so both can be demoed side by side.
const APP_DISPLAY_NAME = "Vibe UI OSS";
app.setName(APP_DISPLAY_NAME);
if (process.platform === "darwin") {
  app.setAboutPanelOptions({
    applicationName: APP_DISPLAY_NAME,
    applicationVersion: app.getVersion() || "0.1.0",
    copyright: "asideofcode",
  });
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {AppServerClient | null} */
let client = null;
/** @type {string | null} */
let sessionId = null;
/** @type {string | null} */
let workspaceCwd = path.resolve(DESKTOP_ROOT, "..");

app.commandLine.appendSwitch("remote-debugging-port", String(DEBUG_PORT));
app.commandLine.appendSwitch("remote-allow-origins", "*");

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function writeCdpInfo() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(
    CDP_INFO_PATH,
    JSON.stringify(
      {
        port: DEBUG_PORT,
        browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function clearCdpInfo() {
  try {
    fs.unlinkSync(CDP_INFO_PATH);
  } catch {
    /* ignore */
  }
}

/** Ask macOS to list Vibe under Accessibility / Screen Recording. */
function promptComputerUsePermissions() {
  const bundled = path.join(path.dirname(process.execPath), "window-control");
  const fallback = path.join(
    CLI_ROOT,
    ".native-build",
    "window-control",
  );
  const helper = fs.existsSync(bundled) ? bundled : fallback;
  if (!fs.existsSync(helper)) return;
  try {
    const child = spawn(helper, ["permissions"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    /* ignore — user can grant manually */
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: APP_DISPLAY_NAME,
    backgroundColor: "#0b0b0d",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Vite builds the React shell into renderer/dist (see npm run build:ui).
  mainWindow.loadFile(
    path.join(__dirname, "..", "renderer", "dist", "index.html"),
  );
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const SKIP_DIR_CHILDREN = new Set([
  ".git",
  ".venv",
  "node_modules",
  ".runtime",
  ".native-build",
  "dist",
  "out",
]);

function listDirTree(root, depth, maxDepth) {
  if (depth > maxDepth) {
    return [];
  }
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  for (const entry of entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) {
      return a.isDirectory() ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  })) {
    if (entry.name.startsWith(".") && entry.name !== ".gitignore") {
      continue;
    }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const skipChildren = SKIP_DIR_CHILDREN.has(entry.name);
      nodes.push({
        name: entry.name,
        path: full,
        type: "dir",
        open: depth < 1 && !skipChildren,
        children: skipChildren
          ? []
          : listDirTree(full, depth + 1, maxDepth),
        truncated: skipChildren,
      });
    } else {
      nodes.push({ name: entry.name, path: full, type: "file" });
    }
  }
  return nodes;
}

const TEXT_READ_MAX_BYTES = 1_500_000;
const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".dylib",
  ".so",
  ".o",
  ".wasm",
  ".mp4",
  ".mov",
  ".mp3",
]);

function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}

async function ensureClient() {
  if (client?.ready) {
    return client;
  }
  if (client) {
    await client.close();
    client = null;
  }

  const next = new AppServerClient({ cliRoot: CLI_ROOT });
  next.on("stderr", (text) => send("server:log", { stream: "stderr", text }));
  next.on("error", (err) =>
    send("server:status", { state: "error", message: err.message }),
  );
  next.on("exit", ({ code, signal }) => {
    client = null;
    sessionId = null;
    send("server:status", {
      state: "disconnected",
      message: `Server exited (${code ?? signal})`,
    });
  });
  next.on("notification", (message) => {
    send("rpc:notification", message);
  });
  next.on("request", async (message) => {
    if (message.method === "callback/call") {
      const callback = message.params?.callback;
      next.respond(message.id, {
        callbackId: callback?.callbackId,
        accepted: true,
      });
      // Auto-approve computer-use MCP tools so click/type aren't blocked by a
      // stale session or a missing [tools.computer-use_*] always grant.
      const toolName = String(
        callback?.detail?.effect?.toolName ||
          callback?.detail?.effect?.name ||
          callback?.title ||
          "",
      );
      const autoComputerUse =
        callback?.detail?.kind === "approval" &&
        /computer[-_]?use|mcp_computer_use/i.test(toolName);
      if (autoComputerUse && sessionId) {
        try {
          await next.request("callback/result", {
            sessionId,
            result: {
              callbackId: callback.callbackId,
              output: {
                type: "approval",
                decision: { type: "approve" },
              },
            },
          });
          return;
        } catch (err) {
          send("server:log", {
            stream: "stderr",
            text: `auto-approve computer-use failed: ${err?.message || err}`,
          });
        }
      }
      send("rpc:callback", callback);
      return;
    }
    next.respond(message.id, null, {
      code: -32601,
      message: `Unsupported server request: ${message.method}`,
    });
  });

  next.start();
  const init = await next.initialize(
    {
      name: "vibe-ui-oss",
      version: app.getVersion() || "0.1.0",
      title: APP_DISPLAY_NAME,
      entrypoint: "unknown",
    },
    {
      callbackKinds: ["approval", "user_input"],
    },
  );

  client = next;
  send("server:status", {
    state: "connected",
    server: init.serverInfo,
    processId: init.processId,
  });
  return client;
}

ipcMain.handle("app:getBootstrap", async () => ({
  cliRoot: CLI_ROOT,
  workspaceCwd,
  sessionId,
  cdpPort: DEBUG_PORT,
  appName: APP_DISPLAY_NAME,
}));

ipcMain.handle("workspace:pick", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    defaultPath: workspaceCwd || CLI_ROOT,
  });
  if (result.canceled || !result.filePaths[0]) {
    return workspaceCwd;
  }
  workspaceCwd = result.filePaths[0];
  return workspaceCwd;
});

ipcMain.handle("workspace:set", async (_event, cwd) => {
  if (typeof cwd === "string" && cwd.trim()) {
    workspaceCwd = cwd.trim();
  }
  return workspaceCwd;
});

ipcMain.handle("workspace:list", async (_event, cwd, depth = 2) => {
  const root = typeof cwd === "string" && cwd.trim() ? cwd.trim() : workspaceCwd;
  return listDirTree(root, 0, Number(depth) || 2);
});

const ATTACHMENTS_ROOT = path.join(
  os.homedir(),
  ".vibe",
  "logs",
  "session",
  "unified",
);
const IMAGE_MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function fileUriToPath(uriOrPath) {
  if (typeof uriOrPath !== "string" || !uriOrPath.trim()) {
    throw new Error("Missing path");
  }
  let raw = uriOrPath.trim();
  if (raw.startsWith("file://")) {
    try {
      raw = decodeURIComponent(new URL(raw).pathname);
    } catch {
      throw new Error("Invalid file URI");
    }
  }
  return path.resolve(raw);
}

function isUnderHome(resolved) {
  const home = path.resolve(os.homedir());
  return resolved === home || resolved.startsWith(home + path.sep);
}

function isSessionAttachment(resolved) {
  const root = path.resolve(ATTACHMENTS_ROOT);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return false;
  const parts = resolved.slice(root.length).split(path.sep).filter(Boolean);
  return parts.length >= 3 && parts[1] === "attachments";
}

function resolveLocalImagePath(uriOrPath) {
  const resolved = fileUriToPath(uriOrPath);
  if (!isSessionAttachment(resolved) && !isUnderHome(resolved)) {
    throw new Error("Path is outside allowed local folders");
  }
  return resolved;
}

async function readLocalImage(uriOrPath) {
  const resolved = resolveLocalImagePath(uriOrPath);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (err) {
    throw new Error(err.message || "Unable to read image");
  }
  if (!stat.isFile()) {
    throw new Error("Not a file");
  }
  if (stat.size > 12 * 1024 * 1024) {
    throw new Error("Image is too large");
  }
  const ext = path.extname(resolved).toLowerCase();
  const mimeType = IMAGE_MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new Error("Unsupported image type");
  }
  const buf = fs.readFileSync(resolved);
  return {
    path: resolved,
    mimeType,
    dataUrl: `data:${mimeType};base64,${buf.toString("base64")}`,
  };
}

ipcMain.handle("attachments:readImage", async (_event, uriOrPath) =>
  readLocalImage(uriOrPath),
);

ipcMain.handle("local:readImage", async (_event, uriOrPath) =>
  readLocalImage(uriOrPath),
);

ipcMain.handle("local:openPath", async (_event, uriOrPath) => {
  const resolved = fileUriToPath(uriOrPath);
  if (!isUnderHome(resolved) && !isSessionAttachment(resolved)) {
    throw new Error("Path is outside allowed local folders");
  }
  const err = await shell.openPath(resolved);
  if (err) throw new Error(err);
  return { path: resolved };
});

ipcMain.handle("workspace:readFile", async (_event, filePath) => {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("Missing file path");
  }
  const resolved = path.resolve(filePath.trim());
  const root = path.resolve(workspaceCwd || "");
  if (root && resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Path is outside the workspace");
  }
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (err) {
    throw new Error(err.message || "Unable to read file");
  }
  if (!stat.isFile()) {
    throw new Error("Not a file");
  }
  const ext = path.extname(resolved).toLowerCase();
  if (BINARY_EXT.has(ext) || stat.size > TEXT_READ_MAX_BYTES) {
    return {
      path: resolved,
      name: path.basename(resolved),
      binary: true,
      size: stat.size,
      content: null,
      language: languageFromPath(resolved),
    };
  }
  const buf = fs.readFileSync(resolved);
  if (looksBinary(buf)) {
    return {
      path: resolved,
      name: path.basename(resolved),
      binary: true,
      size: stat.size,
      content: null,
      language: languageFromPath(resolved),
    };
  }
  return {
    path: resolved,
    name: path.basename(resolved),
    binary: false,
    size: stat.size,
    content: buf.toString("utf8"),
    language: languageFromPath(resolved),
  };
});

function languageFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".json": "json",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".htm": "html",
    ".md": "markdown",
    ".markdown": "markdown",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".toml": "ini",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".sql": "sql",
    ".xml": "xml",
    ".svg": "xml",
  };
  return map[ext] || "plaintext";
}

function agentConfigFor(cwd = workspaceCwd) {
  return {
    cwd,
    trustWorkspace: true,
  };
}

/** Best-effort: who holds ~/.vibe/logs/session/active/<id>.lock.json */
function describeSessionLockHolder(id) {
  try {
    const lockPath = path.join(
      os.homedir(),
      ".vibe",
      "logs",
      "session",
      "active",
      `${id}.lock.json`,
    );
    const raw = fs.readFileSync(lockPath, "utf8");
    const meta = JSON.parse(raw);
    const pid = meta?.process_id;
    if (!pid) return null;
    let cmd = "";
    try {
      cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
        encoding: "utf8",
      }).trim();
    } catch {
      return `stale lock pid ${pid}`;
    }
    if (/\/Applications\/Vibe\.app\//.test(cmd)) return "stock Vibe.app";
    if (/vibe-ui-oss\/desktop|\.runtime\/Vibe UI OSS\.app|\.runtime\/Vibe\.app/.test(cmd)) {
      return `another Vibe UI OSS window (pid ${pid})`;
    }
    if (/vibe-app-server/.test(cmd)) return `vibe-app-server pid ${pid}`;
    return `pid ${pid}`;
  } catch {
    return null;
  }
}

function attachSessionResult(result) {
  const session = result?.state?.session;
  if (!session?.id) {
    throw new Error("App-server returned no session");
  }
  sessionId = session.id;
  const history = result.state.history || [];
  const activeCallbacks = result.state.activeCallbacks || [];
  send("session:ready", {
    sessionId,
    session,
    history,
    activeCallbacks,
  });
  return {
    sessionId,
    session,
    history,
    activeCallbacks,
  };
}

ipcMain.handle("server:connect", async () => {
  const c = await ensureClient();
  return { ok: true, ready: c.ready };
});

ipcMain.handle("session:list", async (_event, cwd) => {
  const c = await ensureClient();
  const root =
    typeof cwd === "string" && cwd.trim() ? cwd.trim() : workspaceCwd;
  const result = await c.request("session/list", {
    cwd: root,
    limit: 50,
  });
  return {
    items: result.items || [],
    nextCursor: result.nextCursor || null,
  };
});

ipcMain.handle("session:start", async () => {
  const c = await ensureClient();
  const result = await c.request("session/start", {
    agentConfig: agentConfigFor(),
    historyLimit: 200,
  });
  return attachSessionResult(result);
});

ipcMain.handle("session:resume", async (_event, id) => {
  if (!id || typeof id !== "string") {
    throw new Error("sessionId required");
  }
  const c = await ensureClient();
  // Already attached in this process — re-read instead of resume. A second
  // session/resume would try to re-acquire the on-disk lease and throw
  // "Session is already open" even though we hold it.
  if (sessionId === id) {
    const result = await c.request("session/read", {
      sessionId: id,
      history: { limit: 200 },
    });
    return attachSessionResult(result);
  }
  // Do NOT session/stop first — in non-multiplex mode stop can tear down the
  // app-server process. session/resume replaces the attached root in-place.
  try {
    const result = await c.request("session/resume", {
      sessionId: id,
      agentConfig: agentConfigFor(),
      historyLimit: 200,
    });
    return attachSessionResult(result);
  } catch (err) {
    const msg = String(err?.message || err || "");
    const busy =
      err?.rpc?.code === "conflict" ||
      err?.rpc?.data?.harnessCode === "session_busy" ||
      /already open|session_busy/i.test(msg);
    if (busy) {
      const holder = describeSessionLockHolder(id);
      // Electron IPC only preserves Error.message across the boundary.
      throw new Error(
        holder
          ? `Session is already open elsewhere (${id.slice(0, 8)}; ${holder}). Quit the other Vibe window and try again.`
          : `Session is already open elsewhere (${id.slice(0, 8)}). Quit the other Vibe window and try again.`,
      );
    }
    throw err;
  }
});

ipcMain.handle("session:continue", async () => {
  const c = await ensureClient();
  const result = await c.request("session/continue", {
    agentConfig: agentConfigFor(),
    historyLimit: 200,
  });
  return attachSessionResult(result);
});

ipcMain.handle("identity:read", async () => {
  if (!sessionId) {
    throw new Error("No active session");
  }
  const c = await ensureClient();
  const result = await c.request("identity/read", { sessionId });
  return result.identity || null;
});

ipcMain.handle("session:read", async (_event, id) => {
  const target = id || sessionId;
  if (!target) throw new Error("No active session");
  const c = await ensureClient();
  const result = await c.request("session/read", {
    sessionId: target,
    history: { limit: 200 },
  });
  return attachSessionResult(result);
});

ipcMain.handle("config:read", async () => {
  if (!sessionId) throw new Error("No active session");
  const c = await ensureClient();
  try {
    const result = await c.request("config/effective/read", { sessionId });
    return result.config || result;
  } catch {
    const result = await c.request("config/read", { sessionId });
    return result.config || result;
  }
});

ipcMain.handle("config:modelWrite", async (_event, payload) => {
  if (!sessionId) throw new Error("No active session");
  const c = await ensureClient();
  const modelAlias =
    payload?.modelAlias || payload?.model_alias || payload?.model;
  if (!modelAlias) throw new Error("modelAlias required");
  return c.request("config/model/write", {
    sessionId,
    modelAlias,
    reasoningEffort: payload?.reasoningEffort || payload?.reasoning_effort,
    sessionOnly:
      payload?.sessionOnly ?? payload?.session_only ?? true,
  });
});

ipcMain.handle("turn:start", async (_event, text) => {
  if (!client || !sessionId) {
    throw new Error("No active session");
  }
  if (!text || !String(text).trim()) {
    throw new Error("Empty prompt");
  }
  return client.request("turn/start", {
    sessionId,
    message: [{ type: "text", text: String(text) }],
  });
});

ipcMain.handle("turn:interrupt", async (_event, payload = {}) => {
  if (!client || !sessionId) {
    throw new Error("No active session");
  }
  const expectedTurnId =
    payload?.expectedTurnId ||
    payload?.expected_turn_id ||
    payload?.turnId ||
    payload?.turn_id;
  if (!expectedTurnId) {
    throw new Error("expectedTurnId required");
  }
  return client.request("turn/interrupt", {
    sessionId,
    expectedTurnId,
  });
});

ipcMain.handle("callback:answer", async (_event, payload) => {
  if (!client || !sessionId) {
    throw new Error("No active session");
  }
  const { callbackId, decision } = payload;
  return client.request("callback/result", {
    sessionId,
    result: {
      callbackId,
      output: {
        type: "approval",
        decision: { type: decision },
      },
    },
  });
});

ipcMain.handle("session:stop", async () => {
  if (!client || !sessionId) {
    return { ok: true };
  }
  try {
    await client.request("session/stop", { sessionId });
  } catch (err) {
    send("server:log", { stream: "stderr", text: String(err) });
  }
  sessionId = null;
  return { ok: true };
});

ipcMain.handle("term:create", async (_event, payload = {}) => {
  const cwd = payload.cwd || workspaceCwd || os.homedir();
  return terminal.createTerminal({
    cwd,
    cols: payload.cols,
    rows: payload.rows,
    send,
  });
});

ipcMain.handle("term:write", async (_event, payload = {}) => {
  return terminal.writeTerminal(payload.id, payload.data);
});

ipcMain.handle("term:resize", async (_event, payload = {}) => {
  return terminal.resizeTerminal(payload.id, payload.cols, payload.rows);
});

ipcMain.handle("term:dispose", async (_event, id) => {
  return terminal.disposeTerminal(id);
});

app.whenReady().then(() => {
  writeCdpInfo();
  if (process.platform === "darwin" && app.dock) {
    try {
      const image = nativeImage.createFromPath(APP_ICON);
      if (!image.isEmpty()) {
        app.dock.setIcon(image);
      } else {
        app.dock.setIcon(APP_ICON);
      }
    } catch (err) {
      send("server:log", {
        stream: "stderr",
        text: `dock.setIcon failed: ${err.message || err}\n`,
      });
    }
  }
  createWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(APP_DISPLAY_NAME);
  }
  // First launch (and after TCC reset): pop the macOS permission dialogs so
  // Vibe / window-control appear under Accessibility + Screen Recording.
  promptComputerUsePermissions();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  clearCdpInfo();
  terminal.disposeAll();
  if (client) {
    void client.close();
    client = null;
  }
});
