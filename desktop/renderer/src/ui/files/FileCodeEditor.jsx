import Editor from "@monaco-editor/react";
import { useEffect } from "react";
import { setupMonaco } from "../../lib/monaco.js";

// Configure AMD loader paths before first Editor mount.
setupMonaco();

const EDITOR_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  wordWrap: "on",
  automaticLayout: true,
  renderLineHighlight: "line",
  folding: true,
  padding: { top: 8, bottom: 8 },
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
};

/** Read-only Monaco host — mirrors AuraCodeEditor / FileCodeEditor. */
export function FileCodeEditor({
  path,
  value = "",
  language = "plaintext",
  onMount,
}) {
  useEffect(() => {
    setupMonaco();
  }, []);

  return (
    <div className="file-code-editor" data-aura-code-editor="">
      <Editor
        key={path || "empty"}
        height="100%"
        theme="vs-dark"
        language={language}
        value={value}
        path={path || undefined}
        options={EDITOR_OPTIONS}
        loading={
          <div className="file-code-editor__loading">Loading editor…</div>
        }
        onMount={onMount}
      />
    </div>
  );
}
