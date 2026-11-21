import { useEffect, useState } from "react";
import { ToolImage } from "./ToolImage.jsx";

/**
 * Stand-in for HarnessStepLine → AuraHarnessStep.
 * Upstream matches step.kind (command_tool, read_file, reasoning, …).
 */
export function HarnessStepRow({ step }) {
  const status = normalizeStatus(step.status);
  const kind = step.kind || inferKind(step) || "tool_call";
  const images = Array.isArray(step.images) ? step.images : [];
  const shouldExpand =
    status === "pending" ||
    status === "blocked" ||
    status === "failed" ||
    images.length > 0;
  const [expanded, setExpanded] = useState(shouldExpand);
  // Effects often start without images; open once attachment URIs arrive.
  useEffect(() => {
    if (images.length > 0) setExpanded(true);
  }, [images.length]);
  const hasDetails = Boolean(step.outputText) || images.length > 0;

  return (
    <li
      className="harness-step"
      data-step-status={status}
      data-step-kind={kind}
      data-step-id={step.id}
      data-state={expanded ? "open" : "closed"}
    >
      <span className="harness-step__status" aria-hidden>
        {statusGlyph(status)}
      </span>
      <div className="harness-step__body">
        {hasDetails ? (
          <button
            type="button"
            className="harness-step__title harness-step__title--btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="harness-step__kind">{kindLabel(kind)}</span>
            {step.title}
          </button>
        ) : (
          <div className="harness-step__title">
            <span className="harness-step__kind">{kindLabel(kind)}</span>
            {step.title}
          </div>
        )}
        {expanded && step.outputText ? (
          <pre className="harness-step__out">{trim(step.outputText)}</pre>
        ) : null}
        {expanded && images.length > 0 ? (
          <div className="harness-step__images">
            {images.map((image, index) => (
              <ToolImage
                key={`${step.id}:img:${index}`}
                uri={image.uri}
                mimeType={image.mimeType}
                alt={image.alt}
              />
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Map app-server effect states → harness step states. */
function normalizeStatus(status) {
  switch (status) {
    case "completed":
      return "done";
    case "cancelled":
    case "skipped":
      return "interrupted";
    case "blocked":
      return "pending";
    default:
      return status || "unknown";
  }
}

function inferKind(step) {
  const title = String(step.title || "").toLowerCase();
  const detail = step.detail || {};
  const name = String(detail.name || detail.tool_name || detail.toolName || "").toLowerCase();
  const blob = `${title} ${name}`;
  if (/reason|think/.test(blob)) return "reasoning";
  if (/bash|shell|command|exec/.test(blob)) return "command_tool";
  if (/read|cat|open file/.test(blob)) return "read_file";
  if (/write|edit|patch|apply/.test(blob)) return "write_file";
  if (/search|grep|glob/.test(blob)) return "web_search";
  if (/subagent|agent/.test(blob)) return "subagent_task";
  return null;
}

function kindLabel(kind) {
  switch (kind) {
    case "reasoning":
      return "think";
    case "command_tool":
      return "cmd";
    case "read_file":
      return "read";
    case "write_file":
      return "write";
    case "web_search":
      return "search";
    case "subagent_task":
      return "agent";
    default:
      return "tool";
  }
}

function statusGlyph(status) {
  switch (status) {
    case "done":
    case "completed":
      return "✓";
    case "failed":
      return "!";
    case "running":
      return "●";
    case "pending":
      return "⏸";
    case "interrupted":
      return "–";
    default:
      return "·";
  }
}

function trim(s) {
  const t = String(s);
  return t.length > 800 ? `${t.slice(0, 800)}…` : t;
}
