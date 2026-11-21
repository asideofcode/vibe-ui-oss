import { useState } from "react";
import { TextPart } from "../markdown/TextPart.jsx";

export function ReasoningPart({ text, summary = [], defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const title =
    (Array.isArray(summary) && summary[0]) || "Thinking";

  return (
    <div className="reasoning-part" data-message-part-type="reasoning">
      <button
        type="button"
        className="reasoning-part__trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        <span>{title}</span>
      </button>
      {open && text ? <TextPart text={text} /> : null}
    </div>
  );
}
