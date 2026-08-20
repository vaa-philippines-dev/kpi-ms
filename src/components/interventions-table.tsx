"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  createIntervention,
  updateIntervention,
  deleteIntervention,
} from "@/app/dashboard/interventions/actions";

type Option = { id: string; name: string };

export type InterventionRow = {
  id: string;
  createdAtMs: number;
  createdAtLabel: string;
  vaName: string;
  clientName: string;
  type: string;
  description: string;
  actionTaken: string | null;
  outcome: string | null;
};

const COLUMNS: DataTableColumn<InterventionRow>[] = [
  {
    key: "createdAtMs",
    label: "Date",
    sortable: true,
    className: "text-muted whitespace-nowrap",
    render: (_v, row) => row.createdAtLabel,
  },
  {
    key: "clientName",
    label: "Connection",
    sortable: true,
    filterable: true,
    render: (v, row) => (
      <>
        {row.vaName}
        <div className="text-xs text-muted">{v as string}</div>
      </>
    ),
  },
  { key: "type", label: "Type", sortable: true, filterable: "select", className: "text-muted" },
  {
    key: "description",
    label: "Description",
    filterable: true,
    className: "max-w-xs truncate text-muted",
  },
  {
    key: "actionTaken",
    label: "Action Taken",
    filterable: true,
    className: "max-w-xs truncate text-muted",
    render: (v) => (v as string | null) ?? "—",
  },
  {
    key: "outcome",
    label: "Outcome",
    filterable: true,
    className: "max-w-xs truncate text-muted",
    render: (v) => (v as string | null) ?? "—",
  },
];

/**
 * Interventions log, rendered through the shared DataTable. Legacy's
 * equivalent screen (AppSettings.html: `renderInterventions()`) required
 * picking one connection from a dropdown before showing anything; this
 * keeps the system-wide list this app already had (scoped by role via
 * `connectionScopeWhere`, same as every other report) and just upgrades
 * the table itself — search/sort/filter/pagination — plus turns the
 * per-row outcome-edit-and-delete into a modal, matching the row-click
 * pattern used for Connections and KPI Config.
 */
export function InterventionsTable({
  interventions,
  connections,
  interventionTypes,
  isManager,
}: {
  interventions: InterventionRow[];
  connections: Option[];
  interventionTypes: string[];
  isManager: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const openIv = interventions.find((i) => i.id === openId) ?? null;

  return (
    <>
      {isManager && connections.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setAdding(true)}>+ Log Intervention</Button>
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        data={interventions}
        getRowId={(i) => i.id}
        defaultLimit={25}
        defaultSort={{ key: "createdAtMs", dir: "desc" }}
        onRowClick={isManager ? (i) => setOpenId(i.id) : undefined}
        emptyMessage="No interventions logged yet."
      />

      <Modal open={adding} onClose={() => setAdding(false)} title="Log Intervention">
        <form
          action={createIntervention}
          onSubmit={() => setAdding(false)}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Select name="connectionId" required defaultValue="" className="sm:col-span-2">
            <option value="" disabled>
              Connection
            </option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select name="type" required defaultValue="">
            <option value="" disabled>
              Type
            </option>
            {interventionTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Input name="actionTaken" placeholder="Action taken (optional)" />
          <Input
            name="outcome"
            placeholder="Initial outcome (optional)"
            className="col-span-2 w-full sm:col-span-4"
          />
          <Textarea
            name="description"
            placeholder="Description"
            required
            rows={3}
            className="col-span-2 w-full sm:col-span-4"
          />
          <Button type="submit" className="col-span-2 sm:col-span-4">
            Log Intervention
          </Button>
        </form>
      </Modal>

      <Modal
        open={openIv !== null}
        onClose={() => setOpenId(null)}
        title={openIv ? `${openIv.vaName} · ${openIv.clientName}` : ""}
      >
        {openIv && (
          <div className="space-y-4">
            <form
              action={updateIntervention}
              onSubmit={() => setOpenId(null)}
              className="space-y-3"
            >
              <input type="hidden" name="id" value={openIv.id} />

              <div>
                <label className="mb-1 block text-xs font-medium text-muted uppercase">
                  Type
                </label>
                <Select name="type" defaultValue={openIv.type} className="w-full">
                  {interventionTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {!interventionTypes.includes(openIv.type) && (
                    <option value={openIv.type}>{openIv.type}</option>
                  )}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted uppercase">
                  Description
                </label>
                <Textarea
                  name="description"
                  defaultValue={openIv.description}
                  rows={2}
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted uppercase">
                  Action Taken
                </label>
                <Input
                  name="actionTaken"
                  defaultValue={openIv.actionTaken ?? ""}
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted uppercase">
                  Outcome
                </label>
                <Textarea
                  name="outcome"
                  defaultValue={openIv.outcome ?? ""}
                  rows={2}
                  className="w-full"
                />
              </div>

              <Button type="submit" className="w-full">
                Save
              </Button>
            </form>

            <div className="border-t border-surface-border pt-4">
              <ConfirmSubmitButton
                action={deleteIntervention}
                fields={{ id: openIv.id }}
                label="Delete this intervention"
                successMessage="Intervention deleted."
                onSuccess={() => setOpenId(null)}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
