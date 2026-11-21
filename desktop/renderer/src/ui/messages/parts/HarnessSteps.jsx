import { useEffect, useState } from "react";
import { HarnessStepRow } from "./HarnessStepRow.jsx";

/** Mirrors PreparedHarnessSteps → HarnessStepsView (AuraCollapsible list). */
export function HarnessSteps({
  steps = [],
  thinkingLabel,
  isActive = false,
  defaultOpen,
}) {
  const hasPendingApproval = steps.some(
    (s) => s.status === "pending" || s.status === "blocked",
  );
  // Stay collapsed by default — only open for pending approvals (or explicit defaultOpen).
  const [open, setOpen] = useState(
    defaultOpen ?? hasPendingApproval,
  );

  useEffect(() => {
    if (hasPendingApproval) setOpen(true);
  }, [hasPendingApproval]);

  if (!steps.length && !thinkingLabel) return null;

  const label =
    thinkingLabel ||
    (steps.length === 1
      ? steps[0].title
      : `${steps.length} step${steps.length === 1 ? "" : "s"}`);

  return (
    <div
      className="harness-steps group/disclosure-trigger"
      data-harness-active={isActive ? "true" : undefined}
      data-state={open ? "open" : "closed"}
    >
      <button
        type="button"
        className="harness-steps__trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="harness-steps__chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <span className="harness-steps__label">{label}</span>
        {isActive ? <span className="harness-steps__pulse" /> : null}
      </button>
      {open ? (
        <ul className="harness-steps__list">
          {steps.map((step) => (
            <HarnessStepRow key={step.id} step={step} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
