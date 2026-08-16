"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftOpen } from "lucide-react";
import { matchNavItem, navItemLabel, visibleNavGroups } from "@/lib/nav";
import { LogoBadge } from "@/components/logo-badge";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  badge: number | null;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`relative flex items-center gap-2.5 rounded-md py-[5px] text-[12.5px] font-medium transition-colors ${
        collapsed ? "h-8 w-8 justify-center" : "px-2"
      } ${
        active
          ? "bg-surface-hover font-semibold text-foreground"
          : "text-muted hover:bg-surface-hover/60 hover:text-foreground"
      }`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${active ? "opacity-100" : "opacity-75"}`}
      />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
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
}

export function DashboardSidebar({
  role,
  submissionsToday,
  appName,
}: {
  role: string;
  submissionsToday: number;
  appName: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const groups = useMemo(() => visibleNavGroups(role), [role]);
  // Longest-prefix match, so a nested page (KPI Config) doesn't also light up
  // its parent (Connections).
  const activeHref = matchNavItem(pathname)?.item.href ?? null;

  const renderGroups = (collapsedNav: boolean) =>
    groups.map((group) => (
      <div key={group.label}>
        {!collapsedNav && (
          <p className="px-2 pt-3.5 pb-1 text-[10.5px] tracking-wide text-muted first:pt-0">
            {group.label}
          </p>
        )}
        <div className="flex flex-col gap-px">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={navItemLabel(item, role)}
              icon={item.icon}
              active={item.href === activeHref}
              collapsed={collapsedNav}
              badge={
                item.href === "/dashboard/submissions" && submissionsToday > 0
                  ? submissionsToday
                  : null
              }
            />
          ))}
        </div>
      </div>
    ));

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-3 border-r border-surface-border bg-surface py-2.5">
        <LogoBadge className="h-6 w-6 shrink-0 object-contain" />
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>

        <nav className="flex flex-1 flex-col items-center gap-3 overflow-y-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {renderGroups(true)}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[212px] shrink-0 flex-col border-r border-surface-border bg-surface px-2 py-2.5">
      <div className="flex items-center justify-between gap-2 px-2 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <LogoBadge className="h-7 w-7 shrink-0 object-contain" />
          <span className="truncate text-lg font-semibold tracking-tight text-foreground">
            {appName}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-px overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {renderGroups(false)}
      </nav>
    </aside>
  );
}
