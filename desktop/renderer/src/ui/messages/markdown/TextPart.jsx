import { MarkdownCodeBlock } from "./MarkdownCodeBlock.jsx";
import { RichMarkdownLink } from "./RichMarkdownLink.jsx";

/** Minimal markdown → React (fences, links, images, emphasis). */
export function TextPart({ text, isDone = true }) {
  const blocks = splitMarkdown(text || "");
  return (
    <div
      className="msg-part msg-part--text"
      data-message-part-type="text"
      data-streaming={isDone ? undefined : "true"}
    >
      {blocks.map((block, i) => {
        if (block.type === "code") {
          return (
            <MarkdownCodeBlock
              key={i}
              language={block.lang}
              code={block.value}
              isStreaming={!isDone && i === blocks.length - 1}
            />
          );
        }
        return (
          <div key={i} className="msg-part__rich">
            {renderRich(block.value, i)}
          </div>
        );
      })}
    </div>
  );
}

function splitMarkdown(src) {
  const parts = [];
  const re = /```([\w+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) {
      parts.push({ type: "text", value: src.slice(last, m.index).trim() });
    }
    parts.push({
      type: "code",
      lang: m[1] || "",
      value: m[2].replace(/\n$/, ""),
    });
    last = m.index + m[0].length;
  }
  const tail = src.slice(last).trim();
  if (tail) parts.push({ type: "text", value: tail });
  if (!parts.length && src) parts.push({ type: "text", value: src });
  return parts.filter((p) => p.value);
}

/**
 * Split a text block into paragraphs and pull image links out of `<p>` so they
 * can size as block media instead of being stretched by paragraph layout.
 */
function renderRich(text, blockKey) {
  const paragraphs = String(text).split(/\n{2,}/);
  const out = [];
  paragraphs.forEach((paragraph, pIndex) => {
    const segments = splitInlineSegments(paragraph);
    let inlineBuf = [];
    const flushInline = () => {
      if (!inlineBuf.length) return;
      out.push(
        <p key={`${blockKey}-p-${pIndex}-${out.length}`} className="msg-part__p">
          {inlineBuf}
        </p>,
      );
      inlineBuf = [];
    };
    segments.forEach((segment, sIndex) => {
      if (segment.type === "image") {
        flushInline();
        out.push(
          <div
            key={`${blockKey}-img-${pIndex}-${sIndex}`}
            className="msg-part__media"
          >
            {segment.node}
          </div>,
        );
        return;
      }
      inlineBuf.push(segment.node);
    });
    flushInline();
  });
  return out;
}

function splitInlineSegments(text) {
  const segments = [];
  const re =
    /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<]+|file:\/\/[^\s)<]+)|(\/(?:Users|home)\/[^\s)<]+\.(?:png|jpe?g|gif|webp))/gi;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      for (const node of renderEmphasis(text.slice(last, m.index), key)) {
        segments.push({ type: "text", node });
      }
      key += 1;
    }
    if (m[2] != null) {
      segments.push({
        type: "image",
        node: (
          <RichMarkdownLink key={key++} href={m[2]} forceImage>
            {m[1] || m[2]}
          </RichMarkdownLink>
        ),
      });
    } else if (m[3] != null && m[4] != null) {
      const href = m[4];
      const isImage = isImageHref(href) || isImageHref(m[3]);
      segments.push({
        type: isImage ? "image" : "text",
        node: (
          <RichMarkdownLink key={key++} href={href}>
            {m[3]}
          </RichMarkdownLink>
        ),
      });
    } else {
      const href = m[5] || m[6];
      const isImage = isImageHref(href);
      segments.push({
        type: isImage ? "image" : "text",
        node: (
          <RichMarkdownLink key={key++} href={href}>
            {href}
          </RichMarkdownLink>
        ),
      });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    for (const node of renderEmphasis(text.slice(last), key)) {
      segments.push({ type: "text", node });
    }
  }
  return segments;
}

function isImageHref(value) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(?:[?#].*)?$/i.test(String(value || ""));
}

function renderEmphasis(text, keyBase) {
  if (!text) return [];
  const nodes = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)([^*_\n]+?)\3|`([^`\n]+)`/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) {
      nodes.push(
        <strong key={`${keyBase}-b-${key++}`}>{m[2]}</strong>,
      );
    } else if (m[4] != null) {
      nodes.push(<em key={`${keyBase}-i-${key++}`}>{m[4]}</em>);
    } else if (m[5] != null) {
      nodes.push(
        <code key={`${keyBase}-c-${key++}`} className="md-inline-code">
          {m[5]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
