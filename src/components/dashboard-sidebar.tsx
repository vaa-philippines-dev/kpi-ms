"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PanelLeft, PanelLeftOpen } from "lucide-react";
import { matchNavItem, navItemLabel, visibleNavGroups } from "@/lib/nav";
import { LogoBadge } from "@/components/logo-badge";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const groups = useMemo(() => visibleNavGroups(role), [role]);
  // Longest-prefix match, so a nested page (KPI Config) doesn't also light up
  // its parent (Connections).
  const activeHref = matchNavItem(pathname, role)?.item.href ?? null;

  // Carries the global period/date state (owned by PeriodNav) across
  // sidebar navigation — without this, every page-to-page click silently
  // reset the navbar's Weekly/Monthly toggle and chosen date back to
  // "current week". Only these two params are global; page-specific ones
  // (q, departmentId, open, …) intentionally don't follow.
  const period = searchParams.get("period");
  const date = searchParams.get("date");
  function hrefWithPeriod(href: string) {
    if (!period && !date) return href;
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (date) params.set("date", date);
    return `${href}?${params.toString()}`;
  }

  const renderGroups = (collapsedNav: boolean) =>
    groups.map((group, index) => (
      <div key={group.label}>
        {!collapsedNav && (
          <p
            className={`px-2 pb-1 text-[10.5px] tracking-wide text-muted ${index === 0 ? "" : "pt-3.5"}`}
          >
            {group.label}
          </p>
        )}
        <div className="flex flex-col gap-px">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              href={hrefWithPeriod(item.href)}
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
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-3 bg-surface py-2.5">
        <LogoBadge className="h-6 w-6 shrink-0 object-contain" />
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>

        <ScrollArea className="flex-1">
          <nav className="flex flex-col items-center gap-3 pt-1">{renderGroups(true)}</nav>
        </ScrollArea>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[212px] shrink-0 flex-col bg-surface px-2 py-2.5">
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

      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-px pr-1">{renderGroups(false)}</nav>
      </ScrollArea>
    </aside>
  );
}
