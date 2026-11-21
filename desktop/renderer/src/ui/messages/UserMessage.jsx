import { MessageFooter } from "./MessageFooter.jsx";
import { TextPart } from "./markdown/TextPart.jsx";

/** Mirrors upstream UserMessage → AuraMessageThreadUserMessage. */
export function UserMessage({ item }) {
  const text = item.content?.text || "";
  return (
    <article
      className="aura-user-message"
      data-message-author-role="user"
    >
      <div className="aura-user-message__bubble">
        {text ? <TextPart text={text} /> : null}
      </div>
      <MessageFooter
        variant="user"
        copyText={item.content?.copyText || text}
        createdAt={item.createdAt}
      />
    </article>
  );
}
