import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));
const renderer = path.join(root, "renderer");

export default defineConfig({
  root: renderer,
  base: "./",
  publicDir: path.join(renderer, "public"),
  plugins: [react()],
  worker: {
    format: "es",
  },
  optimizeDeps: {
    include: ["monaco-editor", "@monaco-editor/react"],
  },
  build: {
    outDir: path.join(renderer, "dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
