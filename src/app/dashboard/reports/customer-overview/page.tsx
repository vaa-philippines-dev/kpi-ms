import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { CustomerOverviewTable, type CustomerRow } from "@/components/customer-overview-table";
import { CustomerStatusCards, type StatusCustomer } from "@/components/customer-status-cards";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import {
  addDays,
  addMonths,
  currentPeriodStart,
  daysSince,
  endOfMonth,
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

type Customer = {
  clientName: string;
  secondaryName: string | null;
  departmentNames: Set<string>;
  vaNames: Set<string>;
  // First connection encountered for this client — used only to land the
  // Client Detail drill-down link on *a* connection for this client; its
  // own combobox lets the user switch to a different one if needed.
  sampleConnectionId: string;
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
      department: { select: { name: true } },
      vaUser: { select: { name: true, email: true } },
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
      departmentNames: new Set(),
      vaNames: new Set(),
      sampleConnectionId: c.id,
      activeConnCount: 0,
      maxDays: 0,
      periodStatuses: periods.map(() => null),
    };
    if (tenureDays > cust.maxDays) cust.maxDays = tenureDays;
    cust.departmentNames.add(c.department.name);
    cust.vaNames.add(c.vaUser.name ?? c.vaUser.email);
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

  const toStatusCustomer = (c: Customer): StatusCustomer => ({
    clientName: c.clientName,
    secondaryName: c.secondaryName,
    vaName: [...c.vaNames].sort().join(", "),
    departmentName: [...c.departmentNames].sort().join(", "),
    sampleConnectionId: c.sampleConnectionId,
  });
  const byLatestStatus = (status: PerformanceStatus) =>
    customers
      .filter((c) => c.periodStatuses[c.periodStatuses.length - 1] === status)
      .map(toStatusCustomer);
  const criticalCustomers = byLatestStatus(PerformanceStatus.CRITICAL);
  const onTargetCustomers = byLatestStatus(PerformanceStatus.ON_TARGET);
  const atRiskCustomers = byLatestStatus(PerformanceStatus.AT_RISK);

  const rows: CustomerRow[] = customers.map((c) => ({
    clientName: c.clientName,
    secondaryName: c.secondaryName,
    departmentName: [...c.departmentNames].sort().join(", "),
    sampleConnectionId: c.sampleConnectionId,
    activeConnCount: c.activeConnCount,
    maxDays: c.maxDays,
    p0: c.periodStatuses[0],
    p1: c.periodStatuses[1],
    p2: c.periodStatuses[2],
    p3: c.periodStatuses[3],
    p4: c.periodStatuses[4],
    p5: c.periodStatuses[5],
  }));

  const periodLabels = periods.map((p) => p.label);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Customer Overview"
          description="Per-client status across the last 6 periods."
          className="mb-0"
        />
        <a
          href="/api/export/customer-overview"
          className="text-xs text-accent hover:underline"
        >
          Export CSV →
        </a>
      </div>

      {customers.length === 0 ? (
        <ComingSoon note="No connections visible to your account yet." />
      ) : (
        <div className="space-y-6">
          <CustomerStatusCards
            activeCustomers={activeCustomers}
            activeConnections={activeConnections}
            critical={criticalCustomers}
            onTarget={onTargetCustomers}
            atRisk={atRiskCustomers}
          />

          <CustomerOverviewTable rows={rows} periodLabels={periodLabels} />
        </div>
      )}
    </>
  );
}
