/** System / checkpoint row — status tone mirrors CLI `✓ Resumed after a restart`. */
export function MetaNotice({ text, tone = "meta" }) {
  const isStatus = tone === "status";
  return (
    <div className={`meta-notice meta-notice--${tone}`} data-tone={tone}>
      {isStatus ? <span className="meta-notice__mark" aria-hidden>✓</span> : null}
      <span className="meta-notice__text">{text}</span>
    </div>
  );
}
