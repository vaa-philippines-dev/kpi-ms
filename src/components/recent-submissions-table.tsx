"use client";

import { useState } from "react";
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

const PERIOD_LABEL: Record<KpiPeriod, string> = { WEEKLY: "Weekly", MONTHLY: "Monthly" };

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

/**
 * The Submissions page's raw log — previously plain read-only rows with no
 * way to fix a wrongly-dated submission or remove one without knowing to
 * click a VA's name in the separate "Current Period Status" tracker table
 * further down the page. Adds an Actions column on the far right mirroring
 * what SubmissionEditModal already offers per-connection, directly on each
 * row here instead. Delete uses the same inline "Sure? Yes/Cancel"
 * ConfirmSubmitButton every other destructive action in this app uses —
 * no native browser confirm() dialog.
 */
export function RecentSubmissionsTable({
  rows,
  canEdit,
}: {
  rows: RecentSubmissionRow[];
  canEdit: boolean;
}) {
  const [editingRow, setEditingRow] = useState<RecentSubmissionRow | null>(null);

  return (
    <>
      <Table>
        <TableHead>
          <tr>
            <Th>Submitted</Th>
            <Th>VA</Th>
            <Th>Client</Th>
            <Th>Department</Th>
            <Th>Period</Th>
            <Th>Values</Th>
            {canEdit && <Th className="text-right">Actions</Th>}
          </tr>
        </TableHead>
        <tbody>
          {rows.map((row) => (
            <Tr key={row.id} className="align-top">
              <Td className="whitespace-nowrap text-muted">
                {new Date(row.submittedAt).toLocaleString()}
              </Td>
              <Td>{row.vaName}</Td>
              <Td>{row.clientName}</Td>
              <Td className="text-muted">{row.departmentName}</Td>
              <Td className="text-muted">
                {PERIOD_LABEL[row.period]} · {new Date(row.periodStart).toLocaleDateString()}
              </Td>
              <Td className="text-muted">{row.valuesLabel}</Td>
              {canEdit && (
                <Td className="text-right whitespace-nowrap">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => setEditingRow(row)}
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
        </tbody>
      </Table>

      {editingRow && <EditSubmissionModal row={editingRow} onClose={() => setEditingRow(null)} />}
    </>
  );
}
