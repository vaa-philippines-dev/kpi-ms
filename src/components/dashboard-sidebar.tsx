"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNavGroups } from "@/lib/nav";
import { UserMenu } from "@/components/user-menu";

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

  return (
    <aside className="flex w-72 shrink-0 flex-col rounded-2xl border border-surface-border bg-surface p-4 shadow-sm">
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {dashboardNavGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-xs text-muted">{group.label}</p>
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

      <div className="mt-3 border-t border-surface-border pt-3">
        <UserMenu email={email} role={role} />
      </div>
    </aside>
  );
}
