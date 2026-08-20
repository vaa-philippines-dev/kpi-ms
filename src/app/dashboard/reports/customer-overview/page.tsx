import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import {
  addDays,
  addMonths,
  currentPeriodStart,
  daysSince,
  endOfMonth,
  formatDuration,
  parseAnchorDate,
} from "@/lib/period";
import { getWeekStartDay } from "@/lib/settings";
import { rollupStatus } from "@/lib/performance";
import { KpiPeriod, PerformanceStatus } from "@/generated/prisma/enums";

const PERF_RANK: Record<PerformanceStatus, number> = {
  [PerformanceStatus.CRITICAL]: 4,
  [PerformanceStatus.AT_RISK]: 3,
  [PerformanceStatus.ON_TARGET]: 2,
  [PerformanceStatus.NO_DATA]: 1,
};

type SortBy = "active" | "duration";

type Customer = {
  clientName: string;
  secondaryName: string | null;
  activeConnCount: number;
  maxDays: number;
  periodStatuses: (PerformanceStatus | null)[];
};

// Per-client rollup across all connections and the last 6 weeks/months —
// mirrors legacy getCustomerOverviewReport() (Performance.js:690-843): each
// customer's per-period cell is the worst KPI status across its connections,
// blank before the connection started. The rollup that legacy performs to
// blank a period *after* a connection went inactive relies on an
// InactiveDate this schema doesn't track, so ended connections still show
// their recorded status for periods after they started.
export default async function CustomerOverviewPage(
  props: PageProps<"/dashboard/reports/customer-overview">,
) {
  const searchParams = await props.searchParams;
  const period: KpiPeriod =
    searchParams.period === "monthly" ? KpiPeriod.MONTHLY : KpiPeriod.WEEKLY;
  const sortBy: SortBy = searchParams.sortBy === "duration" ? "duration" : "active";
  const sortDir: "asc" | "desc" = searchParams.sortDir === "asc" ? "asc" : "desc";
  const anchor = parseAnchorDate(
    typeof searchParams.date === "string" ? searchParams.date : undefined,
  );

  const session = await requireSession();
  const scope = connectionScopeWhere(session);
  const weekStartDay = await getWeekStartDay();

  const anchorStart = currentPeriodStart(period, anchor, weekStartDay);
  const step = (start: Date, delta: number) =>
    period === KpiPeriod.MONTHLY ? addMonths(start, delta) : addDays(start, delta * 7);
  const periodEnd = (start: Date) =>
    period === KpiPeriod.MONTHLY ? endOfMonth(start) : addDays(start, 6);
  const periodLabel = (start: Date) =>
    period === KpiPeriod.MONTHLY
      ? `${start.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })} '${String(start.getUTCFullYear()).slice(2)}`
      : start.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

  const periods = Array.from({ length: 6 }, (_, i) => {
    const start = step(anchorStart, i - 5);
    return { start, end: periodEnd(start), label: periodLabel(start) };
  });
  const lastPeriodEnd = periods[periods.length - 1].end;

  const connections = await prisma.connection.findMany({
    where: scope,
    select: {
      id: true,
      clientName: true,
      secondaryName: true,
      startDate: true,
      createdAt: true,
      performanceSummaries: {
        where: { period, periodStart: { in: periods.map((p) => p.start) } },
        select: { periodStart: true, status: true },
      },
    },
  });

  const customerMap = new Map<string, Customer>();
  for (const c of connections) {
    const tenureDays = daysSince(c.startDate ?? c.createdAt);
    const existing = customerMap.get(c.clientName);
    const cust: Customer = existing ?? {
      clientName: c.clientName,
      secondaryName: c.secondaryName,
      activeConnCount: 0,
      maxDays: 0,
      periodStatuses: periods.map(() => null),
    };
    if (tenureDays > cust.maxDays) cust.maxDays = tenureDays;
    customerMap.set(c.clientName, cust);

    // In scope for this window only if it had started by the last period —
    // matches legacy's `activeConns` filter (a date-window filter, not a
    // connection.status check).
    if (c.startDate && c.startDate > lastPeriodEnd) continue;
    cust.activeConnCount += 1;

    const statusByPeriod = new Map<number, PerformanceStatus[]>();
    for (const s of c.performanceSummaries) {
      const key = s.periodStart.getTime();
      if (!statusByPeriod.has(key)) statusByPeriod.set(key, []);
      statusByPeriod.get(key)!.push(s.status);
    }

    periods.forEach((p, i) => {
      if (c.startDate && c.startDate > p.end) return; // not yet started
      const statuses = statusByPeriod.get(p.start.getTime());
      const connStatus = statuses ? rollupStatus(statuses) : PerformanceStatus.NO_DATA;
      const prev = cust.periodStatuses[i];
      if (!prev || PERF_RANK[connStatus] > PERF_RANK[prev]) {
        cust.periodStatuses[i] = connStatus;
      }
    });
  }

  const customers = Array.from(customerMap.values()).filter((c) => c.activeConnCount > 0);

  const activeCustomers = customers.length;
  const activeConnections = customers.reduce((sum, c) => sum + c.activeConnCount, 0);
  const latest = customers.map((c) => c.periodStatuses[c.periodStatuses.length - 1]);
  const criticalCount = latest.filter((s) => s === PerformanceStatus.CRITICAL).length;
  const onTargetCount = latest.filter((s) => s === PerformanceStatus.ON_TARGET).length;
  const atRiskCount = latest.filter((s) => s === PerformanceStatus.AT_RISK).length;

  const sorted = [...customers].sort((a, b) => {
    const diff =
      sortBy === "duration" ? a.maxDays - b.maxDays : a.activeConnCount - b.activeConnCount;
    return sortDir === "asc" ? diff : -diff;
  });

  function hrefFor(overrides: Record<string, string | undefined>) {
    const query = new URLSearchParams();
    const merged = {
      date: searchParams.date as string | undefined,
      period: period === KpiPeriod.MONTHLY ? "monthly" : undefined,
      sortBy: sortBy !== "active" ? sortBy : undefined,
      sortDir: sortDir !== "desc" ? sortDir : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) query.set(key, value);
    }
    const qs = query.toString();
    return qs ? `?${qs}` : "?";
  }

  function sortHref(field: SortBy) {
    const nextDir = sortBy === field && sortDir === "desc" ? "asc" : "desc";
    return hrefFor({ sortBy: field !== "active" ? field : undefined, sortDir: nextDir !== "desc" ? nextDir : undefined });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Customer Overview"
          description="Per-client status across the last 6 periods."
          className="mb-0"
        />
      </div>

      {customers.length === 0 ? (
        <ComingSoon note="No connections visible to your account yet." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold">{activeCustomers}</div>
              <div className="mt-1 text-sm text-muted">Active Customers</div>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold">{activeConnections}</div>
              <div className="mt-1 text-sm text-muted">Active Connections</div>
            </div>
            <div className="rounded-xl border border-danger/30 bg-surface p-4 text-danger">
              <div className="text-3xl font-semibold">{criticalCount}</div>
              <div className="mt-1 text-sm">Critical</div>
            </div>
            <div className="rounded-xl border border-success/30 bg-surface p-4 text-success">
              <div className="text-3xl font-semibold">{onTargetCount}</div>
              <div className="mt-1 text-sm">On Target</div>
            </div>
            <div className="rounded-xl border border-warning/30 bg-surface p-4 text-warning">
              <div className="text-3xl font-semibold">{atRiskCount}</div>
              <div className="mt-1 text-sm">At Risk</div>
            </div>
          </div>

          <Table>
            <TableHead>
              <tr>
                <Th>Client</Th>
                <Th>
                  <Link href={sortHref("active")} className="hover:text-foreground">
                    Active {sortBy === "active" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </Link>
                </Th>
                <Th>
                  <Link href={sortHref("duration")} className="hover:text-foreground">
                    Duration {sortBy === "duration" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </Link>
                </Th>
                {periods.map((p) => (
                  <Th key={p.start.toISOString()} className="text-center">
                    {p.label}
                  </Th>
                ))}
              </tr>
            </TableHead>
            <tbody>
              {sorted.map((c) => (
                <Tr key={c.clientName}>
                  <Td>
                    <span className="font-medium">{c.clientName}</span>
                    {c.secondaryName && (
                      <div className="text-xs text-muted">{c.secondaryName}</div>
                    )}
                  </Td>
                  <Td className="text-center text-muted">{c.activeConnCount}</Td>
                  <Td className="text-muted">{formatDuration(c.maxDays)}</Td>
                  {c.periodStatuses.map((status, i) => (
                    <Td key={periods[i].start.toISOString()} className="text-center">
                      {status ? <StatusBadge status={status} /> : <span className="text-muted">—</span>}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
