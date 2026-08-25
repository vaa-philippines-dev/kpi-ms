"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { useToast } from "@/components/ui/toast";
import {
  getSubmissionsForConnection,
  updateSubmissionPeriod,
  deleteSubmission,
  type SubmissionRow,
} from "@/app/dashboard/submissions/actions";
import { KpiPeriod } from "@/generated/prisma/enums";

const PERIOD_LABEL: Record<KpiPeriod, string> = { WEEKLY: "Weekly", MONTHLY: "Monthly" };

/**
 * Opened by clicking a VA's name in the Current Period Status tracker table
 * — lets a DM/Ops Manager/Team Leader/Admin correct a wrongly-dated
 * submission (move it to a different period) or remove it entirely, for
 * cases the VA got the week/month wrong when submitting. Same
 * fetch-on-open pattern as ConnectionPerformancePanel: load on mount,
 * re-load after any edit/delete so the list reflects the new state.
 */
export function SubmissionEditModal({
  open,
  onClose,
  connectionId,
  vaName,
  clientName,
}: {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  vaName: string;
  clientName: string;
}) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPeriod, setEditPeriod] = useState<KpiPeriod>(KpiPeriod.WEEKLY);
  const [editDate, setEditDate] = useState("");
  const { toast } = useToast();

  function load() {
    startTransition(async () => {
      try {
        const result = await getSubmissionsForConnection(connectionId);
        setRows(result);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to load submissions.", "error");
        setRows([]);
      }
    });
  }

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connectionId]);

  function startEdit(row: SubmissionRow) {
    setEditingId(row.id);
    setEditPeriod(row.period);
    setEditDate(row.periodStart.slice(0, 10));
  }

  function saveEdit(submissionId: string) {
    const formData = new FormData();
    formData.set("submissionId", submissionId);
    formData.set("period", editPeriod);
    formData.set("date", editDate);
    startTransition(async () => {
      try {
        await updateSubmissionPeriod(formData);
        toast("Submission period updated.", "success");
        setEditingId(null);
        load();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update submission.", "error");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`${vaName} — ${clientName}`} size="lg">
      {rows === null ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No submissions yet for this connection.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-surface-border p-3 text-sm">
              {editingId === row.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted uppercase">
                      Period
                    </label>
                    <Select
                      value={editPeriod}
                      onChange={(e) => setEditPeriod(e.target.value as KpiPeriod)}
                    >
                      <option value={KpiPeriod.WEEKLY}>Weekly</option>
                      <option value={KpiPeriod.MONTHLY}>Monthly</option>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted uppercase">
                      {editPeriod === KpiPeriod.MONTHLY ? "Any date in target month" : "Any date in target week"}
                    </label>
                    <Input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </div>
                  <Button type="button" disabled={isPending} onClick={() => saveEdit(row.id)}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {PERIOD_LABEL[row.period]} · {new Date(row.periodStart).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-muted">
                      Submitted {new Date(row.submittedAt).toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {row.values
                        .map((v) => `${v.kpiName}: ${v.noData ? "No data" : v.value}`)
                        .join(", ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => startEdit(row)}
                    >
                      Edit date
                    </Button>
                    <ConfirmSubmitButton
                      action={deleteSubmission}
                      fields={{ submissionId: row.id }}
                      label="Delete"
                      confirmLabel="Delete this submission?"
                      successMessage="Submission deleted."
                      onSuccess={load}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
