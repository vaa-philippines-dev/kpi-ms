"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { PendingSubmissionRow } from "@/lib/submission-trend";

/**
 * The Submission Trend card's "No Submissions" tile — clickable for every
 * role, listing the connections (and their VA) that haven't submitted for
 * the current period yet.
 */
export function PendingSubmissionsCard({ rows }: { rows: PendingSubmissionRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-surface-border p-3 text-left transition hover:bg-surface-hover"
      >
        <div className="text-2xl font-semibold">{rows.length}</div>
        <div className="mt-0.5 text-xs text-muted">No Submissions</div>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Connections With No Submission Yet"
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Everyone has submitted for the current period.
          </p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {rows.map((row) => (
              <li key={row.connectionId} className="py-2.5">
                <p className="truncate text-sm font-medium">{row.clientName}</p>
                <p className="truncate text-xs text-muted">
                  {row.vaName} · {row.departmentName}
                  {row.teamName ? ` · ${row.teamName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
