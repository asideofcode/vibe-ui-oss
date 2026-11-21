export function MessageFooter({
  variant = "assistant",
  copyText,
  createdAt,
  className = "",
}) {
  const time =
    typeof createdAt === "number"
      ? new Date(createdAt * (createdAt < 2e10 ? 1000 : 1)).toLocaleTimeString(
          [],
          { hour: "2-digit", minute: "2-digit" },
        )
      : null;

  const onCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      /* ignore */
    }
  };

  return (
    <footer
      className={`msg-footer msg-footer--${variant} ${className}`.trim()}
      data-message-footer={variant}
    >
      {time ? <time className="msg-footer__time">{time}</time> : null}
      {copyText ? (
        <button
          type="button"
          className="msg-footer__btn"
          onClick={() => void onCopy()}
        >
          Copy
        </button>
      ) : null}
    </footer>
  );
}
