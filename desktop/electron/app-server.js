"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");
const { EventEmitter } = require("node:events");

/**
 * Line-delimited JSON-RPC 2.0 client over a vibe-app-server stdio process.
 * Single connection (no --multiplex) for Phase 1.
 */
class AppServerClient extends EventEmitter {
  /**
   * @param {{ cliRoot: string, binary?: string }} options
   */
  constructor(options) {
    super();
    this.cliRoot = options.cliRoot;
    this.binary =
      options.binary ||
      path.join(options.cliRoot, ".venv", "bin", "vibe-app-server");
    this.proc = null;
    this._nextId = 1;
    this._pending = new Map();
    this._rl = null;
    this.ready = false;
  }

  start() {
    if (this.proc) {
      return;
    }

    this.proc = spawn(this.binary, [], {
      cwd: this.cliRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Keep human logs off stdout so JSON-RPC stays clean.
        PYTHONUNBUFFERED: "1",
      },
    });

    this.proc.on("error", (err) => {
      this.emit("error", err);
    });

    this.proc.on("exit", (code, signal) => {
      this.ready = false;
      const err = new Error(
        `vibe-app-server exited (code=${code}, signal=${signal})`,
      );
      for (const [, { reject }] of this._pending) {
        reject(err);
      }
      this._pending.clear();
      this.emit("exit", { code, signal });
    });

    this.proc.stderr.on("data", (chunk) => {
      this.emit("stderr", chunk.toString("utf8"));
    });

    this._rl = readline.createInterface({ input: this.proc.stdout });
    this._rl.on("line", (line) => this._onLine(line));
  }

  /**
   * @param {string} line
   */
  _onLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (err) {
      this.emit("error", new Error(`Invalid JSON from server: ${trimmed.slice(0, 200)}`));
      return;
    }

    if (message.id != null && (message.result !== undefined || message.error)) {
      const pending = this._pending.get(String(message.id));
      if (pending) {
        this._pending.delete(String(message.id));
        if (message.error) {
          pending.reject(Object.assign(new Error(message.error.message || "RPC error"), {
            rpc: message.error,
          }));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    if (message.method && message.id != null) {
      // Server request (e.g. callback/call)
      this.emit("request", message);
      return;
    }

    if (message.method) {
      this.emit("notification", message);
      return;
    }
  }

  /**
   * @param {string} method
   * @param {object} [params]
   * @returns {Promise<any>}
   */
  request(method, params = {}) {
    this.start();
    const id = String(this._nextId++);
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._write(payload);
    });
  }

  /**
   * @param {string} method
   * @param {object} [params]
   */
  notify(method, params = {}) {
    this.start();
    this._write({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  /**
   * Respond to a server request (callback/call, etc.).
   * @param {string|number} id
   * @param {object|null} result
   * @param {object|null} [error]
   */
  respond(id, result, error = null) {
    const message = { jsonrpc: "2.0", id };
    if (error) {
      message.error = error;
    } else {
      message.result = result;
    }
    this._write(message);
  }

  /**
   * @param {object} message
   */
  _write(message) {
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error("vibe-app-server is not running");
    }
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async initialize(clientInfo, capabilities = {}) {
    const result = await this.request("initialize", {
      clientInfo,
      capabilities,
    });
    this.notify("initialized", {});
    this.ready = true;
    return result;
  }

  async close() {
    for (const [, { reject }] of this._pending) {
      reject(new Error("App server closed"));
    }
    this._pending.clear();
    if (this._rl) {
      this._rl.close();
      this._rl = null;
    }
    if (this.proc) {
      const proc = this.proc;
      this.proc = null;
      proc.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          resolve();
        }, 2000);
        proc.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.ready = false;
  }
}

module.exports = { AppServerClient };
