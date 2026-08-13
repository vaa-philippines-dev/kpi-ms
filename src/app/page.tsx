import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-xl text-center">
        <p className="mb-4 inline-block rounded-full border border-surface-border bg-surface px-3 py-1 text-xs tracking-wide text-muted uppercase">
          VAA Philippines
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Performance, <span className="text-accent">one place.</span>
        </h1>
        <p className="mt-4 text-balance text-muted">
          Monitor team performance and key KPIs with clarity and precision.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Access KPI Dashboard
          </Link>
          <Link
            href="/submit"
            className="rounded-lg border border-surface-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface"
          >
            Submit KPI Data
          </Link>
        </div>
      </div>
    </main>
  );
}
