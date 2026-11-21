import { ToolImage } from "../parts/ToolImage.jsx";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)(?:[?#].*)?$/i;

export function RichMarkdownLink({ href, children, forceImage = false }) {
  const url = String(href || "");
  const isFile = url.startsWith("file://") || looksAbsolutePath(url);
  const isImage =
    forceImage ||
    IMAGE_EXT.test(url) ||
    IMAGE_EXT.test(String(children || ""));

  if (isFile && isImage) {
    const label = linkLabel(children, url);
    return (
      <span className="md-file-image">
        <ToolImage
          uri={url}
          alt={label}
          className="md-file-image__img"
        />
        <button
          type="button"
          className="md-link md-file-image__open"
          onClick={() => void openLocal(url)}
          title={url}
        >
          {label}
        </button>
      </span>
    );
  }

  if (isFile) {
    return (
      <button
        type="button"
        className="md-link md-link--file"
        onClick={() => void openLocal(url)}
        title={url}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      className="md-link"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
    </a>
  );
}

function looksAbsolutePath(value) {
  return /^\/(?:Users|home|private|var|tmp)\//i.test(value);
}

function fileLabel(url) {
  try {
    const path = url.startsWith("file://")
      ? decodeURIComponent(new URL(url).pathname)
      : url;
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
  } catch {
    return url;
  }
}

function linkLabel(children, url) {
  const raw = typeof children === "string" ? children.trim() : "";
  if (!raw || raw === url || raw.startsWith("file://") || looksAbsolutePath(raw)) {
    return fileLabel(url);
  }
  return raw;
}

async function openLocal(url) {
  if (typeof window.leChonk?.openLocalPath === "function") {
    try {
      await window.leChonk.openLocalPath(url);
      return;
    } catch (err) {
      console.debug("openLocalPath", err);
    }
  }
  // Fallback: still try navigating for non-file schemes.
  if (!String(url).startsWith("file://")) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
