import Link from "next/link";
import { ClipboardList, Wrench } from "lucide-react";
import { auth } from "@/auth";
import { HeroBackground } from "@/components/hero-background";
import { DashboardAccessButton } from "@/components/dashboard-access-button";
import { BrandMark } from "@/components/brand-mark";

const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === "true";

export default async function Home() {
  if (MAINTENANCE_MODE) {
    return (
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
        <HeroBackground />

        <div className="relative w-full max-w-xl text-center">
          <BrandMark className="mb-4" />
          <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full border border-surface-border bg-surface/80 backdrop-blur">
            <Wrench className="size-6 text-muted" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Down for{" "}
            <span className="text-gradient-animated">maintenance.</span>
          </h1>
          <p className="mt-4 text-balance text-muted">
            We&apos;re making some improvements. The KPI dashboard will be
            back shortly — thanks for your patience.
          </p>
        </div>
      </main>
    );
  }

  const session = await auth();

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
      <HeroBackground />

      <div className="relative w-full max-w-xl text-center">
        <BrandMark className="mb-4" />
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Performance,{" "}
          <span className="text-gradient-animated">one place.</span>
        </h1>
        <p className="mt-4 text-balance text-muted">
          Monitor team performance and key KPIs with clarity and precision.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {session ? (
            <Link
              href="/dashboard"
              className="group flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              Access KPI Dashboard
            </Link>
          ) : (
            <DashboardAccessButton />
          )}
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
