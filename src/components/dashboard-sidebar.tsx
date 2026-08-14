"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { dashboardNavGroups } from "@/lib/nav";
import { UserMenu } from "@/components/user-menu";
import { LogoBadge } from "@/components/logo-badge";

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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-surface-border bg-surface transition-[width] duration-200 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div
        className={`flex items-center px-3 py-4 ${collapsed ? "justify-center" : "justify-between"}`}
      >
        {!collapsed && <LogoBadge className="scale-90" />}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-3">
        {dashboardNavGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-xs text-muted">{group.label}</p>
            )}
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
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center gap-2.5 rounded-xl py-2 text-sm transition ${
                      collapsed ? "justify-center px-2" : "px-3"
                    } ${
                      active
                        ? "bg-surface-hover text-foreground font-medium"
                        : "text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && (
                      <span className="flex-1">{item.label}</span>
                    )}
                    {badge !== null &&
                      (collapsed ? (
                        <span className="absolute top-1 right-1.5 size-2 rounded-full bg-danger" />
                      ) : (
                        <span className="flex size-5 items-center justify-center rounded-full bg-danger text-[11px] font-medium text-white">
                          {badge}
                        </span>
                      ))}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-surface-border p-3">
        <UserMenu email={email} role={role} collapsed={collapsed} />
      </div>
    </aside>
  );
}
