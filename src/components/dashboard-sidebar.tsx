"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNav } from "@/lib/nav";

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-surface-border bg-surface px-3 py-6">
      <Link
        href="/"
        className="px-3 pb-6 text-sm font-semibold tracking-tight"
      >
        VAA <span className="text-muted">KPI Portal</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {dashboardNav.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                active
                  ? "bg-accent/15 text-foreground"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
