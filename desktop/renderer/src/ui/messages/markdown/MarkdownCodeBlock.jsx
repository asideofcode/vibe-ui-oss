import { useState } from "react";

export function MarkdownCodeBlock({ language = "", code = "", isStreaming }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="md-code"
      data-language={language || undefined}
      data-streaming={isStreaming ? "true" : undefined}
    >
      <div className="md-code__bar">
        <span className="md-code__lang">{language || "code"}</span>
        <button type="button" className="md-code__copy" onClick={() => void onCopy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="md-code__pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
