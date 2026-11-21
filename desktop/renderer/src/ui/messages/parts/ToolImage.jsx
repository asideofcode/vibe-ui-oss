import { useEffect, useState } from "react";

/**
 * Renders a local/tool image from a file URI, absolute path, or inline data.
 * Sizes from the bitmap's natural dimensions so 1×1 test PNGs don't become
 * full-bleed squares and screenshots keep their aspect ratio.
 */
export function ToolImage({
  uri,
  mimeType,
  alt = "Image",
  className = "harness-step__image",
}) {
  const [src, setSrc] = useState(() => inlineDataSrc(uri, mimeType));
  const [error, setError] = useState(null);
  const [natural, setNatural] = useState(null);

  useEffect(() => {
    const inline = inlineDataSrc(uri, mimeType);
    if (inline) {
      setSrc(inline);
      setError(null);
      setNatural(null);
      return undefined;
    }
    const reader =
      window.leChonk?.readLocalImage || window.leChonk?.readAttachmentImage;
    if (!uri || typeof reader !== "function") {
      setSrc(null);
      setError(uri ? "Image unavailable" : null);
      return undefined;
    }
    let cancelled = false;
    setError(null);
    setNatural(null);
    reader(uri)
      .then((result) => {
        if (!cancelled) setSrc(result?.dataUrl || null);
      })
      .catch((err) => {
        if (!cancelled) {
          setSrc(null);
          setError(err?.message || "Failed to load image");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uri, mimeType]);

  if (error) {
    return <div className="chat-image__error">{error}</div>;
  }
  if (!src) {
    return <div className="chat-image__loading">Loading image…</div>;
  }

  const sizeClass = naturalSizeClass(natural);
  return (
    <img
      className={`chat-image ${sizeClass} ${className}`.trim()}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={(event) => {
        const img = event.currentTarget;
        setNatural({
          width: img.naturalWidth || 0,
          height: img.naturalHeight || 0,
        });
      }}
      onError={() => {
        setError("Broken image");
        setSrc(null);
      }}
    />
  );
}

function naturalSizeClass(natural) {
  if (!natural?.width || !natural?.height) return "chat-image--pending";
  const { width, height } = natural;
  if (width < 8 || height < 8) return "chat-image--tiny";
  if (width <= 64 && height <= 64) return "chat-image--small";
  return "chat-image--full";
}

function inlineDataSrc(uri, mimeType) {
  if (typeof uri === "string" && uri.startsWith("data:")) return uri;
  if (
    typeof uri === "string" &&
    uri.length > 32 &&
    !uri.includes("://") &&
    !uri.startsWith("/") &&
    mimeType
  ) {
    return `data:${mimeType};base64,${uri}`;
  }
  return null;
}
