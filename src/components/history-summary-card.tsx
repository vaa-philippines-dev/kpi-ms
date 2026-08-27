"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ConnectionTrendPoint } from "@/lib/connection-trend";
import { CompactStatusTrend } from "@/components/compact-status-trend";

export type HistorySummaryConnection = {
  connectionId: string;
  clientName: string;
  points: ConnectionTrendPoint[];
};

/**
 * Dashboard teaser for the VA-facing History page — one connection's
 * compact status trend at a time, with a client switcher (same tab-strip
 * pattern as history-connection-list.tsx's own picker) when there's more
 * than one. A real `<Link>` for "View full history" rather than wrapping the
 * whole card in one, since the switcher above needs real `<button>`s and
 * nesting interactive elements inside an `<a>` is invalid HTML (and would
 * fight the tab clicks with an unwanted navigation on every switch).
 */
export function HistorySummaryCard({
  cards,
  periodsLabel,
}: {
  cards: HistorySummaryConnection[];
  periodsLabel: string;
}) {
  const [activeId, setActiveId] = useState(cards[0]?.connectionId);
  const active = cards.find((c) => c.connectionId === activeId) ?? cards[0];

  if (!active) return null;

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">History</h2>
          <p className="text-xs text-muted">Your status trend — {periodsLabel}</p>
        </div>
        <Link
          href="/dashboard/history"
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted transition hover:text-foreground"
        >
          View full history
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      {cards.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {cards.map((c) => {
            const isActive = c.connectionId === active.connectionId;
            return (
              <button
                key={c.connectionId}
                type="button"
                onClick={() => setActiveId(c.connectionId)}
                aria-pressed={isActive}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-surface-hover text-foreground"
                    : "text-muted hover:bg-surface-hover/50 hover:text-foreground"
                }`}
              >
                {c.clientName}
              </button>
            );
          })}
        </div>
      )}

      <CompactStatusTrend points={active.points} />
    </div>
  );
}
