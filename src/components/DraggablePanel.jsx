import { useRef, useState } from "react";

export default function DraggablePanel({
  children,
  defaultPos = { x: 20, y: 80 },
  className = "",
}) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState(defaultPos);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const handle = event.target.closest("[data-drag-handle]");
    if (!handle) return;

    const panel = panelRef.current;
    const parent = panel?.offsetParent;
    if (!panel || !parent) return;

    const panelRect = panel.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
      parentRect,
    };
    panel.setPointerCapture?.(event.pointerId);
    setDragging(true);
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel || drag.pointerId !== event.pointerId) return;

    const maxX = Math.max(8, drag.parentRect.width - panel.offsetWidth - 8);
    const maxY = Math.max(8, drag.parentRect.height - panel.offsetHeight - 8);
    setPosition({
      x: Math.min(Math.max(8, event.clientX - drag.parentRect.left - drag.offsetX), maxX),
      y: Math.min(Math.max(8, event.clientY - drag.parentRect.top - drag.offsetY), maxY),
    });
  };

  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    panelRef.current?.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={panelRef}
      className={`absolute z-30 select-none touch-none ${className}`}
      style={{
        left: position.x,
        top: position.y,
        cursor: dragging ? "grabbing" : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      {children}
    </div>
  );
}
