"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { useToast } from "@/components/ui/toast";
import { updateSubmission, deleteSubmission } from "@/app/dashboard/submissions/actions";
import { KpiPeriod } from "@/generated/prisma/enums";

export type RecentSubmissionValue = {
  recordId: string;
  kpiDefinitionId: string;
  kpiName: string;
  value: number | null;
  noData: boolean;
  targetValue: number;
};

export type RecentSubmissionRow = {
  id: string;
  submittedAt: string;
  vaName: string;
  clientName: string;
  departmentName: string;
  period: KpiPeriod;
  periodStart: string;
  values: RecentSubmissionValue[];
};

type VaSubmissionGroup = {
  key: string;
  vaName: string;
  period: KpiPeriod;
  periodStart: string;
  latestSubmittedAt: string;
  rows: RecentSubmissionRow[];
};

const PERIOD_LABEL: Record<KpiPeriod, string> = { WEEKLY: "Weekly", MONTHLY: "Monthly" };

// One VA logging KPIs for several clients in the same period previously
// produced one full table row per client, so a VA with five connections
// crowded out everything else in the log with five near-identical rows.
// Grouped here by VA + period + periodStart instead — the natural unit a
// reader cares about ("has this VA reported for this period yet") — with
// the per-client detail available on expand.
function groupByVa(rows: RecentSubmissionRow[]): VaSubmissionGroup[] {
  const groups = new Map<string, VaSubmissionGroup>();
  for (const row of rows) {
    const key = `${row.vaName}::${row.period}::${row.periodStart}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      if (row.submittedAt > existing.latestSubmittedAt) {
        existing.latestSubmittedAt = row.submittedAt;
      }
    } else {
      groups.set(key, {
        key,
        vaName: row.vaName,
        period: row.period,
        periodStart: row.periodStart,
        latestSubmittedAt: row.submittedAt,
        rows: [row],
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.latestSubmittedAt < b.latestSubmittedAt ? 1 : a.latestSubmittedAt > b.latestSubmittedAt ? -1 : 0,
  );
}

function ValueChips({ values }: { values: RecentSubmissionValue[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span
          key={v.recordId}
          className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-hover/60 px-2 py-0.5 text-xs"
        >
          <span className="text-muted">{v.kpiName}</span>
          <span className="font-medium">{v.noData ? "No data" : v.value}</span>
          <span className="text-muted">/ {v.targetValue} target</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Edits a submission's period/date and/or its per-KPI actual values in one
 * form — replaces the old date-only editor now that a manager can also
 * correct a typo'd value without needing to delete and re-submit.
 */
function EditSubmissionModal({ row, onClose }: { row: RecentSubmissionRow; onClose: () => void }) {
  const [period, setPeriod] = useState(row.period);
  const [date, setDate] = useState(row.periodStart.slice(0, 10));
  const [values, setValues] = useState(row.values);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  function setValue(recordId: string, patch: Partial<RecentSubmissionValue>) {
    setValues((prev) => prev.map((v) => (v.recordId === recordId ? { ...v, ...patch } : v)));
  }

  function save() {
    setSaving(true);
    const formData = new FormData();
    formData.set("submissionId", row.id);
    formData.set("period", period);
    formData.set("date", date);
    formData.set(
      "records",
      JSON.stringify(values.map((v) => ({ recordId: v.recordId, value: v.value, noData: v.noData }))),
    );
    (async () => {
      try {
        await updateSubmission(formData);
        toast("Submission updated.", "success");
        onClose();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update submission.", "error");
      } finally {
        setSaving(false);
      }
    })();
  }

  return (
    <Modal open onClose={onClose} title={`Edit Submission — ${row.clientName}`} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase">Period</label>
            <Select value={period} onChange={(e) => setPeriod(e.target.value as KpiPeriod)}>
              <option value={KpiPeriod.WEEKLY}>Weekly</option>
              <option value={KpiPeriod.MONTHLY}>Monthly</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted uppercase">
              {period === KpiPeriod.MONTHLY ? "Any date in target month" : "Any date in target week"}
            </label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border border-surface-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">KPI</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Actual</th>
                <th className="px-3 py-2 font-medium">No data</th>
              </tr>
            </thead>
            <tbody>
              {values.map((v) => (
                <tr key={v.recordId} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-medium">{v.kpiName}</td>
                  <td className="px-3 py-2 text-muted">{v.targetValue}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="any"
                      className="w-28"
                      value={v.value ?? ""}
                      disabled={v.noData}
                      onChange={(e) =>
                        setValue(v.recordId, { value: e.target.value === "" ? null : Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={v.noData}
                      onChange={(e) => setValue(v.recordId, { noData: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function VaGroupRow({
  group,
  canEdit,
  defaultOpen,
  onEdit,
}: {
  group: VaSubmissionGroup;
  canEdit: boolean;
  defaultOpen: boolean;
  onEdit: (row: RecentSubmissionRow) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const clientCount = new Set(group.rows.map((r) => r.clientName)).size;
  const departmentNames = [...new Set(group.rows.map((r) => r.departmentName))];

  return (
    <>
      <Tr onClick={() => setOpen((o) => !o)}>
        <Td className="whitespace-nowrap text-muted">
          {new Date(group.latestSubmittedAt).toLocaleString()}
        </Td>
        <Td colSpan={canEdit ? 2 : 1}>
          <div className="flex flex-wrap items-center gap-2">
            {open ? (
              <ChevronDown className="size-3.5 shrink-0 text-muted" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-muted" />
            )}
            <span className="font-medium">{group.vaName}</span>
            <span className="rounded-full border border-surface-border px-2 py-0.5 text-xs text-muted">
              {clientCount} client{clientCount === 1 ? "" : "s"}
            </span>
            <span className="text-xs text-muted">
              {PERIOD_LABEL[group.period]} · {new Date(group.periodStart).toLocaleDateString()}
            </span>
            {departmentNames.length === 1 && (
              <span className="text-xs text-muted">· {departmentNames[0]}</span>
            )}
          </div>
        </Td>
      </Tr>
      {open &&
        group.rows.map((row) => (
          <Tr
            key={row.id}
            className="bg-background/40 align-top"
            onClick={canEdit ? () => onEdit(row) : undefined}
          >
            <Td className="whitespace-nowrap text-xs text-muted">
              {new Date(row.submittedAt).toLocaleString()}
            </Td>
            <Td className="pl-10 text-sm">
              <div className="font-medium">{row.clientName}</div>
              <div className="text-xs text-muted">{row.departmentName}</div>
              <ValueChips values={row.values} />
            </Td>
            {canEdit && (
              <Td className="text-right whitespace-nowrap">
                <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1 px-2.5 py-1 text-xs"
                    onClick={() => onEdit(row)}
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
                  />
                </div>
              </Td>
            )}
          </Tr>
        ))}
    </>
  );
}

/**
 * The Submissions page's raw log, grouped per VA/period so one VA logging
 * several clients' KPIs reads as a single expandable entry instead of one
 * full row per client. Defaults to the last hour's activity (capped in
 * height so it can't push the rest of the page down as submissions pile
 * up), with a "View all recent" toggle to reveal everything already
 * fetched. Clicking anywhere on a client row (not just its Edit button)
 * opens the same editor, which can now correct the submitted actual values
 * in addition to the period/date.
 */
export function RecentSubmissionsTable({
  rows,
  canEdit,
  cutoffIso,
}: {
  rows: RecentSubmissionRow[];
  canEdit: boolean;
  // Computed server-side (now - 1h) at page render time — kept stable across
  // hydration rather than each client recomputing Date.now() independently,
  // which could flip a borderline row's group membership mid-hydration.
  cutoffIso: string;
}) {
  const [editingRow, setEditingRow] = useState<RecentSubmissionRow | null>(null);
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => groupByVa(rows), [rows]);
  const cutoff = useMemo(() => new Date(cutoffIso).getTime(), [cutoffIso]);
  const recentGroups = useMemo(
    () => groups.filter((g) => new Date(g.latestSubmittedAt).getTime() >= cutoff),
    [groups, cutoff],
  );
  const visibleGroups = showAll ? groups : recentGroups;
  const hiddenCount = groups.length - recentGroups.length;

  return (
    <>
      <ScrollArea className="max-h-[420px]">
        <Table>
          <TableHead>
            <tr>
              <Th>Submitted</Th>
              <Th>VA / Client</Th>
              {canEdit && <Th className="text-right">Actions</Th>}
            </tr>
          </TableHead>
          <tbody>
            {visibleGroups.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 3 : 2} className="px-4 py-6 text-center text-sm text-muted">
                  No submissions in the last hour.
                </td>
              </tr>
            ) : (
              visibleGroups.map((group, i) => (
                <VaGroupRow
                  key={group.key}
                  group={group}
                  canEdit={canEdit}
                  defaultOpen={i === 0}
                  onEdit={setEditingRow}
                />
              ))
            )}
          </tbody>
        </Table>
      </ScrollArea>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="mt-2 text-xs text-accent hover:underline"
        >
          {showAll ? "Show only the last hour" : `View all recent (${hiddenCount} more)`}
        </button>
      )}

      {editingRow && <EditSubmissionModal row={editingRow} onClose={() => setEditingRow(null)} />}
    </>
  );
}
