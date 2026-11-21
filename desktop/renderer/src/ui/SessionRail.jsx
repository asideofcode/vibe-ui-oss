import { useMemo, useState } from "react";
import { ModeSwitch } from "./ModeSwitch.jsx";
import { sessionLabel } from "../lib/entries.js";
import { IconContext, IconPlus } from "./icons.jsx";

/** Deterministic pixel-ish project avatar (mirrors ProjectAvatar palette). */
function projectSwatch(name) {
  const palette = [
    ["#fa500f", "#55b3fb", "#6cd2a7", "#ff8e61"],
    ["#55b3fb", "#fa500f", "#c084fc", "#6cd2a7"],
    ["#6cd2a7", "#ff6529", "#55b3fb", "#f07171"],
    ["#c084fc", "#55b3fb", "#fa500f", "#6cd2a7"],
  ];
  let hash = 0;
  for (let i = 0; i < (name || "").length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

function ProjectPixelIcon({ name }) {
  const colors = useMemo(() => projectSwatch(name), [name]);
  return (
    <span className="project-pixel" aria-hidden="true">
      {colors.map((color, i) => (
        <span key={i} style={{ background: color }} />
      ))}
    </span>
  );
}

/** Mirrors VibeSidebar* / SidebarRow / started-session-tree rail. */
export function SessionRail({
  projectName,
  sessions,
  activeSessionId,
  connected,
  busy,
  accountName = "Local",
  accountInitials = "V",
  workspaceName = "Default Workspace",
  onNewSession,
  onOpenSession,
  sidebarOpen = true,
}) {
  const initials = (accountInitials || "V").slice(0, 2).toUpperCase();
  const [projectOpen, setProjectOpen] = useState(true);
  const rows = sessions || [];

  return (
    <aside
      className="rail"
      aria-label="Sessions"
      aria-hidden={sidebarOpen ? undefined : "true"}
      data-sidebar-state={sidebarOpen ? "expanded" : "collapsed"}
    >
      {/* Drag strip under traffic lights — chrome tools live in DesktopTitleBar */}
      <div className="rail-chrome" aria-hidden="true">
        <div className="rail-traffic-spacer" />
      </div>

      <ModeSwitch mode="code" />

      <nav className="rail-nav" aria-label="Code navigation">
        <button
          type="button"
          className="rail-nav-row rail-primary"
          id="newSessionBtn"
          onClick={onNewSession}
          disabled={!connected || busy}
          title="Create a new code session"
          tabIndex={sidebarOpen ? undefined : -1}
        >
          <span className="rail-nav-icon plus">
            <IconPlus size={14} />
          </span>
          <span className="rail-nav-label">New Session</span>
        </button>
        <button
          type="button"
          className="rail-nav-row rail-secondary"
          id="contextBtn"
          disabled
          tabIndex={sidebarOpen ? undefined : -1}
        >
          <span className="rail-nav-icon">
            <IconContext />
          </span>
          <span className="rail-nav-label">Context</span>
        </button>
      </nav>

      <div className="rail-scroll">
        <div className="rail-section-label">Projects</div>
        <div className="projects" id="projectsList">
          <div className={`project${projectOpen ? " open" : ""}`}>
            <button
              type="button"
              className="project-row"
              aria-expanded={projectOpen}
              onClick={() => setProjectOpen((open) => !open)}
              tabIndex={sidebarOpen ? undefined : -1}
            >
              <ProjectPixelIcon name={projectName} />
              <span className="project-name" id="projectName">
                {projectName}
              </span>
            </button>

            <ul
              className={`sessions${projectOpen ? "" : " collapsed"}`}
              id="sessionList"
              hidden={!projectOpen}
            >
              {!rows.length ? (
                <li className="session-empty">No sessions yet</li>
              ) : (
                rows.map((session) => {
                  const active = session.id === activeSessionId;
                  return (
                    <li
                      key={session.id}
                      className={`session-li${active ? " active" : ""}`}
                    >
                      <span className="session-guide" aria-hidden="true">
                        <span className="session-guide-line" />
                        {active ? (
                          <span className="session-guide-accent" />
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className={`session-item${active ? " active" : ""}`}
                        data-session-id={session.id}
                        data-active={active ? "true" : "false"}
                        aria-busy={busy && active ? "true" : undefined}
                        tabIndex={sidebarOpen ? undefined : -1}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onOpenSession(session.id);
                        }}
                        title={session.preview || session.title || session.id}
                      >
                        <span className="session-label">
                          {sessionLabel(session)}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        <div className="rail-section-label sessions-heading">Sessions</div>
        <div className="sessions-orphan">
          <p className="session-empty">No unassigned sessions</p>
        </div>
      </div>

      <div className="rail-footer">
        <button
          type="button"
          className="account"
          id="accountBtn"
          disabled
          tabIndex={sidebarOpen ? undefined : -1}
        >
          <span className="avatar initials" aria-hidden="true" title={accountName}>
            {initials}
          </span>
          <span className="account-meta">
            <span className="account-name">{accountName}</span>
            <span className="account-space">{workspaceName}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
