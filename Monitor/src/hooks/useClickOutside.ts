// Dismiss a popover on outside click / Escape.
// Usage: const { ref, open, setOpen } = useClickOutside<HTMLDivElement>();

import { useEffect, useRef, useState } from "react";

export function useClickOutside<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { ref, open, setOpen };
}
