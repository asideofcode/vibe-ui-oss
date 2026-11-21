import { useEffect, useRef } from "react";
import { SessionThreadItem } from "./SessionThreadItem.jsx";

/**
 * Lightweight stand-in for upstream CodeConversationShell → ChatShell.
 * Virtualization / placement modes come later.
 */
export function CodeConversationShell({ items = [] }) {
  const ref = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [items]);

  return (
    <main
      className="transcript code-conversation-shell"
      id="transcript"
      aria-live="polite"
      ref={ref}
    >
      {items.length === 0 ? null : (
        <div className="code-conversation-shell__list">
          {items.map((item) => (
            <SessionThreadItem key={item.key} item={item} />
          ))}
        </div>
      )}
      <div ref={bottomRef} aria-hidden className="code-conversation-shell__end" />
    </main>
  );
}
