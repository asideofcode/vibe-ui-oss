export function entryKind(entry) {
  if (!entry) return "meta";
  // Unified harness history uses type:"message" + role.
  if (entry.type === "message") {
    if (entry.role === "user") return "user";
    if (entry.role === "assistant") return "assistant";
    return "meta";
  }
  switch (entry.type) {
    case "user_message":
      return "user";
    case "assistant_message":
    case "thought":
      return "assistant";
    case "tool_call":
    case "tool_result":
      return "tool";
    case "checkpoint":
    case "callback":
      return "meta";
    default:
      return "meta";
  }
}

export function summarize(value) {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return s.length > 1200 ? `${s.slice(0, 1200)}…` : s;
  } catch {
    return String(value);
  }
}

export function entryText(entry) {
  if (!entry) return "";
  if (typeof entry.text === "string") return entry.text;
  if (entry.type === "checkpoint") {
    return entry.message || entry.kind || "checkpoint";
  }
  if (Array.isArray(entry.content)) {
    return entry.content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block?.text) return block.text;
        if (block?.type === "text" && block.text) return block.text;
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  if (entry.type === "tool_call") {
    const name = entry.toolName || entry.name || "tool";
    return `${name}(${summarize(entry.arguments || entry.input || {})})`;
  }
  if (entry.type === "tool_result") {
    return summarize(entry.output ?? entry.result ?? entry);
  }
  if (entry.title) return entry.title;
  if (entry.message) return entry.message;
  return summarize(entry);
}

export function entryRoleLabel(entry, kind) {
  if (entry?.role === "user" || kind === "user") return "you";
  if (entry?.role === "assistant" || kind === "assistant") return "assistant";
  if (entry?.type === "checkpoint") return "system";
  return entry?.type || kind;
}

export function sessionLabel(session) {
  if (!session) return "Local Code";
  const title = (session.title || "").trim();
  if (title) return title;
  const preview = (session.preview || "").trim();
  if (preview) return preview.length > 48 ? `${preview.slice(0, 48)}…` : preview;
  return "Untitled session";
}

export function shortPath(p) {
  if (!p) return "…";
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  return parts.slice(-2).join("/");
}

export function projectLabel(p) {
  if (!p) return "project";
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] || "project";
}

/** Map identity/read → footer label matching Vibe (org handle + KT initials). */
export function identityPresentation(identity) {
  if (!identity) {
    return {
      accountName: "Local",
      accountInitials: "V",
      workspaceName: "Default Workspace",
    };
  }
  const first = (identity.firstName || "").trim();
  const last = (identity.lastName || "").trim();
  const org = (identity.organization?.name || "").trim();
  const email = (identity.email || "").trim();
  const accountName =
    org ||
    first ||
    (email.includes("@") ? email.split("@")[0] : email) ||
    "Local";
  let accountInitials = "V";
  if (first && last) {
    accountInitials = `${first[0]}${last[0]}`;
  } else if (first) {
    accountInitials = first.slice(0, 2);
  } else if (accountName && accountName !== "Local") {
    accountInitials = accountName.slice(0, 2);
  }
  return {
    accountName,
    accountInitials: accountInitials.toUpperCase(),
    workspaceName:
      identity.workspace?.name?.trim() || "Default Workspace",
  };
}
