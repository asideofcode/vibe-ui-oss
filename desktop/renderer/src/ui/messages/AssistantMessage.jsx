import { MessageFooter } from "./MessageFooter.jsx";
import { TextPart } from "./markdown/TextPart.jsx";
import { HarnessSteps } from "./parts/HarnessSteps.jsx";
import { ReasoningPart } from "./parts/ReasoningPart.jsx";

/**
 * Mirrors upstream AssistantMessage part matcher:
 * text | harness_steps | reasoning (+ stubs for the rest).
 */
export function AssistantMessage({ item }) {
  const parts = item.parts || [];
  const generating =
    item.generationStatus === "generating" ||
    item.generationStatus === "streaming";
  const copyText = parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n\n");

  return (
    <article
      className="aura-assistant-message group/assistant-message"
      data-message-author-role="assistant"
    >
      <div className="aura-assistant-message__content">
        {/* Quiet spinner only — avoid a second "Thinking" disclosure while streaming. */}
        {parts.length === 0 && generating ? (
          <div className="harness-steps harness-steps--quiet" data-harness-active="true">
            <span className="harness-steps__pulse" aria-label="Thinking" />
          </div>
        ) : null}
        {parts.map((part) => {
          switch (part.type) {
            case "text":
              return (
                <TextPart
                  key={part.id}
                  text={part.text}
                  isDone={!generating}
                />
              );
            case "harness_steps":
              return (
                <HarnessSteps
                  key={part.id}
                  steps={part.steps}
                  isActive={generating}
                  defaultOpen={false}
                />
              );
            case "reasoning":
              return (
                <ReasoningPart
                  key={part.id}
                  text={part.text}
                  summary={part.summary}
                  defaultOpen={false}
                />
              );
            default:
              return (
                <div key={part.id} className="msg-part msg-part--unknown">
                  Unsupported part: {part.type}
                </div>
              );
          }
        })}
      </div>
      <MessageFooter
        variant="assistant"
        copyText={copyText}
        createdAt={item.createdAt}
        className="aura-assistant-message__footer"
      />
    </article>
  );
}
