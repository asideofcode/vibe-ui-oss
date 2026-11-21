import { presentApproval } from "../../../lib/approvalPresentation.js";

/** History inline callback — preview only (live actions live in ApprovalPane). */
export function CallbackCard({ title, detail, state }) {
  const presented = presentApproval({ title, detail });
  const kind = detail?.kind || presented?.kind || "callback";
  const command = presented?.command;
  const toolName = presented?.toolName;
  const shortTool = presented?.shortTool;

  return (
    <aside
      className={`callback-card${kind === "approval" ? " callback-card--approval" : ""}`}
      data-callback-kind={kind}
      data-callback-state={state || undefined}
    >
      <header className="callback-card__title">
        {presented?.headline || title || kind}
      </header>
      {toolName ? (
        <div className="callback-card__meta">
          <span className="approval-tool__kind">
            {shortTool?.toUpperCase?.() || "TOOL"}
          </span>{" "}
          {toolName}
        </div>
      ) : null}
      {command ? (
        <pre className="callback-card__code">{command}</pre>
      ) : detail?.message || detail?.prompt ? (
        <p className="callback-card__body">
          {detail.message || detail.prompt}
        </p>
      ) : null}
    </aside>
  );
}
