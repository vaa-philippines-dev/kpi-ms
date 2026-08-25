"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";

export type StatusCustomer = {
  clientName: string;
  secondaryName: string | null;
  vaName: string;
  departmentName: string;
  sampleConnectionId: string;
};

type StatusKey = "CRITICAL" | "ON_TARGET" | "AT_RISK";

const STATUS_META: Record<StatusKey, { label: string; toneClass: string; borderClass: string }> = {
  CRITICAL: { label: "Critical", toneClass: "text-danger", borderClass: "border-danger/30" },
  ON_TARGET: { label: "On Target", toneClass: "text-success", borderClass: "border-success/30" },
  AT_RISK: { label: "At Risk", toneClass: "text-warning", borderClass: "border-warning/30" },
};

/**
 * The summary row atop Customer Overview. Active Customers/Connections stay
 * static counts; Critical/On Target/At Risk are clickable — each opens a
 * modal listing exactly the clients counted on that card (same latest-period
 * rollup status the count itself is derived from), Client + VA side by
 * side, linking into that client's Client Detail page.
 */
export function CustomerStatusCards({
  activeCustomers,
  activeConnections,
  critical,
  onTarget,
  atRisk,
}: {
  activeCustomers: number;
  activeConnections: number;
  critical: StatusCustomer[];
  onTarget: StatusCustomer[];
  atRisk: StatusCustomer[];
}) {
  const [open, setOpen] = useState<StatusKey | null>(null);
  const lists: Record<StatusKey, StatusCustomer[]> = {
    CRITICAL: critical,
    ON_TARGET: onTarget,
    AT_RISK: atRisk,
  };
  const openList = open ? lists[open] : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="text-3xl font-semibold">{activeCustomers}</div>
          <div className="mt-1 text-sm text-muted">Active Customers</div>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="text-3xl font-semibold">{activeConnections}</div>
          <div className="mt-1 text-sm text-muted">Active Connections</div>
        </div>
        {(Object.keys(STATUS_META) as StatusKey[]).map((key) => {
          const meta = STATUS_META[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setOpen(key)}
              className={`rounded-xl border ${meta.borderClass} bg-surface p-4 text-left ${meta.toneClass} transition hover:bg-surface-hover`}
            >
              <div className="text-3xl font-semibold">{lists[key].length}</div>
              <div className="mt-1 text-sm">{meta.label}</div>
            </button>
          );
        })}
      </div>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${STATUS_META[open].label} (${openList.length})` : ""}
      >
        {openList.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No customers currently {open ? STATUS_META[open].label.toLowerCase() : ""}.
          </p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {openList.map((c) => (
              <li key={c.sampleConnectionId}>
                <Link
                  href={`/dashboard/reports/client-detail?connectionId=${c.sampleConnectionId}`}
                  onClick={() => setOpen(null)}
                  className="flex items-center justify-between gap-3 py-2.5 transition hover:text-accent"
                >
                  <span>
                    <span className="font-medium">{c.clientName}</span>
                    {c.secondaryName && (
                      <span className="ml-1 text-xs text-muted">({c.secondaryName})</span>
                    )}
                    <div className="text-xs text-muted">{c.departmentName}</div>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{c.vaName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
