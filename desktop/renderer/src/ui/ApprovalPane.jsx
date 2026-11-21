/**
 * Live tool-approval card — mirrors Vibe Desktop / CLI approval prompt:
 * human command preview + Allow once / Allow for session / Deny.
 */
export function ApprovalPane({
  approval,
  onApprove,
  onApproveSession,
  onApprovePermanent,
  onDeny,
}) {
  if (!approval) return null;

  const {
    headline,
    toolName,
    shortTool,
    verb,
    command,
    reason,
    permissions,
    choices,
  } = approval;

  return (
    <aside
      className="approval"
      id="approvalPane"
      data-approval-tool={toolName || undefined}
      role="alertdialog"
      aria-labelledby="approvalTitle"
    >
      <div className="approval-head">
        <div className="approval-head__row">
          <span className="approval-badge" aria-hidden>
            ⚠
          </span>
          <div className="approval-head__text">
            <h2 id="approvalTitle">{headline || "Approval needed"}</h2>
            {toolName ? (
              <p className="approval-tool">
                <span className="approval-tool__kind">
                  {(shortTool || "tool").toUpperCase()}
                </span>
                <span className="approval-tool__name">{toolName}</span>
              </p>
            ) : null}
          </div>
        </div>
        {reason ? <p className="approval-reason">{reason}</p> : null}
        {permissions?.length ? (
          <ul className="approval-perms">
            {permissions.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {command ? (
        <div className="approval-preview">
          <div className="approval-preview__label">{verb}</div>
          <pre id="approvalDetail" className="approval-preview__code">
            {command}
          </pre>
        </div>
      ) : (
        <pre
          id="approvalDetail"
          className="approval-preview__code approval-preview__code--empty"
        >
          No command preview
        </pre>
      )}

      <div className="approval-actions">
        {choices?.once !== false ? (
          <button type="button" id="approveBtn" onClick={onApprove}>
            Allow once
          </button>
        ) : null}
        {choices?.session !== false ? (
          <button
            type="button"
            id="approveSessionBtn"
            className="ghost"
            onClick={onApproveSession}
          >
            Allow for session
          </button>
        ) : null}
        {choices?.permanent && onApprovePermanent ? (
          <button
            type="button"
            id="approvePermanentBtn"
            className="ghost"
            onClick={onApprovePermanent}
          >
            Always allow
          </button>
        ) : null}
        {choices?.deny !== false ? (
          <button type="button" id="denyBtn" className="danger" onClick={onDeny}>
            Deny
          </button>
        ) : null}
      </div>
    </aside>
  );
}
