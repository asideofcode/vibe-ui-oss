import { ApprovalPane } from "./ApprovalPane.jsx";
import { CodeSessionComposer } from "./CodeSessionComposer.jsx";
import { IconChevronDown, IconExpand, IconTerminal } from "./icons.jsx";
import { SessionThread } from "./SessionThread.jsx";

export function CenterPane({
  projectName,
  sessionTitle,
  statusState,
  statusText,
  history,
  notices,
  approval,
  onApprove,
  onApproveSession,
  onApprovePermanent,
  onDeny,
  composer,
  filesVisible,
  onToggleFiles,
}) {
  const panelsLabel = filesVisible ? "Hide panels" : "Show panels";

  return (
    <section className="center">
      <header className="center-top">
        <div className="title-line">
          <img
            className="title-mark"
            src="./brand/m-icon-0.svg"
            alt=""
            width="18"
            height="18"
          />
          <span id="titleProject">{projectName}</span>
          <span className="slash">/</span>
          <button type="button" className="title-session" id="titleSession" disabled>
            <span className="title-session__text">{sessionTitle}</span>
            <IconChevronDown />
          </button>
          <span className="badge local" title="Local environment">
            <IconTerminal size={12} />
            Local
          </span>
        </div>
        <div className="center-tools">
          <span
            className="status-dot"
            id="statusPill"
            data-state={statusState}
          />
          <span className="status-text" id="statusText">
            {statusText}
          </span>
          {onToggleFiles ? (
            <button
              type="button"
              className="chrome-btn center-panel-toggle"
              id="filesToggleBtn"
              aria-label={panelsLabel}
              aria-pressed={filesVisible}
              title={`${panelsLabel} (⌘J)`}
              onClick={onToggleFiles}
            >
              {filesVisible ? (
                <IconExpand />
              ) : (
                <span className="panel-count-badge" aria-hidden>
                  1
                </span>
              )}
            </button>
          ) : null}
        </div>
      </header>

      <SessionThread history={history} notices={notices} />

      <ApprovalPane
        approval={approval}
        onApprove={onApprove}
        onApproveSession={onApproveSession}
        onApprovePermanent={onApprovePermanent}
        onDeny={onDeny}
      />

      <CodeSessionComposer {...composer} />
    </section>
  );
}
