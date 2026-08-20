import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  currentPeriodStart,
  formatWeekRange,
  toDateParam,
} from "@/lib/period";
import { KpiPeriod } from "@/generated/prisma/enums";

/**
 * Weekly/monthly toggle + ◀ / label / ▶ / Today navigator — mirrors
 * legacy's Global Period Selector (`AppCore.html`'s
 * `gp-btn-weekly`/`gp-btn-monthly`, `gpNav`, `gpToday`). Pure links driven
 * by `?period=` and `?date=YYYY-MM-DD` search params, so it works without
 * any client-side JS.
 */
export function PeriodNav({
  anchor,
  period = KpiPeriod.WEEKLY,
  weekStartDay,
  basePath,
  params = {},
}: {
  anchor: Date;
  period?: KpiPeriod;
  weekStartDay: number;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const isMonthly = period === KpiPeriod.MONTHLY;
  const currentStart = currentPeriodStart(period, anchor, weekStartDay);
  const todayStart = currentPeriodStart(period, new Date(), weekStartDay);
  const prevStart = isMonthly ? addMonths(currentStart, -1) : addDays(currentStart, -7);
  const nextStart = isMonthly ? addMonths(currentStart, 1) : addDays(currentStart, 7);
  const isCurrent = currentStart.getTime() === todayStart.getTime();
  const canGoNext = nextStart.getTime() <= todayStart.getTime();

  function hrefFor(overrides: Record<string, string | undefined>) {
    const query = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      ...params,
      period: isMonthly ? "monthly" : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) query.set(key, value);
    }
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const label = isMonthly
    ? currentStart.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : formatWeekRange(currentStart);

  const toggleActiveClass = "bg-accent/15 text-accent";
  const toggleInactiveClass = "text-muted";
  const navButtonClass =
    "flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground";
  const disabledClass = "flex size-7 items-center justify-center rounded-md text-muted/30";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border border-surface-border p-0.5 text-xs">
        <Link
          href={hrefFor({ period: undefined, date: undefined })}
          className={`rounded px-2 py-1 ${!isMonthly ? toggleActiveClass : toggleInactiveClass}`}
        >
          Weekly
        </Link>
        <Link
          href={hrefFor({ period: "monthly", date: undefined })}
          className={`rounded px-2 py-1 ${isMonthly ? toggleActiveClass : toggleInactiveClass}`}
        >
          Monthly
        </Link>
      </div>
      <div className="flex items-center gap-1.5">
        <Link
          href={hrefFor({ date: toDateParam(prevStart) })}
          aria-label={isMonthly ? "Previous month" : "Previous week"}
          className={navButtonClass}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-[168px] rounded-md border border-surface-border bg-surface px-3 py-1 text-center text-xs font-medium">
          {label}
        </span>
        {canGoNext ? (
          <Link
            href={hrefFor({ date: toDateParam(nextStart) })}
            aria-label={isMonthly ? "Next month" : "Next week"}
            className={navButtonClass}
          >
            <ChevronRight className="size-4" />
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
            Today
          </Link>
        )}
      </div>
    </div>
  );
}
