import { useEffect, useRef, useState } from "react";
import {
  IconClose,
  IconExpand,
  IconFolder,
  IconGitBranch,
  IconGlobe,
  IconPlus,
  IconTerminal,
} from "./icons.jsx";

export const DOCK_PANELS = [
  { id: "files", label: "Files", Icon: IconFolder },
  { id: "git", label: "Git Changes", Icon: IconGitBranch },
  { id: "terminal", label: "Terminal", Icon: IconTerminal },
];

const PANEL_BY_ID = Object.fromEntries(DOCK_PANELS.map((p) => [p.id, p]));

/**
 * Vibe PanelDock chrome: multiple open contribution tabs + file tab + add menu.
 */
export function PanelDockHeader({
  openPanels = ["files"],
  activePanel = "files",
  onSelectPanel,
  onOpenPanel,
  onClosePanelTab,
  fileTab = null,
  fileTabActive = false,
  onFocusFile,
  onCloseFileTab,
  onTogglePanels,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const pickPanel = (id) => {
    setMenuOpen(false);
    onOpenPanel?.(id);
  };

  return (
    <div className="dock-header" data-panel-dock-header="" ref={rootRef}>
      <div className="dock-tabs">
        {openPanels.map((id) => {
          const meta = PANEL_BY_ID[id];
          if (!meta) return null;
          const { label, Icon } = meta;
          const isActive = !fileTabActive && id === activePanel;
          return (
            <div
              key={id}
              className={`dock-tab${isActive ? " is-active" : ""}`}
            >
              <button
                type="button"
                className="dock-tab__main"
                title={label}
                onClick={() => onSelectPanel?.(id)}
              >
                <Icon />
                <span className="dock-tab__label">{label}</span>
              </button>
              <button
                type="button"
                className="dock-tab__close"
                title={`Close ${label}`}
                aria-label={`Close ${label}`}
                onClick={() => onClosePanelTab?.(id)}
              >
                <IconClose />
              </button>
            </div>
          );
        })}

        {fileTab && openPanels.includes("files") ? (
          <div
            className={`dock-tab dock-tab--file${fileTabActive ? " is-active" : ""}`}
          >
            <button
              type="button"
              className="dock-tab__main"
              title={fileTab.path || fileTab.name}
              onClick={onFocusFile}
            >
              <span className="dock-tab__label">{fileTab.name}</span>
            </button>
            <button
              type="button"
              className="dock-tab__close"
              title="Close file"
              aria-label="Close file"
              onClick={onCloseFileTab}
            >
              <IconClose />
            </button>
          </div>
        ) : null}

        <span className="dock-tabs__spacer" />

        <button
          type="button"
          className="dock-tool"
          title="Browser"
          aria-label="Browser"
          disabled
        >
          <IconGlobe />
        </button>
        <button
          type="button"
          className="dock-tool"
          title="Add panel"
          aria-label="Add panel"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <IconPlus size={14} />
        </button>
        <button
          type="button"
          className="dock-tool"
          id="filesHideBtn"
          title="Hide panels (⌘J)"
          aria-label="Hide panels"
          onClick={() => onTogglePanels?.()}
        >
          <IconExpand />
        </button>
      </div>

      {menuOpen ? (
        <ul className="dock-menu" role="menu" aria-label="Add panel">
          {DOCK_PANELS.map(({ id, label, Icon }) => {
            const alreadyOpen = openPanels.includes(id);
            return (
              <li key={id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`dock-menu__item${
                    alreadyOpen && id === activePanel ? " is-selected" : ""
                  }`}
                  onClick={() => pickPanel(id)}
                >
                  <Icon />
                  <span>{label}</span>
                  {alreadyOpen ? (
                    <span className="dock-menu__hint">Open</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
