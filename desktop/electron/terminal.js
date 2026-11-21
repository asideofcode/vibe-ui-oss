"use strict";

const os = require("node:os");
const path = require("node:path");

let pty = null;
try {
  pty = require("node-pty");
} catch (err) {
  console.error("node-pty unavailable:", err?.message || err);
}

/** @type {Map<string, import('node-pty').IPty>} */
const sessions = new Map();
let seq = 0;

function defaultShell() {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }
  return process.env.SHELL || "/bin/zsh";
}

function createTerminal({ cwd, cols = 80, rows = 24, send } = {}) {
  if (!pty) {
    throw new Error("node-pty is not available in this build");
  }
  const id = `pty-${++seq}`;
  const shell = defaultShell();
  const workdir =
    cwd && typeof cwd === "string" && cwd.length ? cwd : os.homedir();

  const proc = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: Math.max(20, Number(cols) || 80),
    rows: Math.max(5, Number(rows) || 24),
    cwd: workdir,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "Vibe",
    },
  });

  sessions.set(id, proc);

  proc.onData((data) => {
    send?.("term:data", { id, data });
  });

  proc.onExit(({ exitCode, signal }) => {
    sessions.delete(id);
    send?.("term:exit", { id, exitCode, signal });
  });

  return {
    id,
    shell,
    cwd: workdir,
    pid: proc.pid,
  };
}

function writeTerminal(id, data) {
  const proc = sessions.get(id);
  if (!proc) throw new Error(`Unknown terminal ${id}`);
  proc.write(String(data ?? ""));
  return { ok: true };
}

function resizeTerminal(id, cols, rows) {
  const proc = sessions.get(id);
  if (!proc) throw new Error(`Unknown terminal ${id}`);
  proc.resize(
    Math.max(20, Number(cols) || 80),
    Math.max(5, Number(rows) || 24),
  );
  return { ok: true };
}

function disposeTerminal(id) {
  const proc = sessions.get(id);
  if (!proc) return { ok: true };
  sessions.delete(id);
  try {
    proc.kill();
  } catch {
    /* ignore */
  }
  return { ok: true };
}

function disposeAll() {
  for (const id of [...sessions.keys()]) {
    disposeTerminal(id);
  }
}

module.exports = {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  disposeTerminal,
  disposeAll,
  defaultShell,
  ptyAvailable: () => Boolean(pty),
  // silence unused in some bundlers
  path,
};
