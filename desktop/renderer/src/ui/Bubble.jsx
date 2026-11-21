/** @deprecated Prefer ui/messages/* — kept only for any stray imports. */
export function Bubble({ kind, role, body, entryId }) {
  return (
    <article
      className={`meta-notice meta-notice--${kind === "user" || kind === "assistant" ? "meta" : kind}`}
      data-entry-id={entryId || undefined}
      data-legacy-bubble={kind}
    >
      {role ? <span className="role">{role}</span> : null}
      <div className="body">{body}</div>
    </article>
  );
}
