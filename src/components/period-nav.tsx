import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, currentPeriodStart, formatWeekRange, toDateParam } from "@/lib/period";
import { KpiPeriod } from "@/generated/prisma/enums";

/**
 * Week-by-week ◀ / label / ▶ / Today navigator — mirrors legacy's dashboard
 * week bar (`AppDashboards.html`'s `dashNavWeek`/`dashGoToday`). Pure links
 * driven by a `?date=YYYY-MM-DD` search param, so it works without any
 * client-side JS: the anchor date is whatever week's Monday `date` points
 * at, and pages pass it straight into `currentPeriodStart` as the `now`
 * override for both their weekly and monthly queries.
 */
export function PeriodNav({
  anchor,
  weekStartDay,
  basePath,
  params = {},
}: {
  anchor: Date;
  weekStartDay: number;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const currentWeekStart = currentPeriodStart(KpiPeriod.WEEKLY, anchor, weekStartDay);
  const todayWeekStart = currentPeriodStart(KpiPeriod.WEEKLY, new Date(), weekStartDay);
  const prevWeekStart = addDays(currentWeekStart, -7);
  const nextWeekStart = addDays(currentWeekStart, 7);
  const isCurrentWeek = currentWeekStart.getTime() === todayWeekStart.getTime();
  const canGoNext = nextWeekStart.getTime() <= todayWeekStart.getTime();

  function hrefFor(date: Date | null) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    if (date) query.set("date", toDateParam(date));
    else query.delete("date");
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const navButtonClass =
    "flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground";
  const disabledClass = "flex size-7 items-center justify-center rounded-md text-muted/30";

  return (
    <div className="flex items-center gap-1.5">
      <Link href={hrefFor(prevWeekStart)} aria-label="Previous week" className={navButtonClass}>
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-[168px] rounded-md border border-surface-border bg-surface px-3 py-1 text-center text-xs font-medium">
        {formatWeekRange(currentWeekStart)}
      </span>
      {canGoNext ? (
        <Link href={hrefFor(nextWeekStart)} aria-label="Next week" className={navButtonClass}>
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span aria-disabled className={disabledClass}>
          <ChevronRight className="size-4" />
        </span>
      )}
      {!isCurrentWeek && (
        <Link
          href={hrefFor(null)}
          className="rounded-md px-2 py-1 text-xs font-medium text-accent transition hover:bg-surface-hover"
        >
          Today
        </Link>
      )}
    </div>
  );
}
