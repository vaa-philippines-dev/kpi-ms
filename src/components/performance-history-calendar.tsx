"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { PerformanceStatus } from "@/generated/prisma/enums";

export type HistoryEntry = {
  id: string;
  kpiName: string;
  period: string;
  periodStart: Date;
  actualValue: number | null;
  targetValue: number;
  status: PerformanceStatus;
};

// Worst-first, for picking a single dot color when a day carries more than
// one KPI's entry — a day with any Critical entry reads as Critical at a
// glance, same logic as the Customer Overview status rollup.
const STATUS_PRIORITY: PerformanceStatus[] = [
  PerformanceStatus.CRITICAL,
  PerformanceStatus.AT_RISK,
  PerformanceStatus.NO_DATA,
  PerformanceStatus.ON_TARGET,
];

const STATUS_DOT_CLASS: Record<PerformanceStatus, string> = {
  [PerformanceStatus.CRITICAL]: "bg-danger",
  [PerformanceStatus.AT_RISK]: "bg-warning",
  [PerformanceStatus.ON_TARGET]: "bg-success",
  [PerformanceStatus.NO_DATA]: "border-2 border-muted bg-transparent",
};

const STATUS_LEGEND_LABEL: Record<PerformanceStatus, string> = {
  [PerformanceStatus.CRITICAL]: "Critical",
  [PerformanceStatus.AT_RISK]: "At Risk",
  [PerformanceStatus.ON_TARGET]: "On Target",
  [PerformanceStatus.NO_DATA]: "No Data",
};

// Same order/coloring as the Dashboard Overview stat tiles, so a month
// summary reads the same way everywhere in the app.
const MONTH_SUMMARY_TILES = [
  { status: PerformanceStatus.ON_TARGET, label: "On Target", icon: CheckCircle2, style: "border-success/30 text-success" },
  { status: PerformanceStatus.AT_RISK, label: "At Risk", icon: AlertTriangle, style: "border-warning/30 text-warning" },
  { status: PerformanceStatus.CRITICAL, label: "Critical", icon: XCircle, style: "border-danger/30 text-danger" },
  { status: PerformanceStatus.NO_DATA, label: "No Data", icon: HelpCircle, style: "border-surface-border text-muted" },
] as const;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function worstStatus(entries: HistoryEntry[]): PerformanceStatus {
  for (const status of STATUS_PRIORITY) {
    if (entries.some((e) => e.status === status)) return status;
  }
  return PerformanceStatus.NO_DATA;
}

/**
 * Performance History as a bordered table grid — a real <table> laid out
 * like a month calendar, so it reads as data (like every other table in
 * this app) instead of a row of rounded icon buttons. Jumping straight to a
 * month via the dropdown is faster than stepping one month at a time once a
 * connection has a long history; the arrows stay for quick adjacent moves.
 * Clicking a day drills into the exact KPI rows for that date via the same
 * modal as before.
 */
export function PerformanceHistoryCalendar({ entries }: { entries: HistoryEntry[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const e of entries) {
      const key = dateKey(e.periodStart);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [entries]);

  const { minMonth, maxMonth } = useMemo(() => {
    const times = entries.map((e) => e.periodStart.getTime());
    const min = new Date(Math.min(...times));
    const max = new Date(Math.max(...times));
    return {
      minMonth: new Date(min.getFullYear(), min.getMonth(), 1),
      maxMonth: new Date(max.getFullYear(), max.getMonth(), 1),
    };
  }, [entries]);

  const [viewedMonth, setViewedMonth] = useState(maxMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const canGoPrev = monthKey(viewedMonth) > monthKey(minMonth);
  const canGoNext = monthKey(viewedMonth) < monthKey(maxMonth);

  function shiftMonth(delta: number) {
    setViewedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  // Most recent first, so the jump dropdown opens on the months a user is
  // most likely to want without scrolling.
  const monthOptions = useMemo(() => {
    const list: Date[] = [];
    let cur = new Date(minMonth);
    while (monthKey(cur) <= monthKey(maxMonth)) {
      list.push(cur);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return list.reverse();
  }, [minMonth, maxMonth]);

  const weeks = useMemo(() => {
    const year = viewedMonth.getFullYear();
    const month = viewedMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: { date: Date; key: string }[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ date: new Date(NaN), key: `pad-${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      cells.push({ date, key: dateKey(date) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: new Date(NaN), key: `pad-end-${cells.length}` });

    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewedMonth]);

  const selectedEntries = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  // Worst-status-per-day count for the viewed month — gives an at-a-glance
  // health read without clicking into individual days, mirroring what the
  // day dots already encode below.
  const monthCounts = useMemo(() => {
    const counts: Record<PerformanceStatus, number> = {
      [PerformanceStatus.ON_TARGET]: 0,
      [PerformanceStatus.AT_RISK]: 0,
      [PerformanceStatus.CRITICAL]: 0,
      [PerformanceStatus.NO_DATA]: 0,
    };
    const year = viewedMonth.getFullYear();
    const month = viewedMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dayEntries = byDate.get(dateKey(new Date(year, month, d)));
      if (dayEntries && dayEntries.length > 0) counts[worstStatus(dayEntries)]++;
    }
    return counts;
  }, [viewedMonth, byDate]);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MONTH_SUMMARY_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.status}
              className={`rounded-xl border bg-surface p-3 ${tile.style}`}
            >
              <Icon className="size-4" />
              <div className="mt-2 text-2xl font-semibold">{monthCounts[tile.status]}</div>
              <div className="mt-0.5 text-xs">{tile.label} this month</div>
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoPrev}
          aria-label="Previous month"
          className="shrink-0 rounded-md p-1 text-muted transition hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>

        <Select
          value={monthKey(viewedMonth)}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            setViewedMonth(new Date(y, m - 1, 1));
          }}
          aria-label="Jump to month"
          className="text-center text-sm font-medium"
        >
          {monthOptions.map((m) => (
            <option key={monthKey(m)} value={monthKey(m)}>
              {m.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </option>
          ))}
        </Select>

        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={!canGoNext}
          aria-label="Next month"
          className="shrink-0 rounded-md p-1 text-muted transition hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <table className="w-full border-collapse text-center text-sm">
          <thead>
            <tr className="bg-surface text-xs tracking-wide text-muted uppercase">
              {WEEKDAY_LABELS.map((label) => (
                <th key={label} className="border-b border-surface-border px-2 py-2 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((cell) => {
                  if (Number.isNaN(cell.date.getTime())) {
                    return (
                      <td
                        key={cell.key}
                        className="border border-surface-border/60 bg-surface/40"
                      />
                    );
                  }
                  const dayEntries = byDate.get(cell.key) ?? [];
                  const hasData = dayEntries.length > 0;
                  const status = hasData ? worstStatus(dayEntries) : null;

                  return (
                    <td key={cell.key} className="border border-surface-border p-0">
                      <button
                        type="button"
                        disabled={!hasData}
                        onClick={() => setSelectedDate(cell.key)}
                        aria-label={
                          hasData
                            ? `${cell.date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}: ${dayEntries.length} ${dayEntries.length === 1 ? "entry" : "entries"}, worst status ${STATUS_LEGEND_LABEL[status!]}`
                            : cell.date.toLocaleDateString(undefined, { month: "long", day: "numeric" })
                        }
                        className={`flex h-16 w-full flex-col items-center justify-center gap-1 transition ${
                          hasData
                            ? "cursor-pointer hover:bg-surface-hover"
                            : "cursor-default text-muted/60"
                        }`}
                      >
                        <span>{cell.date.getDate()}</span>
                        {hasData && (
                          <span className="flex items-center gap-0.5">
                            <span className={`size-1.5 rounded-full ${STATUS_DOT_CLASS[status!]}`} />
                            {dayEntries.length > 1 && (
                              <span className="text-[9px] text-muted">×{dayEntries.length}</span>
                            )}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {STATUS_PRIORITY.map((status) => (
          <div key={status} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`size-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />
            {STATUS_LEGEND_LABEL[status]}
          </div>
        ))}
      </div>

      <Modal
        open={selectedDate !== null}
        onClose={() => setSelectedDate(null)}
        title={
          selectedDate
            ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : ""
        }
      >
        <Table>
          <TableHead>
            <tr>
              <Th>KPI</Th>
              <Th>Period</Th>
              <Th>Actual</Th>
              <Th>Target</Th>
              <Th>Status</Th>
            </tr>
          </TableHead>
          <tbody>
            {selectedEntries.map((e) => (
              <Tr key={e.id}>
                <Td>{e.kpiName}</Td>
                <Td className="text-muted capitalize">{e.period.toLowerCase()}</Td>
                <Td className="text-muted">{e.actualValue ?? "—"}</Td>
                <Td className="text-muted">{e.targetValue}</Td>
                <Td>
                  <StatusBadge status={e.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Modal>
    </div>
  );
}
