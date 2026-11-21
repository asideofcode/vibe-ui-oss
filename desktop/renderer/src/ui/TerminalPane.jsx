import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

/**
 * Interactive shell docked in the right panel (node-pty ↔ xterm).
 * Stays mounted while the Terminal tab is selected; parent can keep it
 * alive across panel switches by not unmounting.
 */
export function TerminalPane({ cwd, active = true }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const idRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hostRef.current || !window.leChonk?.createTerminal) return undefined;

    let cancelled = false;
    let unsubs = [];
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12.5,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      theme: {
        background: "#09090d",
        foreground: "#e4e4e7",
        cursor: "#fa500f",
        selectionBackground: "rgba(250, 80, 15, 0.35)",
        black: "#09090d",
        red: "#f07171",
        green: "#6cd2a7",
        yellow: "#e6c07b",
        blue: "#55b3fb",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#e4e4e7",
        brightBlack: "#6d6d78",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        const dims = { cols: term.cols, rows: term.rows };
        if (idRef.current) {
          void window.leChonk.resizeTerminal(
            idRef.current,
            dims.cols,
            dims.rows,
          );
        }
      } catch {
        /* ignore fit races */
      }
    });
    ro.observe(hostRef.current);

    void (async () => {
      try {
        fit.fit();
        const created = await window.leChonk.createTerminal({
          cwd,
          cols: term.cols,
          rows: term.rows,
        });
        if (cancelled) {
          void window.leChonk.disposeTerminal(created.id);
          return;
        }
        idRef.current = created.id;
        unsubs.push(
          window.leChonk.on("term:data", (payload) => {
            if (payload?.id !== idRef.current) return;
            term.write(payload.data || "");
          }),
          window.leChonk.on("term:exit", (payload) => {
            if (payload?.id !== idRef.current) return;
            term.writeln(
              `\r\n\x1b[90m[process exited: ${payload.exitCode ?? "?"}]\x1b[0m`,
            );
            idRef.current = null;
          }),
        );
        term.onData((data) => {
          if (!idRef.current) return;
          void window.leChonk.writeTerminal(idRef.current, data);
        });
        if (active) term.focus();
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || String(err));
          term.writeln(`\x1b[31m${err?.message || err}\x1b[0m`);
        }
      }
    })();

    return () => {
      cancelled = true;
      ro.disconnect();
      for (const off of unsubs) off?.();
      const id = idRef.current;
      idRef.current = null;
      if (id) void window.leChonk.disposeTerminal(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [cwd]);

  useEffect(() => {
    if (!active) return;
    try {
      fitRef.current?.fit();
      termRef.current?.focus();
      if (idRef.current && termRef.current) {
        void window.leChonk.resizeTerminal(
          idRef.current,
          termRef.current.cols,
          termRef.current.rows,
        );
      }
    } catch {
      /* ignore */
    }
  }, [active]);

  return (
    <div className={`terminal-pane${active ? " is-active" : ""}`}>
      {error ? <div className="terminal-pane__error">{error}</div> : null}
      <div className="terminal-pane__host" ref={hostRef} />
    </div>
  );
}
