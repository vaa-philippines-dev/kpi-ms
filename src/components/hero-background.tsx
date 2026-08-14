"use client";

import ShapeGrid from "@/components/reactbits/ShapeGrid";
import { useTheme } from "@/components/theme-provider";

export function HeroBackground() {
  const { theme } = useTheme();
  const borderColor = theme === "light" ? "#d8dce3" : "#1f232b";
  const hoverFillColor = theme === "light" ? "#3b6fe033" : "#5b8cff22";

  return (
    <div className="absolute inset-0">
      <ShapeGrid
        shape="square"
        squareSize={48}
        speed={0.4}
        direction="diagonal"
        borderColor={borderColor}
        hoverFillColor={hoverFillColor}
        hoverTrailAmount={4}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
    </div>
  );
}
