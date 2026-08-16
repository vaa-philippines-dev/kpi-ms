"use client";

import { Sun, Moon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";

const VARIANT_STYLES = {
  floating:
    "fixed top-4 right-4 z-40 size-9 rounded-full border border-surface-border bg-surface/80 backdrop-blur",
  inline: "size-8 rounded-lg hover:bg-surface-hover",
} as const;

export function ThemeToggle({
  variant = "floating",
}: {
  variant?: keyof typeof VARIANT_STYLES;
}) {
  const { theme, toggleTheme, mounted } = useTheme();
  const pathname = usePathname();

  // The dashboard renders its own toggle in the topbar; the floating one from
  // the root layout would collide with it.
  if (variant === "floating" && pathname.startsWith("/dashboard")) return null;

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle light/dark theme"
      className={`flex items-center justify-center text-muted transition hover:text-foreground ${VARIANT_STYLES[variant]}`}
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
