"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { useToast } from "@/components/ui/toast";
import { updateSubmissionPeriod, deleteSubmission } from "@/app/dashboard/submissions/actions";
import { KpiPeriod } from "@/generated/prisma/enums";

export type RecentSubmissionRow = {
  id: string;
  submittedAt: string;
  vaName: string;
  clientName: string;
  departmentName: string;
  period: KpiPeriod;
  periodStart: string;
  valuesLabel: string;
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

function EditSubmissionModal({ row, onClose }: { row: RecentSubmissionRow; onClose: () => void }) {
  const [period, setPeriod] = useState(row.period);
  const [date, setDate] = useState(row.periodStart.slice(0, 10));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  function save() {
    setSaving(true);
    const formData = new FormData();
    formData.set("submissionId", row.id);
    formData.set("period", period);
    formData.set("date", date);
    (async () => {
      try {
        await updateSubmissionPeriod(formData);
        toast("Submission period updated.", "success");
        onClose();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update submission.", "error");
      } finally {
        setSaving(false);
      }
    })();
  }

  return (
    <Modal open onClose={onClose} title={`Edit Submission — ${row.clientName}`}>
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
        <Button type="button" loading={saving} onClick={save}>
          Save
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
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
      <Tr onClick={() => setOpen((o) => !o)} className="cursor-pointer">
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
          <Tr key={row.id} className="bg-background/40 align-top">
            <Td className="whitespace-nowrap text-xs text-muted">
              {new Date(row.submittedAt).toLocaleString()}
            </Td>
            <Td className="pl-10 text-sm">
              <div className="font-medium">{row.clientName}</div>
              <div className="text-xs text-muted">
                {row.departmentName} · {row.valuesLabel}
              </div>
            </Td>
            {canEdit && (
              <Td className="text-right whitespace-nowrap">
                <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    variant="outline"
                    className="px-2.5 py-1 text-xs"
                    onClick={() => onEdit(row)}
                  >
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
 * full row per client. Editing/deleting still targets the underlying
 * per-connection Submission row (unchanged from before grouping), just
 * reached by expanding a VA's group first.
 */
export function RecentSubmissionsTable({
  rows,
  canEdit,
}: {
  rows: RecentSubmissionRow[];
  canEdit: boolean;
}) {
  const [editingRow, setEditingRow] = useState<RecentSubmissionRow | null>(null);
  const groups = useMemo(() => groupByVa(rows), [rows]);

  return (
    <>
      <Table>
        <TableHead>
          <tr>
            <Th>Submitted</Th>
            <Th>VA / Client</Th>
            {canEdit && <Th className="text-right">Actions</Th>}
          </tr>
        </TableHead>
        <tbody>
          {groups.map((group, i) => (
            <VaGroupRow
              key={group.key}
              group={group}
              canEdit={canEdit}
              defaultOpen={i === 0}
              onEdit={setEditingRow}
            />
          ))}
        </tbody>
      </Table>

      {editingRow && <EditSubmissionModal row={editingRow} onClose={() => setEditingRow(null)} />}
    </>
  );
}
