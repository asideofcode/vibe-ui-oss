import { useCallback, useEffect, useRef } from "react";

export const FILES_WIDTH_MIN = 240;
export const FILES_WIDTH_MAX = 960;
export const FILES_WIDTH_DEFAULT = 300;

/**
 * Vertical resize handle on the left edge of the right dock.
 * Drag left → wider panel.
 */
export function FilesSash({ width, onWidthChange, onResizeEnd, disabled = false }) {
  const dragRef = useRef(null);

  const onPointerDown = useCallback(
    (event) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        startX: event.clientX,
        startWidth: width,
        pointerId: event.pointerId,
      };
      document.documentElement.classList.add("is-resizing-files");
    },
    [disabled, width],
  );

  const onPointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const delta = drag.startX - event.clientX;
      const next = Math.min(
        FILES_WIDTH_MAX,
        Math.max(FILES_WIDTH_MIN, Math.round(drag.startWidth + delta)),
      );
      onWidthChange(next);
    },
    [onWidthChange],
  );

  const endDrag = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || (event && event.pointerId !== drag.pointerId)) return;
      dragRef.current = null;
      document.documentElement.classList.remove("is-resizing-files");
      try {
        event?.currentTarget?.releasePointerCapture?.(drag.pointerId);
      } catch {
        /* ignore */
      }
      onResizeEnd?.();
    },
    [onResizeEnd],
  );

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("is-resizing-files");
    };
  }, []);

  if (disabled) return null;

  return (
    <div
      className="files-sash"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
      aria-valuenow={width}
      aria-valuemin={FILES_WIDTH_MIN}
      aria-valuemax={FILES_WIDTH_MAX}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onWidthChange(
            Math.min(FILES_WIDTH_MAX, width + 16),
          );
          onResizeEnd?.();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onWidthChange(
            Math.max(FILES_WIDTH_MIN, width - 16),
          );
          onResizeEnd?.();
        }
      }}
    />
  );
}
