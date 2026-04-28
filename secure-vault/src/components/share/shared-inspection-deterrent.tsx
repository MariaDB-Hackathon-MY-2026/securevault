"use client";

import { useEffect } from "react";

function isBlockedInspectorShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  const hasModifier = event.ctrlKey || event.metaKey;

  return (
    event.key === "F12" ||
    (hasModifier && event.shiftKey && ["c", "i", "j"].includes(key)) ||
    (hasModifier && ["s", "u"].includes(key))
  );
}

function blockEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

export function SharedInspectionDeterrent() {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      blockEvent(event);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isBlockedInspectorShortcut(event)) {
        blockEvent(event);
      }
    };

    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, []);

  return null;
}
