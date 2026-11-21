import { useMemo } from "react";
import {
  noticeItem,
  toThreadItems,
} from "../lib/history/toThreadItems.js";
import { CodeConversationShell } from "./messages/CodeConversationShell.jsx";

/**
 * Transcript surface.
 * - `history`: raw PublicHistoryEntry[] from vibe-app-server
 * - `notices`: local UI rows (errors, etc.) previously appended as Bubbles
 */
export function SessionThread({ history = [], notices = [] }) {
  const items = useMemo(() => {
    const fromHistory = toThreadItems(history);
    const fromNotices = notices.map((n) =>
      noticeItem({ key: n.key, body: n.body, role: n.role }),
    );
    return [...fromHistory, ...fromNotices];
  }, [history, notices]);

  return <CodeConversationShell items={items} />;
}
