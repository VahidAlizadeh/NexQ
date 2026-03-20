import { useEffect } from "react";
import { useConfigStore } from "../stores/configStore";

/**
 * Applies the current theme (dark/light/system) to the document root element.
 * When "system" is selected, listens for OS theme changes and updates in real time.
 * Persists theme choice to the config store automatically (handled by the setter).
 */
export function useTheme() {
  const theme = useConfigStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(mode: "dark" | "light") {
      root.classList.remove("dark", "light");
      root.classList.add(mode);
    }

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      // Apply immediately
      applyTheme(mediaQuery.matches ? "dark" : "light");

      // Listen for OS theme changes
      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? "dark" : "light");
      };
      mediaQuery.addEventListener("change", handler);

      return () => {
        mediaQuery.removeEventListener("change", handler);
      };
    } else {
      applyTheme(theme);
    }
  }, [theme]);
}
