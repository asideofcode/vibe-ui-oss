import { AssistantMessage } from "./AssistantMessage.jsx";
import { UserMessage } from "./UserMessage.jsx";
import { CallbackCard } from "./parts/CallbackCard.jsx";
import { MetaNotice } from "./parts/MetaNotice.jsx";

/** Mirrors upstream SessionThreadItem → SessionThreadMessage routing. */
export function SessionThreadItem({ item }) {
  const role =
    item.type === "user-message"
      ? "user"
      : item.type === "assistant-message"
        ? "assistant"
        : "system";

  const status =
    item.type === "assistant-message"
      ? messageStatus(item)
      : undefined;

  let body = null;
  switch (item.type) {
    case "user-message":
      body = <UserMessage item={item} />;
      break;
    case "assistant-message":
      body = <AssistantMessage item={item} />;
      break;
    case "callback":
      body = (
        <CallbackCard
          title={item.title}
          detail={item.detail}
          state={item.state}
        />
      );
      break;
    case "notice":
      body = <MetaNotice text={item.text} tone={item.tone || "meta"} />;
      break;
    default:
      body = <MetaNotice text={item.type || "unknown"} />;
  }

  return (
    <div
      className={`thread-item${item.type === "user-message" ? " group/user-message" : ""}${item.type === "assistant-message" ? " group/assistant-message" : ""}`}
      data-message-author-role={role}
      data-message-status={status}
      data-thread-item-type={item.type}
      data-thread-item-key={item.key}
    >
      {body}
    </div>
  );
}

function messageStatus(item) {
  const gen = item.generationStatus;
  if (gen === "generating" || gen === "streaming") return "generating";
  if (item.outcome?.type === "discarded" || gen === "error") return "error";
  if (item.parts?.length) return "completed";
  return undefined;
}
