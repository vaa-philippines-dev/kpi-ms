"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle light/dark theme"
      className="fixed top-4 right-4 z-40 flex size-9 items-center justify-center rounded-full border border-surface-border bg-surface/80 text-muted backdrop-blur transition hover:text-foreground"
    >
      {mounted ? (
        theme === "dark" ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )
      ) : (
        <span className="size-4" />
      )}
    </button>
  );
}
