import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { presentApproval } from "./lib/approvalPresentation.js";
import {
  identityPresentation,
  projectLabel,
  sessionLabel,
  shortPath,
  summarize,
} from "./lib/entries.js";
import { applyJsonPatch } from "./lib/jsonPatch.js";
import { AppShell } from "./ui/AppShell.jsx";

function nextKey() {
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isBusyConflict(err) {
  const code = err?.rpc?.code || err?.code;
  const msg = String(err?.message || err || "");
  return (
    code === "conflict" ||
    /already open|session_busy|open elsewhere/i.test(msg)
  );
}

/** Strip Electron IPC wrapping so transcript errors stay readable. */
function formatOpenError(err) {
  let msg = String(err?.message || err || "Unknown error");
  msg = msg.replace(/^Error invoking remote method '[^']+':\s*/i, "");
  msg = msg.replace(/^Error:\s*/i, "");
  if (isBusyConflict(err) || /already open|open elsewhere/i.test(msg)) {
    return msg.includes("elsewhere")
      ? msg
      : "That session is already open in another Vibe window. Close it there, then switch again.";
  }
  return msg;
}

export function CodeApp() {
  const [cwd, setCwd] = useState("");
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessionTitle, setSessionTitle] = useState("Local Code");
  const [sessions, setSessions] = useState([]);
  const [statusState, setStatusState] = useState("idle");
  const [statusText, setStatusText] = useState("Starting…");
  const [history, setHistory] = useState([]);
  const [notices, setNotices] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState(null);
  const [tree, setTree] = useState([]);
  const [treeEmpty, setTreeEmpty] = useState("Open a workspace to browse files");
  const [approval, setApproval] = useState(null);
  const [accountName, setAccountName] = useState("Local");
  const [accountInitials, setAccountInitials] = useState("V");
  const [workspaceName, setWorkspaceName] = useState("Default Workspace");
  const [activeModel, setActiveModel] = useState("mistral-large-4-0");
  const [activeThinking, setActiveThinking] = useState(null);
  const [models, setModels] = useState([]);

  const pendingCallback = useRef(null);
  const sessionIdRef = useRef(null);
  const sessionTitleRef = useRef(sessionTitle);
  const cwdRef = useRef(cwd);
  const historyRef = useRef(history);
  const activeModelRef = useRef(activeModel);
  const activeTurnIdRef = useRef(activeTurnId);
  sessionIdRef.current = sessionId;
  sessionTitleRef.current = sessionTitle;
  cwdRef.current = cwd;
  historyRef.current = history;
  activeModelRef.current = activeModel;
  activeTurnIdRef.current = activeTurnId;
  const turnRunning = Boolean(activeTurnId);

  const projectName = useMemo(() => projectLabel(cwd), [cwd]);
  const sessionActive = Boolean(sessionId);

  const sessionHint = !connected
    ? "Connecting to local app-server…"
    : sessionActive
      ? `Session ${sessionId.slice(0, 8)}`
      : sessions.length
        ? "Pick a session in the rail, or New Session"
        : "New Session to start chatting";

  const appendBubble = useCallback((kind, body, { id, role } = {}) => {
    const key = id || nextKey();
    setNotices((prev) => [
      ...prev,
      { key, id: key, kind, body, role: role || kind },
    ]);
    return key;
  }, []);

  const replaceHistory = useCallback((nextHistory) => {
    setHistory(Array.isArray(nextHistory) ? nextHistory.filter((e) => e?.id) : []);
    setNotices([]);
  }, []);

  const upsertEntry = useCallback((entry) => {
    if (!entry?.id) return;
    setHistory((prev) => {
      const idx = prev.findIndex((row) => row.id === entry.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = entry;
        return next;
      }
      return [...prev, entry];
    });
  }, []);

  /** history/entryUpdated delivers RFC6902 patches, not a full entry. */
  const patchEntry = useCallback((entryId, patch) => {
    if (!entryId || !Array.isArray(patch) || !patch.length) return;
    setHistory((prev) => {
      const idx = prev.findIndex((row) => row.id === entryId);
      if (idx < 0) return prev;
      try {
        const next = prev.slice();
        next[idx] = applyJsonPatch(prev[idx], patch);
        return next;
      } catch (err) {
        console.debug("history/entryUpdated patch failed", entryId, err);
        return prev;
      }
    });
  }, []);

  const mergeSessions = useCallback((prev, ...groups) => {
    const map = new Map();
    for (const session of prev || []) {
      if (session?.id) map.set(session.id, session);
    }
    for (const group of groups) {
      for (const session of group || []) {
        if (session?.id) map.set(session.id, session);
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0),
    );
  }, []);

  const refreshFileTree = useCallback(async (workspace) => {
    try {
      const nodes = await window.leChonk.listWorkspace(workspace, 2);
      if (!nodes?.length) {
        setTree([]);
        setTreeEmpty("No files found");
        return;
      }
      setTree(nodes);
      setTreeEmpty("");
    } catch (err) {
      setTree([]);
      setTreeEmpty(err.message || String(err));
    }
  }, []);

  const refreshSessions = useCallback(
    async (workspace, { replace = false } = {}) => {
      const listed = await window.leChonk.listSessions(workspace);
      const items = listed?.items || [];
      // Never drop optimistic/unpersisted rows on a server list refresh.
      setSessions((prev) => (replace ? items : mergeSessions(prev, items)));
      return items;
    },
    [mergeSessions],
  );

  const refreshIdentity = useCallback(async () => {
    try {
      const identity = await window.leChonk.readIdentity();
      const next = identityPresentation(identity);
      setAccountName(next.accountName);
      setAccountInitials(next.accountInitials);
      setWorkspaceName(next.workspaceName);
    } catch (err) {
      console.debug("identity/read", err);
    }
  }, []);

  const switchingRef = useRef(false);

  const adoptApproval = useCallback((callback) => {
    if (!callback || callback?.detail?.kind !== "approval") {
      setApproval(null);
      pendingCallback.current = null;
      return;
    }
    // Enrich thin callback/call payloads from the matching history callback row.
    let enriched = callback;
    const relatedId = callback.detail?.relatedEntryId;
    if (
      relatedId ||
      !(
        callback.detail?.effect?.display?.message ||
        callback.detail?.effect?.input?.command
      )
    ) {
      const fromHistory = historyRef.current.find(
        (entry) =>
          entry?.type === "callback" &&
          entry?.detail?.kind === "approval" &&
          (entry.id === callback.callbackId ||
            entry.id === callback.id ||
            entry.detail?.relatedEntryId === relatedId ||
            entry.title === callback.title),
      );
      if (fromHistory?.detail?.effect) {
        enriched = {
          ...callback,
          detail: {
            ...fromHistory.detail,
            ...callback.detail,
            effect: {
              ...fromHistory.detail.effect,
              ...(callback.detail?.effect || {}),
              display: {
                ...(fromHistory.detail.effect.display || {}),
                ...(callback.detail?.effect?.display || {}),
              },
              input: {
                ...(fromHistory.detail.effect.input || {}),
                ...(callback.detail?.effect?.input || {}),
              },
            },
            requiredPermissions:
              callback.detail?.requiredPermissions ||
              fromHistory.detail.requiredPermissions,
            choices: callback.detail?.choices || fromHistory.detail.choices,
          },
        };
      }
    }
    const next = presentApproval(enriched);
    // Don't clobber a richer preview we already have for the same id.
    setApproval((prev) => {
      if (
        prev &&
        next &&
        prev.callbackId &&
        prev.callbackId === next.callbackId &&
        (prev.command?.length || 0) > (next.command?.length || 0)
      ) {
        return prev;
      }
      return next;
    });
    pendingCallback.current = enriched;
  }, []);

  const syncTurnFromSession = useCallback((session) => {
    if (!session) return;
    const status = session.status;
    const type = typeof status === "string" ? status : status?.type;
    const turnId =
      status?.activeTurnId ||
      status?.active_turn_id ||
      session.activeTurnId ||
      session.active_turn_id ||
      null;
    if (type === "running" || type === "blocked") {
      if (turnId) setActiveTurnId(turnId);
      setStatusText(type === "blocked" ? "Waiting for approval…" : "Running…");
      setStatusState("connected");
      return;
    }
    if (type === "idle" || type === "failed" || type === "archived") {
      setActiveTurnId(null);
      if (type === "idle") setStatusText("Idle");
    }
  }, []);

  const refreshActiveHistory = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id || !window.leChonk.readSession) return;
    try {
      const result = await window.leChonk.readSession(id);
      if (result?.history) replaceHistory(result.history);
      if (result?.session?.model) setActiveModel(result.session.model);
      const effort =
        result?.session?.reasoningEffort ||
        result?.session?.reasoning_effort ||
        result?.session?.thinking;
      if (effort) setActiveThinking(effort);
      if (result?.session) syncTurnFromSession(result.session);
    } catch (err) {
      console.debug("session/read", err);
    }
  }, [replaceHistory, syncTurnFromSession]);

  const refreshModels = useCallback(async () => {
    if (!window.leChonk.readConfig) return;
    try {
      const config = await window.leChonk.readConfig();
      const raw = config?.models;
      const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object"
          ? Object.values(raw)
          : [];
      setModels(
        list
          .map((m) => ({
            alias: m.alias || m.id || m.name,
            name: m.display_name || m.displayName || m.name || m.alias,
            description: m.description || m.provider || "",
            thinking: m.thinking || null,
            thinkingLevels: Array.isArray(m.thinking_levels)
              ? m.thinking_levels
              : Array.isArray(m.thinkingLevels)
                ? m.thinkingLevels
                : [],
          }))
          .filter((m) => m.alias),
      );
      const active =
        (typeof config?.active_model === "string" && config.active_model) ||
        (typeof config?.activeModel === "string" && config.activeModel) ||
        config?.activeModel?.alias ||
        config?.active_model?.alias ||
        config?.catalog_recommended_model ||
        config?.defaultModelAlias;
      if (active) setActiveModel(active);
      const activeEntry = list.find(
        (m) => (m.alias || m.id || m.name) === active,
      );
      if (activeEntry?.thinking) {
        setActiveThinking((prev) => prev || activeEntry.thinking);
      }
    } catch (err) {
      console.debug("config/read", err);
    }
  }, []);

  const setSessionModel = useCallback(async (alias, thinking) => {
    if (!alias || !sessionIdRef.current) return;
    setActiveModel(alias);
    if (thinking) setActiveThinking(thinking);
    try {
      await window.leChonk.writeModelConfig({
        modelAlias: alias,
        reasoningEffort: thinking || undefined,
        sessionOnly: true,
      });
      // Keep thinking in sync with what the model actually offers.
      if (!thinking) {
        const match = models.find((m) => m.alias === alias);
        if (match?.thinking) setActiveThinking(match.thinking);
      }
    } catch (err) {
      appendBubble("meta", `Model switch failed: ${err.message || err}`, {
        role: "error",
      });
    }
  }, [appendBubble, models]);

  const setSessionThinking = useCallback(
    async (level) => {
      const alias = activeModelRef.current;
      if (!alias || !level || !sessionIdRef.current) return;
      setActiveThinking(level);
      try {
        await window.leChonk.writeModelConfig({
          modelAlias: alias,
          reasoningEffort: level,
          sessionOnly: true,
        });
      } catch (err) {
        appendBubble("meta", `Thinking switch failed: ${err.message || err}`, {
          role: "error",
        });
      }
    },
    [appendBubble],
  );

  const applyOpened = useCallback(
    async (result, workspace) => {
      setSessionId(result.sessionId);
      setSessionTitle(sessionLabel(result.session));
      replaceHistory(result.history);
      if (result.session?.model) setActiveModel(result.session.model);
      const effort =
        result.session?.reasoningEffort ||
        result.session?.reasoning_effort ||
        result.session?.thinking;
      if (effort) setActiveThinking(effort);
      // Keep prior rows — brand-new sessions are often absent from session/list
      // until a turn persists them, and a refresh must not wipe the rail.
      setSessions((prev) => mergeSessions(prev, [result.session]));
      setStatusState("connected");
      setStatusText("Idle");
      if (result.session) syncTurnFromSession(result.session);
      const pending = (result.activeCallbacks || []).find(
        (callback) => callback?.detail?.kind === "approval",
      );
      adoptApproval(pending || null);
      await refreshFileTree(workspace);
      try {
        await refreshSessions(workspace);
        setSessions((prev) => mergeSessions(prev, [result.session]));
      } catch {
        /* keep optimistic rows */
      }
      await refreshIdentity();
      await refreshModels();
    },
    [
      adoptApproval,
      mergeSessions,
      refreshFileTree,
      refreshIdentity,
      refreshModels,
      refreshSessions,
      replaceHistory,
      syncTurnFromSession,
    ],
  );

  const openExisting = useCallback(
    async (id, workspace = cwdRef.current) => {
      if (!id || switchingRef.current) return;
      if (id === sessionIdRef.current) return;
      const previousId = sessionIdRef.current;
      switchingRef.current = true;
      // Optimistic highlight so a click always feels acknowledged.
      setSessionId(id);
      setActiveTurnId(null);
      adoptApproval(null);
      setBusy(true);
      setStatusText("Opening session…");
      try {
        await window.leChonk.setWorkspace(workspace);
        const result = await window.leChonk.resumeSession(id);
        await applyOpened(result, workspace);
        setStatusState("connected");
      } catch (err) {
        const message = formatOpenError(err);
        setSessionId(previousId);
        // Busy conflicts are expected when stock Vibe (or another window) holds
        // the on-disk lease — status line is enough; don't spam the transcript.
        if (!isBusyConflict(err)) {
          appendBubble("meta", `Open failed: ${message}`, { role: "error" });
        }
        setStatusState(isBusyConflict(err) ? "connected" : "error");
        setStatusText(isBusyConflict(err) ? "Session busy elsewhere" : message);
        throw err;
      } finally {
        switchingRef.current = false;
        setBusy(false);
      }
    },
    [adoptApproval, appendBubble, applyOpened],
  );

  const startNewSession = useCallback(async () => {
    const workspace = cwdRef.current;
    setBusy(true);
    try {
      await window.leChonk.setWorkspace(workspace);
      const result = await window.leChonk.startSession();
      await applyOpened(result, workspace);
      return result.sessionId;
    } catch (err) {
      appendBubble("meta", `New session failed: ${err.message || err}`, {
        role: "error",
      });
      setStatusState("error");
      setStatusText(err.message || String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, [appendBubble, applyOpened]);

  const restoreWorkspaceSessions = useCallback(
    async (workspace) => {
      const items = await refreshSessions(workspace);
      if (!items.length) {
        setSessionId(null);
        setSessionTitle("Local Code");
        replaceHistory([]);
        return;
      }

      // Prefer continue (latest for cwd), then resume listed sessions.
      try {
        const continued = await window.leChonk.continueSession();
        await applyOpened(continued, workspace);
        return;
      } catch (err) {
        if (!isBusyConflict(err) && !/not.?found/i.test(String(err.message || ""))) {
          console.debug("session/continue", err);
        }
      }

      for (const session of items) {
        try {
          await openExisting(session.id, workspace);
          return;
        } catch (err) {
          if (isBusyConflict(err)) continue;
          console.debug("session/resume", session.id, err);
        }
      }

      // Listed but all busy / failed — still show the rail; no active session.
      setSessionId(null);
      setActiveTurnId(null);
      setSessionTitle("Local Code");
      replaceHistory([]);
    },
    [applyOpened, openExisting, refreshSessions, replaceHistory],
  );

  const sendPrompt = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;
    if (activeTurnIdRef.current) {
      appendBubble("meta", "A turn is already running — stop it first.", {
        role: "error",
      });
      return;
    }

    setSending(true);
    setPrompt("");
    try {
      if (!sessionIdRef.current) {
        const created = await startNewSession();
        if (!created) {
          throw new Error("No active session");
        }
      }
      if (
        sessionTitleRef.current === "New session" ||
        sessionTitleRef.current === "Local Code" ||
        sessionTitleRef.current === "Untitled session"
      ) {
        setSessionTitle(text.slice(0, 48));
      }
      // History notifications own the transcript rows (avoid duplicate bubbles).
      const result = await window.leChonk.startTurn(text);
      const turnId = result?.turn?.id || result?.turnId || result?.turn_id;
      if (turnId) {
        setActiveTurnId(turnId);
        setStatusText("Running…");
      }
      await refreshSessions(cwdRef.current);
    } catch (err) {
      appendBubble("meta", `Turn failed: ${err.message || err}`, {
        role: "error",
      });
      setActiveTurnId(null);
    } finally {
      setSending(false);
    }
  }, [appendBubble, prompt, refreshSessions, startNewSession]);

  const stopTurn = useCallback(async () => {
    const turnId = activeTurnIdRef.current;
    if (!turnId || !window.leChonk.interruptTurn) return;
    setStatusText("Stopping…");
    try {
      await window.leChonk.interruptTurn({ expectedTurnId: turnId });
    } catch (err) {
      appendBubble("meta", `Stop failed: ${err.message || err}`, {
        role: "error",
      });
      // Resync in case the turn already finished.
      void refreshActiveHistory();
    }
  }, [appendBubble, refreshActiveHistory]);

  const answer = useCallback(
    async (decision) => {
      if (!pendingCallback.current) return;
      const callbackId = pendingCallback.current.callbackId;
      pendingCallback.current = null;
      setApproval(null);
      try {
        await window.leChonk.answerCallback({ callbackId, decision });
        appendBubble("meta", `Approval: ${decision}`, { role: "approval" });
      } catch (err) {
        appendBubble("meta", `Approval failed: ${err.message || err}`, {
          role: "error",
        });
      }
    },
    [appendBubble],
  );

  useEffect(() => {
    let cancelled = false;

    const unsubs = [
      window.leChonk.on("server:status", (payload) => {
        if (cancelled) return;
        if (payload.state === "connected") {
          setConnected(true);
          setStatusState("connected");
          // Don't stomp a better status (Idle / Opening…) with the raw server banner.
          setStatusText((prev) =>
            prev === "Connecting…" || prev === "Starting…" ? "Idle" : prev,
          );
        } else if (payload.state === "error") {
          setConnected(false);
          setSessionId(null);
          setActiveTurnId(null);
          setStatusState("error");
          setStatusText(payload.message || "Error");
        } else {
          setConnected(false);
          setSessionId(null);
          setActiveTurnId(null);
          setStatusState(payload.state || "disconnected");
          setStatusText(payload.message || "Disconnected");
        }
      }),
      window.leChonk.on("session:ready", (payload) => {
        if (cancelled) return;
        setSessionId(payload.sessionId);
        if (payload.session) {
          setSessionTitle(sessionLabel(payload.session));
        }
      }),
      window.leChonk.on("rpc:notification", (message) => {
        if (cancelled) return;
        const { method, params } = message;
        if (method === "history/entryAdded" && params?.entry) {
          upsertEntry(params.entry);
        } else if (method === "history/entryUpdated") {
          const entryId = params?.entryId || params?.entry_id;
          const patch = params?.patch;
          if (entryId && patch) patchEntry(entryId, patch);
          else if (params?.entry) upsertEntry(params.entry);
        } else if (method === "session/updated") {
          if (params?.session) {
            setSessions((prev) => {
              const rest = prev.filter((s) => s.id !== params.session.id);
              return [params.session, ...rest];
            });
            if (params.session.id === sessionIdRef.current) {
              setSessionTitle(sessionLabel(params.session));
              if (params.session.model) setActiveModel(params.session.model);
              const effort =
                params.session.reasoningEffort ||
                params.session.reasoning_effort ||
                params.session.thinking;
              if (effort) setActiveThinking(effort);
              syncTurnFromSession(params.session);
            }
          } else if (params?.patch) {
            for (const op of params.patch) {
              if (op?.path === "/model" && op.value) setActiveModel(op.value);
              if (
                (op?.path === "/reasoningEffort" ||
                  op?.path === "/reasoning_effort" ||
                  op?.path === "/thinking") &&
                op.value
              ) {
                setActiveThinking(op.value);
              }
              if (op?.path === "/title" && typeof op.value === "string") {
                setSessionTitle(op.value || "Untitled session");
              }
              if (op?.path === "/status") {
                syncTurnFromSession({ status: op.value });
              }
            }
          }
        } else if (method === "turn/started") {
          const turnId = params?.turn?.id;
          if (turnId) {
            setActiveTurnId(turnId);
            setStatusText("Running…");
          }
        } else if (method === "turn/completed") {
          setActiveTurnId(null);
          setStatusText("Idle");
          // Safety net: resync history in case a patch was missed mid-stream.
          void refreshActiveHistory();
        }
      }),
      window.leChonk.on("rpc:callback", (callback) => {
        if (cancelled) return;
        if (callback?.detail?.kind === "approval") {
          adoptApproval(callback);
        } else {
          appendBubble("meta", `Unhandled callback: ${summarize(callback)}`, {
            role: "callback",
          });
        }
      }),
      window.leChonk.on("server:log", (payload) => {
        if (payload.stream === "stderr" && payload.text.trim()) {
          console.debug(payload.text);
        }
      }),
    ];

    void (async () => {
      try {
        const info = await window.leChonk.getBootstrap();
        if (cancelled) return;
        const workspace = info.workspaceCwd || info.cliRoot;
        setCwd(workspace);
        setStatusText("Connecting…");
        setBusy(true);
        await window.leChonk.setWorkspace(workspace);
        await window.leChonk.connect();
        if (cancelled) return;
        setConnected(true);
        await refreshFileTree(workspace);
        await restoreWorkspaceSessions(workspace);
        if (cancelled) return;
        setStatusState("connected");
        setStatusText("Idle");
      } catch (err) {
        if (cancelled) return;
        setStatusState("error");
        setStatusText(err.message || String(err));
        appendBubble("meta", `Startup failed: ${err.message || err}`, {
          role: "error",
        });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u?.());
    };
    // Bootstrap once on mount — keep handlers via stable refs/callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell
      rail={{
        projectName,
        sessions,
        activeSessionId: sessionId,
        connected,
        busy,
        accountName,
        accountInitials,
        workspaceName,
        onNewSession: () => void startNewSession(),
        onOpenSession: (id) => {
          if (!id || id === sessionIdRef.current) return;
          void openExisting(id).catch(() => {
            /* error already surfaced in transcript / status */
          });
        },
      }}
      center={{
        projectName,
        sessionTitle,
        statusState,
        statusText,
        history,
        notices,
        approval,
        onApprove: () => void answer("approve"),
        onApproveSession: () => void answer("approve_for_session"),
        onApprovePermanent: () => void answer("approve_permanently"),
        onDeny: () => void answer("deny"),
        composer: {
          prompt,
          onPromptChange: setPrompt,
          onSend: () => void sendPrompt(),
          onStop: () => void stopTurn(),
          turnRunning,
          // Keep typing available while a turn runs so Stop stays reachable.
          composerDisabled: !connected || busy,
          sendDisabled: !connected || busy || sending || turnRunning,
          cwdLabel: shortPath(cwd),
          cwdFull: cwd,
          onPickWorkspace: async () => {
            const next = await window.leChonk.pickWorkspace();
            if (!next) return;
            setCwd(next);
            setBusy(true);
            try {
              await window.leChonk.setWorkspace(next);
              await refreshFileTree(next);
              await restoreWorkspaceSessions(next);
            } finally {
              setBusy(false);
            }
          },
          sessionHint,
          activeModel,
          activeThinking,
          models,
          onSelectModel: (alias) => void setSessionModel(alias),
          onSelectThinking: (level) => void setSessionThinking(level),
        },
      }}
      files={{
        tree,
        cwd,
        emptyMessage: treeEmpty || "Open a workspace to browse files",
      }}
    />
  );
}
