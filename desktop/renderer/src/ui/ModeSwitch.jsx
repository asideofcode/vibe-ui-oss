/** Mirrors VibeSidebarTabs / ProductSurfaceSwitcher segmentedSidebar. */
export function ModeSwitch({ mode = "code" }) {
  return (
    <div
      className="mode-switch"
      role="tablist"
      aria-label="Mode"
      data-testid="product-surface-switcher"
    >
      <button
        type="button"
        className="mode-btn"
        data-mode="work"
        role="tab"
        aria-selected="false"
        disabled
      >
        Work
      </button>
      <button
        type="button"
        className={`mode-btn${mode === "code" ? " active" : ""}`}
        data-mode="code"
        role="tab"
        aria-selected={mode === "code"}
        data-state={mode === "code" ? "active" : "inactive"}
      >
        Code
      </button>
    </div>
  );
}
