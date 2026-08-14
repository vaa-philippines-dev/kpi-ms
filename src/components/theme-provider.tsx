"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
  mounted: boolean;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The blocking init script in layout.tsx already set data-theme on <html>
  // before hydration (to avoid a flash) — read it once via a lazy
  // initializer, not an effect, since it's already correct on first render.
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Signals "client has hydrated" so consumers (ThemeToggle) can defer
    // theme-dependent rendering by one tick and avoid an SSR/client mismatch
    // — there's no lazy-initializer equivalent for "has mount happened".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mounted,
        toggleTheme: () =>
          setTheme((t) => (t === "dark" ? "light" : "dark")),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
