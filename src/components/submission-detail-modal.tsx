"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { useToast } from "@/components/ui/toast";
import {
  getConnectionPeriodDetail,
  updateSubmission,
  deleteSubmission,
  type ConnectionPeriodDetail,
  type SubmissionRow,
} from "@/app/dashboard/submissions/actions";
import { KpiPeriod } from "@/generated/prisma/enums";

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted uppercase">{label}</p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}

type EditState = {
  period: KpiPeriod;
  date: string;
  values: SubmissionRow["values"];
};

/**
 * Opened by clicking a VA's name in the Current Period Status tracker table
 * — replaces the old SubmissionEditModal's plain raw-submission log with
 * actual usable data: Actual vs Target per KPI for this exact period (so a
 * manager can see what came in, not just that "something" came in), which
 * KPIs never got submitted at all, and a proper table (not free-text cards)
 * of every submission received, each editable in place — both its
 * date/period and the actual value(s) a VA typed in — or deletable.
 */
export function SubmissionDetailModal({
  open,
  onClose,
  connectionId,
  period,
  periodStart,
  periodLabel,
}: {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  period: KpiPeriod;
  periodStart: string;
  periodLabel: string;
}) {
  const [detail, setDetail] = useState<ConnectionPeriodDetail | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  // Which submissions have their "No data" KPIs expanded — collapsed by
  // default so a big multi-cluster form (often mostly "No data" for
  // whichever clusters didn't apply that period) doesn't bury the KPIs the
  // VA actually reported against.
  const [noDataShown, setNoDataShown] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  function toggleNoDataShown(submissionId: string) {
    setNoDataShown((prev) => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  }

  function load() {
    startTransition(async () => {
      try {
        setDetail(await getConnectionPeriodDetail(connectionId, period, periodStart));
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to load submission detail.", "error");
      }
    });
  }

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connectionId, period, periodStart]);

  function startEdit(row: SubmissionRow) {
    setEditingId(row.id);
    setEdit({ period: row.period, date: row.periodStart.slice(0, 10), values: row.values });
  }

  function setEditValue(recordId: string, patch: Partial<SubmissionRow["values"][number]>) {
    setEdit((prev) =>
      prev
        ? { ...prev, values: prev.values.map((v) => (v.recordId === recordId ? { ...v, ...patch } : v)) }
        : prev,
    );
  }

  function saveEdit(submissionId: string) {
    if (!edit) return;
    const formData = new FormData();
    formData.set("submissionId", submissionId);
    formData.set("period", edit.period);
    formData.set("date", edit.date);
    formData.set(
      "records",
      JSON.stringify(edit.values.map((v) => ({ recordId: v.recordId, value: v.value, noData: v.noData }))),
    );
    startTransition(async () => {
      try {
        await updateSubmission(formData);
        toast("Submission updated.", "success");
        setEditingId(null);
        setEdit(null);
        load();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update submission.", "error");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={detail ? `${detail.clientName} — ${detail.vaName}` : "Submission Detail"}
      size="xl"
    >
      {isPending && !detail ? (
        <TableSkeleton rows={6} />
      ) : !detail ? null : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <InfoItem label="Client">{detail.clientName}</InfoItem>
            <InfoItem label="Virtual Assistant">{detail.vaName}</InfoItem>
            <InfoItem label="Department">{detail.departmentName}</InfoItem>
            <InfoItem label="Team">{detail.teamName ?? "—"}</InfoItem>
          </div>
          <p className="border-t border-surface-border pt-3 text-xs text-muted">
            {periodLabel} · {new Date(detail.periodStart).toLocaleDateString()}
          </p>

          {detail.missingCount > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {detail.missingCount} of {detail.totalCount} KPI
                {detail.totalCount === 1 ? "" : "s"} missing for this {periodLabel.toLowerCase()}:{" "}
                {detail.kpiRows
                  .filter((r) => r.missing)
                  .map((r) => r.name)
                  .join(", ")}
              </span>
            </div>
          ) : detail.totalCount > 0 ? (
            <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
              All {detail.totalCount} KPIs submitted for this {periodLabel.toLowerCase()}.
            </div>
          ) : null}

          <div className="max-h-[35vh] overflow-y-auto rounded-lg border border-surface-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-hover/60 text-xs text-muted uppercase">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">KPI</th>
                  <th className="px-3 py-2 text-left font-medium">Target</th>
                  <th className="px-3 py-2 text-left font-medium">Actual</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.kpiRows.map((r) => (
                  <tr key={r.kpiDefinitionId} className="border-t border-surface-border">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-muted">
                      {r.targetValue}
                      {r.unit ? ` ${r.unit}` : ""}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {r.actualValue ?? "—"}
                      {r.actualValue !== null && r.unit ? ` ${r.unit}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      {r.missing ? <Badge tone="warning">Missing</Badge> : <StatusBadge status={r.status} />}
                    </td>
                  </tr>
                ))}
                {detail.kpiRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted">
                      No KPIs configured for this connection/period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">
              Submitted ({detail.submissions.length})
            </h3>
            {detail.submissions.length === 0 ? (
              <p className="rounded-lg border border-surface-border py-6 text-center text-sm text-muted">
                No submissions received for this {periodLabel.toLowerCase()} yet.
              </p>
            ) : (
              <div className="space-y-3">
                {detail.submissions.map((row) => (
                  <div key={row.id} className="rounded-lg border border-surface-border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border bg-surface-hover/40 px-3 py-2">
                      {editingId === row.id ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted uppercase">
                              Period
                            </label>
                            <Select
                              value={edit?.period}
                              onChange={(e) =>
                                setEdit((prev) =>
                                  prev ? { ...prev, period: e.target.value as KpiPeriod } : prev,
                                )
                              }
                            >
                              <option value={KpiPeriod.WEEKLY}>Weekly</option>
                              <option value={KpiPeriod.MONTHLY}>Monthly</option>
                            </Select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted uppercase">
                              {edit?.period === KpiPeriod.MONTHLY ? "Any date in target month" : "Any date in target week"}
                            </label>
                            <Input
                              type="date"
                              value={edit?.date ?? ""}
                              onChange={(e) =>
                                setEdit((prev) => (prev ? { ...prev, date: e.target.value } : prev))
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm font-medium">
                          {new Date(row.submittedAt).toLocaleString()}
                        </div>
                      )}
                      <div className="flex shrink-0 gap-2">
                        {editingId === row.id ? (
                          <>
                            <Button type="button" disabled={isPending} onClick={() => saveEdit(row.id)}>
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={isPending}
                              onClick={() => {
                                setEditingId(null);
                                setEdit(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="gap-1 px-2.5 py-1.5 text-xs"
                              disabled={isPending}
                              onClick={() => startEdit(row)}
                            >
                              <Pencil className="size-3" />
                              Edit
                            </Button>
                            <ConfirmSubmitButton
                              action={deleteSubmission}
                              fields={{ submissionId: row.id }}
                              label="Delete"
                              confirmLabel="Delete this submission?"
                              successMessage="Submission deleted."
                              onSuccess={load}
                            />
                          </>
                        )}
                      </div>
                    </div>
                    {(() => {
                      const allValues = editingId === row.id ? edit?.values ?? row.values : row.values;
                      const noDataCount = allValues.filter((v) => v.noData).length;
                      const expanded = noDataShown.has(row.id);
                      const visibleValues = expanded ? allValues : allValues.filter((v) => !v.noData);
                      return (
                        <>
                          <table className="w-full text-sm">
                            <thead className="text-left text-xs text-muted uppercase">
                              <tr>
                                <th className="px-3 py-1.5 font-medium">KPI</th>
                                <th className="px-3 py-1.5 font-medium">Actual</th>
                                {editingId === row.id && <th className="px-3 py-1.5 font-medium">No data</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleValues.map((v) => (
                                <tr key={v.recordId} className="border-t border-surface-border">
                                  <td className="px-3 py-1.5">{v.kpiName}</td>
                                  <td className="px-3 py-1.5">
                                    {editingId === row.id ? (
                                      <Input
                                        type="number"
                                        step="any"
                                        className="w-28"
                                        value={v.value ?? ""}
                                        disabled={v.noData}
                                        onChange={(e) =>
                                          setEditValue(v.recordId, {
                                            value: e.target.value === "" ? null : Number(e.target.value),
                                          })
                                        }
                                      />
                                    ) : (
                                      <span className="text-muted">{v.noData ? "No data" : v.value}</span>
                                    )}
                                  </td>
                                  {editingId === row.id && (
                                    <td className="px-3 py-1.5">
                                      <input
                                        type="checkbox"
                                        checked={v.noData}
                                        onChange={(e) => setEditValue(v.recordId, { noData: e.target.checked })}
                                      />
                                    </td>
                                  )}
                                </tr>
                              ))}
                              {visibleValues.length === 0 && (
                                <tr>
                                  <td colSpan={editingId === row.id ? 3 : 2} className="px-3 py-3 text-center text-muted">
                                    No submitted KPIs — every KPI in this submission was marked &quot;No data&quot;.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                          {noDataCount > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleNoDataShown(row.id)}
                              className="w-full border-t border-surface-border px-3 py-1.5 text-left text-xs text-accent hover:underline"
                            >
                              {expanded ? "Hide no data" : `Show no data (${noDataCount})`}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
