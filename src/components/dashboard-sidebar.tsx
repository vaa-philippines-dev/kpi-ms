"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { dashboardNavGroups } from "@/lib/nav";
import { roleLabel } from "@/lib/roles";
import { signOutAction } from "@/app/dashboard/actions";

export function DashboardSidebar({
  email,
  role,
  submissionsToday,
}: {
  email: string;
  role: string;
  submissionsToday: number;
}) {
  const pathname = usePathname();
  const initial = email[0]?.toUpperCase() ?? "?";

  return (
    <aside className="flex w-72 shrink-0 flex-col rounded-2xl border border-surface-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3 px-1 pb-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-base font-semibold text-accent">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{email}</p>
          <p className="text-xs text-muted">{roleLabel(role)}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:opacity-90"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>

      <div className="border-t border-surface-border" />

      <nav className="mt-4 flex flex-1 flex-col gap-5">
        {dashboardNavGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-xs tracking-wide text-muted uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                const badge =
                  item.href === "/dashboard/submissions" && submissionsToday > 0
                    ? submissionsToday
                    : null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                      active
                        ? "bg-surface-hover text-accent"
                        : "text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {badge !== null && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-danger text-[11px] font-medium text-white">
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
