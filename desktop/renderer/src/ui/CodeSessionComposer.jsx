import { useEffect, useRef, useState } from "react";

function modelLabel(alias) {
  if (!alias) return "Model";
  return String(alias)
    .replace(/^mistral-/i, "Mistral ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+\d+$/, (m) => m.replace(/\s+/, " "));
}

function thinkingLabel(level) {
  if (!level) return "";
  const value = String(level);
  if (value === "off") return "Off";
  if (value === "xhigh") return "X-High";
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Mirrors CodeSessionComposer + chat-input-bar + model chip popover. */
export function CodeSessionComposer({
  prompt,
  onPromptChange,
  onSend,
  onStop,
  turnRunning = false,
  composerDisabled,
  sendDisabled,
  cwdLabel,
  cwdFull,
  onPickWorkspace,
  sessionHint,
  activeModel,
  activeThinking,
  models = [],
  onSelectModel,
  onSelectThinking,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const canSend = !sendDisabled && !turnRunning;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const selected = models.find((m) => m.alias === activeModel);
  const thinkingLevels = Array.isArray(selected?.thinkingLevels)
    ? selected.thinkingLevels
    : [];
  const currentThinking =
    activeThinking || selected?.thinking || thinkingLevels[0] || null;
  const label = selected?.name || modelLabel(activeModel);
  const chipLabel =
    currentThinking && thinkingLevels.length
      ? `${label} · ${thinkingLabel(currentThinking)}`
      : label;
  const canSwitch = Boolean(onSelectModel) && models.length > 0;
  const canThink =
    Boolean(onSelectThinking) && thinkingLevels.length > 0;

  return (
    <footer className="composer">
      <div className="composer-card chat-input-bar">
        <textarea
          id="prompt"
          rows={2}
          placeholder={
            turnRunning ? "Turn running — stop to send another message" : "Send a message"
          }
          disabled={composerDisabled}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (turnRunning) onStop?.();
              else if (canSend) onSend?.();
            }
          }}
        />
        <div className="composer-bar">
          <div className="composer-left">
            <button
              type="button"
              className="icon-btn"
              id="pickBtn"
              title="Choose workspace"
              onClick={onPickWorkspace}
            >
              +
            </button>
            <span className="cwd-chip" id="cwdChip" title={cwdFull || ""}>
              {cwdLabel}
            </span>
            <input id="cwd" type="hidden" value={cwdFull || ""} readOnly />
          </div>
          <div className="composer-right">
            <div className="model-picker" ref={menuRef}>
              <button
                type="button"
                className="model-chip"
                id="modelChipBtn"
                disabled={!canSwitch}
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                title={
                  canSwitch
                    ? "Switch model and thinking"
                    : "Model list unavailable"
                }
                onClick={() => canSwitch && setMenuOpen((v) => !v)}
              >
                <img
                  className="model-mark"
                  src="./brand/vibe-mark.png"
                  alt=""
                  width="14"
                  height="14"
                />
                {chipLabel}
              </button>
              {menuOpen && canSwitch ? (
                <div className="model-menu" role="presentation">
                  <ul
                    className="model-menu__list"
                    role="listbox"
                    aria-label="Models"
                  >
                    {models.map((model) => {
                      const isSelected = model.alias === activeModel;
                      return (
                        <li key={model.alias}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`model-menu__item${isSelected ? " is-selected" : ""}`}
                            onClick={() => {
                              onSelectModel?.(model.alias);
                              if (
                                !Array.isArray(model.thinkingLevels) ||
                                model.thinkingLevels.length === 0
                              ) {
                                setMenuOpen(false);
                              }
                            }}
                          >
                            <span className="model-menu__name">
                              {model.name || modelLabel(model.alias)}
                            </span>
                            {model.description ? (
                              <span className="model-menu__desc">
                                {model.description}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {canThink ? (
                    <div className="model-menu__thinking">
                      <div className="model-menu__thinking-label">
                        Thinking
                      </div>
                      <div
                        className="model-menu__thinking-levels"
                        role="listbox"
                        aria-label="Thinking level"
                      >
                        {thinkingLevels.map((level) => {
                          const isSelected = level === currentThinking;
                          return (
                            <button
                              key={level}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              className={`model-menu__thinking-chip${isSelected ? " is-selected" : ""}`}
                              onClick={() => {
                                onSelectThinking?.(level);
                                setMenuOpen(false);
                              }}
                            >
                              {thinkingLabel(level)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {turnRunning ? (
              <button
                type="button"
                className="send-btn send-btn--stop"
                id="stopBtn"
                aria-label="Stop turn"
                title="Stop turn"
                onClick={() => onStop?.()}
              >
                <span className="send-btn__stop-icon" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                id="sendBtn"
                disabled={!canSend}
                aria-label="Send"
                onClick={() => onSend?.()}
              >
                ↑
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="hint" id="sessionHint">
        {sessionHint}
      </p>
    </footer>
  );
}
