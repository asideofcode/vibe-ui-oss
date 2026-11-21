/**
 * Normalize app-server approval callbacks into a Vibe-like card model.
 *
 * Typical bash detail:
 *   {
 *     kind: "approval",
 *     effect: { toolName, kind, display: { message, summary, verb }, input: { command } },
 *     requiredPermissions: [{ label, sessionPattern, ... }],
 *     choices: ["approve", "approve_for_session", ...]
 *   }
 */

function stripBashPrefix(text) {
  return String(text || "").replace(/^bash:\s*/i, "").trim();
}

function firstString(...candidates) {
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function presentApproval(callback) {
  if (!callback) return null;
  const detail = callback.detail || {};
  const effect = detail.effect || {};
  const display = effect.display || {};
  const input = effect.input || detail.input || {};
  const toolName = firstString(
    effect.toolName,
    effect.tool_name,
    detail.toolName,
    detail.tool_name,
  );
  const shortTool = toolName.includes(".")
    ? toolName.split(".").pop()
    : toolName;

  const command = stripBashPrefix(
    firstString(
      display.message,
      input.command,
      display.settledMessage,
      display.summary,
      display.content,
      typeof detail.command === "string" ? detail.command : "",
    ),
  );

  const headline =
    callback.title ||
    (shortTool ? `Approve ${shortTool}` : "Approval needed");

  const verb = firstString(display.verb, display.statusText, "Running") || "Running";
  const reason =
    typeof detail.reason === "string" && detail.reason.trim()
      ? detail.reason.trim()
      : null;

  const permissions = Array.isArray(detail.requiredPermissions)
    ? detail.requiredPermissions
        .map((p) => p?.label || p?.sessionPattern || p?.invocationPattern)
        .filter(Boolean)
    : [];

  const choiceSet = new Set(
    Array.isArray(detail.choices) ? detail.choices : [],
  );

  return {
    callbackId: callback.callbackId || callback.id,
    kind: detail.kind || "approval",
    toolName,
    shortTool: shortTool || "tool",
    headline,
    verb,
    command,
    summary: stripBashPrefix(display.summary) || command,
    reason,
    permissions,
    choices: {
      once: choiceSet.size === 0 || choiceSet.has("approve"),
      session:
        choiceSet.size === 0 || choiceSet.has("approve_for_session"),
      permanent: choiceSet.has("approve_permanently"),
      deny: choiceSet.size === 0 || choiceSet.has("deny"),
    },
    raw: detail,
  };
}
