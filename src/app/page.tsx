import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import ShapeGrid from "@/components/reactbits/ShapeGrid";

export default function Home() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
      <div className="absolute inset-0">
        <ShapeGrid
          shape="square"
          squareSize={48}
          speed={0.4}
          direction="diagonal"
          borderColor="#1f232b"
          hoverFillColor="#5b8cff22"
          hoverTrailAmount={4}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      </div>

      <div className="relative w-full max-w-xl text-center">
        <p className="mb-4 inline-block rounded-full border border-surface-border bg-surface/80 px-3 py-1 text-xs tracking-wide text-muted uppercase backdrop-blur">
          VAA Philippines
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Performance,{" "}
          <span className="text-gradient-animated">one place.</span>
        </h1>
        <p className="mt-4 text-balance text-muted">
          Monitor team performance and key KPIs with clarity and precision.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
          >
            Access KPI Dashboard
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/submit"
            className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface/80 px-5 py-2.5 text-sm font-medium text-foreground backdrop-blur transition hover:bg-surface-hover"
          >
            <ClipboardList className="size-4" />
            Submit KPI Data
          </Link>
        </div>
      </div>
    </main>
  );
}
