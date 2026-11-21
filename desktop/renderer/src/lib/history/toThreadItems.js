/**
 * Adapt vibe-app-server PublicHistoryEntry[] into Vibe-like thread items.
 *
 * Upstream Desktop builds richer `user-message` / `assistant-message` parts
 * (see research/ui-flows/MESSAGES.md). We approximate by grouping a turn's
 * reasoning + effects under the following assistant message.
 */

function contentText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block) return "";
      if (typeof block === "string") return block;
      if (block.type === "text" && block.text) return block.text;
      if (block.text) return block.text;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function effectStep(entry) {
  const state = entry.state || {};
  const detail = entry.detail || {};
  return {
    id: entry.id,
    title: entry.title || "effect",
    // App-server statuses; HarnessStepRow normalizes toward pending|running|done|failed|interrupted
    status: state.status || "unknown",
    kind: inferEffectKind(entry),
    detail,
    outputText: state.output_text || state.outputText || "",
    images: effectImages(state.output),
    toolCallId: entry.tool_call_id || entry.toolCallId || null,
  };
}

/** Image blocks from a tool effect output (`uri` preferred; inline `data` as fallback). */
function effectImages(output) {
  const content = output?.content;
  if (!Array.isArray(content)) return [];
  const images = [];
  for (const block of content) {
    if (!block || block.type !== "image") continue;
    const mimeType = block.mimeType || block.mime_type || "image/jpeg";
    const uri = block.uri || block.path || null;
    const data = typeof block.data === "string" ? block.data : "";
    if (!uri && !data) continue;
    images.push({
      uri: uri || data,
      mimeType,
      alt: block.alt || block.altText || "Tool result",
    });
  }
  return images;
}

/** Rough map from effect title/detail → upstream harness step.kind tags. */
function inferEffectKind(entry) {
  const detail = entry.detail || {};
  const name = String(
    detail.name || detail.tool_name || detail.toolName || entry.title || "",
  ).toLowerCase();
  if (/bash|shell|command|exec|run_terminal/.test(name)) return "command_tool";
  if (/read_file|read |cat |open_file/.test(name)) return "read_file";
  if (/write_file|edit_file|apply_patch|search_replace/.test(name))
    return "write_file";
  if (/web_search|grep|glob|search/.test(name)) return "web_search";
  if (/subagent|agent_task/.test(name)) return "subagent_task";
  if (/scratchpad/.test(name)) return "scratchpad";
  if (/compact/.test(name)) return "compact_context";
  return "tool_call";
}

/**
 * @param {object[]} history - raw PublicHistoryEntry-like objects
 * @returns {object[]} thread items for SessionThread
 */
export function toThreadItems(history) {
  const items = [];
  if (!Array.isArray(history)) return items;

  let pendingReasoning = [];
  let pendingEffects = [];

  const flushAssistantShell = (messageEntry) => {
    const parts = [];
    for (const r of pendingReasoning) {
      parts.push({
        type: "reasoning",
        id: r.id,
        text: r.text || "",
        summary: r.summary || [],
      });
    }
    if (pendingEffects.length) {
      parts.push({
        type: "harness_steps",
        id: `${messageEntry?.id || "pending"}:harness`,
        steps: pendingEffects.map(effectStep),
      });
    }
    pendingReasoning = [];
    pendingEffects = [];

    if (messageEntry) {
      const text = contentText(messageEntry.content);
      if (text) {
        parts.push({
          type: "text",
          id: `${messageEntry.id}:text`,
          text,
        });
      }
      items.push({
        type: "assistant-message",
        key: messageEntry.id,
        id: messageEntry.id,
        messageId: messageEntry.id,
        createdAt: messageEntry.created_at || messageEntry.createdAt,
        generationStatus:
          messageEntry.generation_status || messageEntry.generationStatus,
        outcome: messageEntry.outcome,
        parts,
      });
      return;
    }

    if (parts.length) {
      items.push({
        type: "assistant-message",
        key: `orphan-${parts[0].id}`,
        id: parts[0].id,
        messageId: parts[0].id,
        parts,
      });
    }
  };

  for (const entry of history) {
    if (!entry?.id) continue;
    const type = entry.type;

    if (type === "message" && entry.role === "user") {
      flushAssistantShell(null);
      items.push({
        type: "user-message",
        key: entry.id,
        id: entry.id,
        createdAt: entry.created_at || entry.createdAt,
        content: {
          text: contentText(entry.content),
          blocks: entry.content || [],
          copyText: contentText(entry.content),
        },
        source: entry.source,
      });
      continue;
    }

    if (type === "message" && entry.role === "assistant") {
      flushAssistantShell(entry);
      continue;
    }

    if (type === "message" && entry.role === "system") {
      flushAssistantShell(null);
      items.push({
        type: "notice",
        key: entry.id,
        id: entry.id,
        text: contentText(entry.content) || "system",
      });
      continue;
    }

    if (type === "reasoning") {
      pendingReasoning.push(entry);
      continue;
    }

    if (type === "effect") {
      pendingEffects.push(entry);
      continue;
    }

    if (type === "callback") {
      flushAssistantShell(null);
      items.push({
        type: "callback",
        key: entry.id,
        id: entry.id,
        callbackId: entry.callback_id || entry.callbackId,
        title: entry.title || "callback",
        detail: entry.detail,
        state: entry.state,
      });
      continue;
    }

    if (type === "checkpoint" || type === "notice") {
      flushAssistantShell(null);
      const kind = entry.kind || "";
      const text =
        entry.message ||
        entry.title ||
        kind ||
        contentText(entry.content) ||
        type;
      // Collapse consecutive identical resume checkpoints (session restarts spam these).
      if (kind === "resumed" || text === "Resumed after a restart") {
        const prev = items[items.length - 1];
        if (
          prev?.type === "notice" &&
          (prev.kind === "resumed" || prev.text === text)
        ) {
          prev.key = entry.id;
          prev.id = entry.id;
          continue;
        }
      }
      items.push({
        type: "notice",
        key: entry.id,
        id: entry.id,
        kind,
        text,
        tone: kind === "resumed" ? "status" : "meta",
      });
      continue;
    }

    flushAssistantShell(null);
    items.push({
      type: "notice",
      key: entry.id,
      id: entry.id,
      text: type || "entry",
    });
  }

  flushAssistantShell(null);
  return items;
}

/** Local UI notices (errors, approvals ack) as thread items. */
export function noticeItem({ key, body, role }) {
  return {
    type: "notice",
    key,
    id: key,
    text: body,
    tone: role === "error" ? "error" : role === "approval" ? "approval" : "meta",
  };
}
