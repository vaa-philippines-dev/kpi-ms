"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  addDays,
  addMonths,
  currentPeriodStart,
  formatWeekRange,
  parseAnchorDate,
  toDateParam,
} from "@/lib/period";
import { KpiPeriod } from "@/generated/prisma/enums";
import { PeriodJumpSelect } from "./period-jump-select";

const JUMP_OPTIONS_COUNT = 12;

/**
 * Swaps its child for a spinner while the enclosing <Link> is navigating —
 * the only signal a user gets that the arrow/toggle/Today click registered,
 * since these are plain client-side transitions with no loading.tsx (the
 * data these routes render depends on search params, so nothing here is
 * prefetchable ahead of the exact click).
 */
function LinkPending({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="size-3.5 animate-spin" /> : <>{children}</>;
}

/**
 * Global Weekly/Monthly toggle + ◀ / label-select / ▶ / Today navigator,
 * lives once in DashboardTopbar instead of being duplicated per-page —
 * mirrors legacy's Global Period Selector (`AppCore.html`'s
 * `gp-btn-weekly`/`gp-btn-monthly`, `gp-period-select`, `gpNav`, `gpToday`).
 * Reads/writes `?period=` and `?date=YYYY-MM-DD` on whatever page it's
 * rendered on (via usePathname/useSearchParams), so every page under
 * /dashboard shares the same period state without prop-drilling.
 */
export function PeriodNav({ weekStartDay }: { weekStartDay: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period: KpiPeriod =
    searchParams.get("period") === "monthly" ? KpiPeriod.MONTHLY : KpiPeriod.WEEKLY;
  const anchor = parseAnchorDate(searchParams.get("date") ?? undefined);

  const isMonthly = period === KpiPeriod.MONTHLY;
  const currentStart = currentPeriodStart(period, anchor, weekStartDay);
  const todayStart = currentPeriodStart(period, new Date(), weekStartDay);
  const prevStart = isMonthly ? addMonths(currentStart, -1) : addDays(currentStart, -7);
  const nextStart = isMonthly ? addMonths(currentStart, 1) : addDays(currentStart, 7);
  const isCurrent = currentStart.getTime() === todayStart.getTime();
  const canGoNext = nextStart.getTime() <= todayStart.getTime();

  function hrefFor(overrides: Record<string, string | undefined>) {
    const query = new URLSearchParams(searchParams.toString());
    const merged: Record<string, string | undefined> = {
      period: isMonthly ? "monthly" : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const qs = query.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const label = isMonthly
    ? currentStart.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : formatWeekRange(currentStart);

  const jumpOptions = Array.from({ length: JUMP_OPTIONS_COUNT }, (_, i) => {
    const start = isMonthly ? addMonths(todayStart, -i) : addDays(todayStart, -i * 7);
    return {
      value: toDateParam(start),
      label: isMonthly
        ? start.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
        : formatWeekRange(start),
      href: hrefFor({ date: i === 0 ? undefined : toDateParam(start) }),
    };
  });

  const toggleActiveClass = "bg-accent/15 text-accent";
  const toggleInactiveClass = "text-muted";
  const navButtonClass =
    "flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground";
  const disabledClass = "flex size-7 items-center justify-center rounded-md text-muted/30";

  return (
    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
      <div className="flex rounded-md border border-surface-border p-0.5 text-xs">
        <Link
          href={hrefFor({ period: undefined, date: undefined })}
          className={`rounded px-2 py-1 ${!isMonthly ? toggleActiveClass : toggleInactiveClass}`}
        >
          <LinkPending>Weekly</LinkPending>
        </Link>
        <Link
          href={hrefFor({ period: "monthly", date: undefined })}
          className={`rounded px-2 py-1 ${isMonthly ? toggleActiveClass : toggleInactiveClass}`}
        >
          <LinkPending>Monthly</LinkPending>
        </Link>
      </div>
      <div className="flex items-center gap-1.5">
        <Link
          href={hrefFor({ date: toDateParam(prevStart) })}
          aria-label={isMonthly ? "Previous month" : "Previous week"}
          className={navButtonClass}
        >
          <LinkPending>
            <ChevronLeft className="size-4" />
          </LinkPending>
        </Link>
        <PeriodJumpSelect value={toDateParam(currentStart)} label={label} options={jumpOptions} />
        {canGoNext ? (
          <Link
            href={hrefFor({ date: toDateParam(nextStart) })}
            aria-label={isMonthly ? "Next month" : "Next week"}
            className={navButtonClass}
          >
            <LinkPending>
              <ChevronRight className="size-4" />
            </LinkPending>
          </Link>
        ) : (
          <span aria-disabled className={disabledClass}>
            <ChevronRight className="size-4" />
          </span>
        )}
        {!isCurrent && (
          <Link
            href={hrefFor({ date: undefined })}
            className="rounded-md px-2 py-1 text-xs font-medium text-accent transition hover:bg-surface-hover"
          >
            <LinkPending>Today</LinkPending>
          </Link>
        )}
      </div>
    </div>
  );
}
