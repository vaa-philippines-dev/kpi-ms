"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { ConnectionKpiModal, type ConnectionKpiRow } from "@/components/connection-kpi-modal";
import { PerformanceStatus } from "@/generated/prisma/enums";

export type TeamCardKpiRow = ConnectionKpiRow;

export type TeamCard = {
  id: string;
  clientName: string;
  vaName: string;
  status: PerformanceStatus;
  kpiRows: TeamCardKpiRow[];
};

const TABS = [
  { key: "all", label: "All" },
  { key: PerformanceStatus.CRITICAL, label: "Critical" },
  { key: PerformanceStatus.AT_RISK, label: "At Risk" },
  { key: PerformanceStatus.ON_TARGET, label: "On Target" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Tabbed connection-card grid with a click-to-open KPI detail modal —
 * mirrors legacy's Team Leader dashboard (`_renderTLCards` /
 * `openDashCardDetail` in AppDashboards.html). All data is preloaded
 * server-side (a TL's team is small), so switching tabs or opening a card
 * needs no network round-trip.
 */
export function TeamConnectionsPanel({
  cards,
  weekLabel,
}: {
  cards: TeamCard[];
  weekLabel: string;
}) {
  const [tab, setTab] = useState<TabKey>(PerformanceStatus.CRITICAL);
  const [openId, setOpenId] = useState<string | null>(null);

  const counts: Record<TabKey, number> = {
    all: cards.length,
    [PerformanceStatus.CRITICAL]: cards.filter(
      (c) => c.status === PerformanceStatus.CRITICAL,
    ).length,
    [PerformanceStatus.AT_RISK]: cards.filter(
      (c) => c.status === PerformanceStatus.AT_RISK,
    ).length,
    [PerformanceStatus.ON_TARGET]: cards.filter(
      (c) => c.status === PerformanceStatus.ON_TARGET,
    ).length,
  };

  const visible = tab === "all" ? cards : cards.filter((c) => c.status === tab);
  const openCard = cards.find((c) => c.id === openId) ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              tab === t.key
                ? "bg-accent text-accent-foreground"
                : "bg-surface-hover text-muted hover:text-foreground"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border py-10 text-center text-sm text-muted">
          No connections in this view.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpenId(c.id)}
              className="rounded-xl border border-surface-border bg-surface p-4 text-left transition hover:border-accent/40 hover:bg-surface-hover"
            >
              <p className="truncate font-medium">{c.clientName}</p>
              <p className="mb-3 truncate text-xs text-muted">{c.vaName}</p>
              <StatusBadge status={c.status} />
            </button>
          ))}
        </div>
      )}

      {openCard && (
        <ConnectionKpiModal
          clientName={openCard.clientName}
          vaName={openCard.vaName}
          subtitle={weekLabel}
          kpiRows={openCard.kpiRows}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
