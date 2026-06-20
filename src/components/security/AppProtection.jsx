import { useEffect } from "react";

export default function AppProtection() {
  useEffect(() => {
    const isEditable = (target) => {
      const tag = target?.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || target?.isContentEditable;
    };

    const preventContextMenu = (event) => {
      if (!isEditable(event.target)) event.preventDefault();
    };

    const preventDrag = (event) => {
      if (event.target?.tagName?.toLowerCase() === "img") event.preventDefault();
    };

    const preventCopyShortcuts = (event) => {
      if (isEditable(event.target)) return;
      const key = event.key?.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ["s", "p"].includes(key)) {
        event.preventDefault();
      }
    };

    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("dragstart", preventDrag);
    document.addEventListener("keydown", preventCopyShortcuts);

    return () => {
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("dragstart", preventDrag);
      document.removeEventListener("keydown", preventCopyShortcuts);
    };
  }, []);

  return null;
}