import { loader } from "@monaco-editor/react";

let configured = false;

/**
 * Load Monaco from the AMD build we ship in public/monaco/vs
 * (works under Electron file:// without Vite worker hacks).
 */
export function setupMonaco() {
  if (configured) return;
  configured = true;

  // Vite base is "./" — resolve relative to the loaded index.html.
  const vsPath = new URL("./monaco/vs", window.location.href).href.replace(
    /\/$/,
    "",
  );
  loader.config({ paths: { vs: vsPath } });
}
