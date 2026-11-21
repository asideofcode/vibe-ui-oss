import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCodeEditor } from "./files/FileCodeEditor.jsx";
import { FilesSash } from "./FilesSash.jsx";
import {
  IconChevronRightSm,
  IconFile,
  IconFolderFill,
} from "./icons.jsx";
import { PanelDockHeader } from "./PanelDockHeader.jsx";
import { TerminalPane } from "./TerminalPane.jsx";

function filterNodes(nodes, query) {
  if (!query) return nodes;
  const q = query.toLowerCase();
  const walk = (list) => {
    const out = [];
    for (const node of list || []) {
      if (node.type === "dir") {
        const kids = walk(node.children || []);
        if (node.name.toLowerCase().includes(q) || kids.length) {
          out.push({ ...node, open: true, children: kids });
        }
      } else if (node.name.toLowerCase().includes(q)) {
        out.push(node);
      }
    }
    return out;
  };
  return walk(nodes);
}

function updateTree(nodes, targetPath, updater) {
  return (nodes || []).map((node) => {
    if (node.path === targetPath) return updater(node);
    if (node.type === "dir" && node.children?.length) {
      return {
        ...node,
        children: updateTree(node.children, targetPath, updater),
      };
    }
    return node;
  });
}

function TreeNodes({
  nodes,
  depth = 0,
  selectedPath,
  onToggleDir,
  onOpenFile,
}) {
  return nodes.map((node) => {
    const key = node.path || `${depth}-${node.name}`;
    const selected = node.type === "file" && node.path === selectedPath;
    return (
      <div key={key}>
        <button
          type="button"
          className={`tree-item${selected ? " selected" : ""}${
            node.type === "dir" && node.open ? " is-open" : ""
          }`}
          style={{ paddingLeft: `${4 + depth * 14}px` }}
          data-type="item"
          data-item-type={node.type === "dir" ? "folder" : "file"}
          data-item-path={node.path}
          aria-expanded={node.type === "dir" ? Boolean(node.open) : undefined}
          onClick={() => {
            if (node.type === "dir") onToggleDir(node);
            else if (node.path) onOpenFile(node);
          }}
        >
          <span
            className={`twisty${node.type === "dir" ? "" : " twisty--blank"}`}
            aria-hidden
          >
            {node.type === "dir" ? <IconChevronRightSm /> : null}
          </span>
          <span className="tree-item__icon" aria-hidden>
            {node.type === "dir" ? <IconFolderFill /> : <IconFile />}
          </span>
          <span className="tree-item__name">{node.name}</span>
        </button>
        {node.type === "dir" && node.open && node.children?.length ? (
          <div className="tree-children">
            <TreeNodes
              nodes={node.children}
              depth={depth + 1}
              selectedPath={selectedPath}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          </div>
        ) : null}
      </div>
    );
  });
}

function formatBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function PanelStub({ title, body }) {
  return (
    <div className="dock-stub">
      <p className="dock-stub__title">{title}</p>
      <p className="dock-stub__body">{body}</p>
    </div>
  );
}

/**
 * Files dock: tree + Monaco preview + Files/Git/Terminal switcher.
 * Mirrors PanelDock / FilesPanel / FilesBrowser / FilePreview.
 */
export function WorkspaceFiles({
  tree,
  emptyMessage,
  visible = true,
  width = 300,
  onWidthChange,
  onResizeEnd,
  onVisibilityChange,
  onFileActivated,
  cwd,
}) {
  const [localTree, setLocalTree] = useState(tree || []);
  const [filter, setFilter] = useState("");
  const [selectedPath, setSelectedPath] = useState(null);
  const [fileDoc, setFileDoc] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState("");
  const [openPanels, setOpenPanels] = useState(["files"]);
  const [activePanel, setActivePanel] = useState("files");
  const [showFileEditor, setShowFileEditor] = useState(false);
  const [terminalStarted, setTerminalStarted] = useState(false);

  const focusPanel = useCallback((id) => {
    setActivePanel(id);
    if (id !== "files") setShowFileEditor(false);
    if (id === "terminal") setTerminalStarted(true);
  }, []);

  const openPanel = useCallback(
    (id) => {
      setOpenPanels((prev) => (prev.includes(id) ? prev : [...prev, id]));
      focusPanel(id);
    },
    [focusPanel],
  );

  const closePanelTab = useCallback(
    (id) => {
      setOpenPanels((prev) => {
        const next = prev.filter((p) => p !== id);
        if (!next.length) {
          onVisibilityChange?.(false);
          return ["files"];
        }
        if (id === activePanel) {
          const idx = prev.indexOf(id);
          const fallback = next[Math.max(0, idx - 1)] || next[0];
          focusPanel(fallback);
        }
        return next;
      });
      if (id === "files") {
        setShowFileEditor(false);
      }
    },
    [activePanel, focusPanel, onVisibilityChange],
  );

  useEffect(() => {
    setLocalTree(tree || []);
  }, [tree]);

  const filtered = useMemo(
    () => filterNodes(localTree, filter.trim()),
    [localTree, filter],
  );

  const onToggleDir = useCallback(async (node) => {
    if (!node?.path) return;
    const willOpen = !node.open;
    if (
      willOpen &&
      (!node.children || node.children.length === 0) &&
      !node.truncated
    ) {
      try {
        const children = await window.leChonk.listWorkspace(node.path, 1);
        setLocalTree((prev) =>
          updateTree(prev, node.path, (n) => ({
            ...n,
            open: true,
            children: children || [],
          })),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    setLocalTree((prev) =>
      updateTree(prev, node.path, (n) => ({ ...n, open: !n.open })),
    );
  }, []);

  const onOpenFile = useCallback(
    async (node) => {
      if (!node?.path) return;
      openPanel("files");
      setSelectedPath(node.path);
      setShowFileEditor(true);
      setLoadingFile(true);
      setFileError("");
      onFileActivated?.(node.path);
      try {
        const doc = await window.leChonk.readWorkspaceFile(node.path);
        setFileDoc(doc);
      } catch (err) {
        setFileDoc(null);
        setFileError(err?.message || String(err));
      } finally {
        setLoadingFile(false);
      }
    },
    [onFileActivated, openPanel],
  );

  const closePreview = useCallback(() => {
    setFileDoc(null);
    setSelectedPath(null);
    setFileError("");
    setShowFileEditor(false);
  }, []);

  const previewOpen =
    activePanel === "files" &&
    showFileEditor &&
    Boolean(loadingFile || fileDoc || fileError);

  const fileTab =
    fileDoc || selectedPath
      ? {
          name: fileDoc?.name || selectedPath?.split(/[/\\]/).pop() || "file",
          path: fileDoc?.path || selectedPath,
        }
      : null;

  return (
    <aside
      className={`files${previewOpen ? " files--preview" : ""}`}
      aria-label="Workspace panels"
      aria-hidden={visible ? undefined : "true"}
      data-panel={activePanel}
      data-panel-visible={visible ? "true" : "false"}
      inert={visible ? undefined : true}
    >
      <FilesSash
        width={width}
        onWidthChange={onWidthChange}
        onResizeEnd={onResizeEnd}
        disabled={!visible}
      />
      <div className="files-top">
        <PanelDockHeader
          openPanels={openPanels}
          activePanel={activePanel}
          onSelectPanel={(id) => {
            focusPanel(id);
            if (id === "files") setShowFileEditor(false);
          }}
          onOpenPanel={openPanel}
          onClosePanelTab={closePanelTab}
          fileTab={fileTab}
          fileTabActive={previewOpen}
          onFocusFile={() => {
            focusPanel("files");
            if (fileTab) setShowFileEditor(true);
          }}
          onCloseFileTab={closePreview}
          onTogglePanels={() => onVisibilityChange?.(!visible)}
        />

        {activePanel === "files" && !previewOpen ? (
          <input
            className="files-filter"
            type="search"
            placeholder="Filter, or ? to search in files"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        ) : null}

        {previewOpen && fileTab ? (
          <div className="files-breadcrumb" title={fileTab.path}>
            <span className="files-breadcrumb__path">{fileTab.path}</span>
          </div>
        ) : null}
      </div>

      <div className="files-body">
        {openPanels.includes("git") && activePanel === "git" ? (
          <PanelStub
            title="Git Changes"
            body="Git status and diffs will land here — panel chrome matches Vibe’s dock."
          />
        ) : null}

        {terminalStarted ? (
          <div
            className="terminal-slot"
            hidden={activePanel !== "terminal"}
            aria-hidden={activePanel !== "terminal"}
          >
            <TerminalPane cwd={cwd} active={activePanel === "terminal"} />
          </div>
        ) : null}

        {openPanels.includes("files") && activePanel === "files" ? (
          <>
            <div className="file-tree" id="fileTree">
              {!filtered?.length ? (
                <div className="tree-empty">
                  {filter ? "No matches" : emptyMessage}
                </div>
              ) : (
                <TreeNodes
                  nodes={filtered}
                  selectedPath={selectedPath}
                  onToggleDir={onToggleDir}
                  onOpenFile={onOpenFile}
                />
              )}
              {cwd ? (
                <div className="file-tree__cwd" title={cwd}>
                  {cwd}
                </div>
              ) : null}
            </div>

            {previewOpen ? (
              <div className="file-preview" data-aura-code-editor="">
                {loadingFile ? (
                  <div className="file-preview__status">Opening…</div>
                ) : null}
                {fileError ? (
                  <div className="file-preview__status file-preview__status--error">
                    {fileError}
                  </div>
                ) : null}
                {fileDoc?.binary ? (
                  <div className="file-preview__status">
                    Binary file ({formatBytes(fileDoc.size)}) — not shown in
                    editor
                  </div>
                ) : null}
                {fileDoc && !fileDoc.binary ? (
                  <FileCodeEditor
                    path={fileDoc.path}
                    value={fileDoc.content || ""}
                    language={fileDoc.language || "plaintext"}
                  />
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
