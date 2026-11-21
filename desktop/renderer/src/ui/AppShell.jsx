import { useCallback, useEffect, useState } from "react";
import { CenterPane } from "./CenterPane.jsx";
import { DesktopTitleBar } from "./DesktopTitleBar.jsx";
import {
  FILES_WIDTH_DEFAULT,
  FILES_WIDTH_MAX,
  FILES_WIDTH_MIN,
} from "./FilesSash.jsx";
import { SessionRail } from "./SessionRail.jsx";
import { WorkspaceFiles } from "./WorkspaceFiles.jsx";

/** Aura SIDEBAR_COOKIE_NAME — desktop persists open/collapsed. */
const SIDEBAR_STATE_KEY = "sidebar:state";
const FILES_VISIBLE_KEY = "files:visible";
const FILES_WIDTH_KEY = "files:width";

function readBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

function writeBool(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function readFilesWidth() {
  try {
    const n = Number(localStorage.getItem(FILES_WIDTH_KEY));
    if (Number.isFinite(n)) {
      return Math.min(FILES_WIDTH_MAX, Math.max(FILES_WIDTH_MIN, Math.round(n)));
    }
  } catch {
    /* ignore */
  }
  return FILES_WIDTH_DEFAULT;
}

function writeFilesWidth(value) {
  try {
    localStorage.setItem(FILES_WIDTH_KEY, String(value));
  } catch {
    /* ignore */
  }
}

/**
 * Recover from a bad persisted chrome state (both docks tucked away),
 * which leaves a single full-bleed center pane and looks nothing like Vibe.
 */
function readChromeBools() {
  let sidebar = readBool(SIDEBAR_STATE_KEY, true);
  let files = readBool(FILES_VISIBLE_KEY, true);
  if (!sidebar && !files) {
    sidebar = true;
    files = true;
    writeBool(SIDEBAR_STATE_KEY, true);
    writeBool(FILES_VISIBLE_KEY, true);
  }
  return { sidebar, files };
}

/** Mirrors AppShell / DesktopWindowShell — desktop collapsible=offcanvas. */
export function AppShell({ rail, center, files }) {
  const [{ sidebar: initialSidebar, files: initialFiles }] = useState(
    readChromeBools,
  );
  const [sidebarOpen, setSidebarOpenState] = useState(initialSidebar);
  const [filesVisible, setFilesVisible] = useState(initialFiles);
  const [filesWidth, setFilesWidth] = useState(readFilesWidth);
  const [filesResizing, setFilesResizing] = useState(false);

  const setSidebarOpen = useCallback((next, { persistent = true } = {}) => {
    setSidebarOpenState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (persistent) writeBool(SIDEBAR_STATE_KEY, value);
      return value;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => !open, { persistent: true });
  }, [setSidebarOpen]);

  const setFilesOpen = useCallback((next) => {
    setFilesVisible((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      writeBool(FILES_VISIBLE_KEY, value);
      return value;
    });
  }, []);

  const toggleFiles = useCallback(() => {
    setFilesOpen((v) => !v);
  }, [setFilesOpen]);

  const onFilesWidthChange = useCallback((next) => {
    setFilesResizing(true);
    setFilesWidth(next);
  }, []);

  const onFilesResizeEnd = useCallback(() => {
    setFilesResizing(false);
    setFilesWidth((current) => {
      writeFilesWidth(current);
      return current;
    });
  }, []);

  // toggleSidebar: Mod+B — toggleFiles: Mod+J (independent; files must not close rail)
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (key === "j") {
        event.preventDefault();
        toggleFiles();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar, toggleFiles]);

  const onFileActivated = useCallback(() => {
    setFilesOpen(true);
    // Give Monaco room if the dock is still at the narrow default.
    setFilesWidth((prev) => {
      if (prev >= 480) return prev;
      const next = Math.min(FILES_WIDTH_MAX, 560);
      writeFilesWidth(next);
      return next;
    });
  }, [setFilesOpen]);

  const sidebarState = sidebarOpen ? "expanded" : "collapsed";
  const filesState = filesVisible ? "visible" : "hidden";

  return (
    <div
      className="shell"
      data-desktop-window-sidebar=""
      data-sidebar-state={sidebarState}
      data-files-state={filesState}
      data-files-resizing={filesResizing ? "true" : "false"}
      data-collapsible="offcanvas"
      style={
        filesVisible
          ? { ["--shell-files-track"]: `${filesWidth}px` }
          : undefined
      }
    >
      <DesktopTitleBar
        onSidebarToggle={toggleSidebar}
        sidebarOpen={sidebarOpen}
      />
      <SessionRail {...rail} sidebarOpen={sidebarOpen} />
      <CenterPane
        {...center}
        filesVisible={filesVisible}
        onToggleFiles={toggleFiles}
      />
      <WorkspaceFiles
        {...files}
        visible={filesVisible}
        width={filesWidth}
        onWidthChange={onFilesWidthChange}
        onResizeEnd={onFilesResizeEnd}
        onVisibilityChange={setFilesOpen}
        onFileActivated={onFileActivated}
      />
    </div>
  );
}
