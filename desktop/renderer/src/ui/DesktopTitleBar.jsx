import {
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconSidebar,
} from "./icons.jsx";

/**
 * Mirrors Vibe DesktopTitleBar — left chrome only (sidebar + nav).
 * Files / panel dock controls live on the center header (right).
 */
export function DesktopTitleBar({ onSidebarToggle, sidebarOpen }) {
  const toggleLabel = sidebarOpen ? "Collapse sidebar" : "Open sidebar";

  return (
    <div
      className="desktop-title-bar"
      aria-label="Window controls"
      data-desktop-title-bar=""
    >
      <button
        type="button"
        className="chrome-btn"
        data-app-shell-sidebar-toggle=""
        id="sidebarToggleBtn"
        aria-label={toggleLabel}
        aria-pressed={sidebarOpen}
        title={`${toggleLabel} (⌘B)`}
        onClick={onSidebarToggle}
      >
        <IconSidebar />
      </button>
      <button type="button" className="chrome-btn" title="Back" disabled>
        <IconChevronLeft />
      </button>
      <button type="button" className="chrome-btn" title="Forward" disabled>
        <IconChevronRight />
      </button>
      <button type="button" className="chrome-btn" title="Search" disabled>
        <IconSearch />
      </button>
    </div>
  );
}
