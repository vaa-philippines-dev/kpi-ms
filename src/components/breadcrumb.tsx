"use client";

import { usePathname } from "next/navigation";
import { matchNavItem, navItemLabel } from "@/lib/nav";

/**
 * Section trail for the current page, read off the nav tree. Gives every page
 * a consistent "where am I" anchor in the topbar so pages don't each have to
 * restate it.
 */
export function Breadcrumb({ role }: { role: string }) {
  const pathname = usePathname();
  const match = matchNavItem(pathname);

  if (!match) return null;

  const showGroup = match.item.href !== "/dashboard";

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      {showGroup && (
        <>
          <span className="truncate text-muted">{match.group.label}</span>
          <span className="text-muted/50">/</span>
        </>
      )}
      <span className="truncate font-medium text-foreground">
        {navItemLabel(match.item, role)}
      </span>
    </nav>
  );
}
