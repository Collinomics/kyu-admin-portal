// Theme — dark mode is *selected*: its own palette steps (palette.css),
// persisted, initialised from the OS preference, and the viewer's toggle
// wins both ways via [data-theme] on <html>.

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "kyu-monitor-theme";

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      /* private mode */
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}
