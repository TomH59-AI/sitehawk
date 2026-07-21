import { useState, useRef, useCallback } from "react";

/**
 * useDraggable — lets the HawkBot launcher/panel be grabbed and moved anywhere.
 * pos is null until the user drags (default CSS position applies), then {x, y}.
 * wasDragged() distinguishes a drag from a plain click on the same element.
 */
export default function useDraggable() {
  const [pos, setPos] = useState(null);
  const movedRef = useRef(false);

  const onPointerDown = useCallback((e) => {
    // Only left mouse button / touch
    if (e.button !== undefined && e.button !== 0) return;
    const el = e.currentTarget.closest("[data-hawkbot-drag]") || e.currentTarget;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    const w = rect.width;
    const h = rect.height;
    movedRef.current = false;

    const onMove = (ev) => {
      if (!movedRef.current && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      movedRef.current = true;
      ev.preventDefault();
      setPos({
        x: Math.min(Math.max(ev.clientX - offsetX, 8), window.innerWidth - w - 8),
        y: Math.min(Math.max(ev.clientY - offsetY, 8), window.innerHeight - h - 8),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const wasDragged = useCallback(() => movedRef.current, []);

  // Inline style that overrides the default bottom-left anchoring once dragged,
  // clamped so the element (of given size) stays on screen.
  const styleFor = useCallback((maxW, maxH) => {
    if (!pos) return undefined;
    const w = Math.min(maxW, window.innerWidth - 16);
    const h = Math.min(maxH, window.innerHeight - 16);
    return {
      left: Math.min(Math.max(pos.x, 8), window.innerWidth - w - 8),
      top: Math.min(Math.max(pos.y, 8), window.innerHeight - h - 8),
      bottom: "auto",
      right: "auto",
    };
  }, [pos]);

  return { pos, onPointerDown, wasDragged, styleFor };
}