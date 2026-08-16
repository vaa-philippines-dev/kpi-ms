"use client";

import { useMemo, useState } from "react";
import { List, LayoutGrid } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";
import {
  createKpiDefinition,
  updateKpiDefinition,
  deleteKpiDefinition,
} from "@/app/dashboard/kpi-library/actions";

type Option = { id: string; name: string };

export type KpiRow = {
  id: string;
  name: string;
  cluster: string;
  departmentId: string;
  departmentName: string;
  direction: KpiDirection;
  period: KpiPeriod;
  targetValue: number;
  deviationThresholdPct: number;
  criticalThresholdPct: number;
};

const DIRECTION_LABELS: Record<KpiDirection, string> = {
  HIGHER_IS_BETTER: "Higher is better",
  LOWER_IS_BETTER: "Lower is better",
};

const DIRECTION_OPTIONS = Object.entries(DIRECTION_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const PERIOD_OPTIONS = Object.values(KpiPeriod).map((p) => ({ value: p, label: p }));

const COLUMNS: DataTableColumn<KpiRow>[] = [
  { key: "name", label: "Name", sortable: true, filterable: true },
  { key: "cluster", label: "Cluster", sortable: true, filterable: "select", className: "text-muted" },
  {
    key: "departmentName",
    label: "Department",
    sortable: true,
    filterable: "select",
    className: "text-muted",
  },
  {
    key: "direction",
    label: "Direction",
    sortable: true,
    filterable: "select",
    filterOptions: DIRECTION_OPTIONS,
    className: "text-muted",
    searchText: (row) => DIRECTION_LABELS[row.direction],
    render: (v) => DIRECTION_LABELS[v as KpiDirection],
  },
  {
    key: "period",
    label: "Period",
    sortable: true,
    filterable: "select",
    filterOptions: PERIOD_OPTIONS,
    className: "text-muted",
  },
  { key: "targetValue", label: "Target", sortable: true, className: "text-muted" },
  {
    key: "deviationThresholdPct",
    label: "At Risk %",
    sortable: true,
    className: "text-muted",
    render: (v) => `${v}%`,
  },
  {
    key: "criticalThresholdPct",
    label: "Critical %",
    sortable: true,
    className: "text-muted",
    render: (v) => `${v}%`,
  },
];

const UNCLUSTERED = "— No Cluster —";

/**
 * Grouped-by-cluster read view — mirrors legacy's cluster view
 * (AppKPI.html: `_buildClusterView()`), sub-grouped by department within
 * each cluster. Rows are clickable (same edit modal as the List view) for
 * admins.
 */
function ClusterView({
  kpis,
  isAdmin,
  onRowClick,
}: {
  kpis: KpiRow[];
  isAdmin: boolean;
  onRowClick: (k: KpiRow) => void;
}) {
  const clusters = useMemo(() => {
    const byCluster = new Map<string, KpiRow[]>();
    for (const k of kpis) {
      const key = k.cluster.trim() || UNCLUSTERED;
      if (!byCluster.has(key)) byCluster.set(key, []);
      byCluster.get(key)!.push(k);
    }
    return [...byCluster.entries()].sort(([a], [b]) => {
      if (a === UNCLUSTERED) return 1;
      if (b === UNCLUSTERED) return -1;
      return a.localeCompare(b);
    });
  }, [kpis]);

  if (clusters.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-surface-border py-10 text-center text-sm text-muted">
        No KPIs defined yet.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {clusters.map(([cluster, rows]) => (
        <div key={cluster}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {cluster}
            <span className="font-normal text-muted">({rows.length})</span>
          </h3>
          <Table>
            <TableHead>
              <tr>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Direction</Th>
                <Th>Period</Th>
                <Th>Target</Th>
                <Th>At Risk %</Th>
                <Th>Critical %</Th>
              </tr>
            </TableHead>
            <tbody>
              {rows.map((k) => (
                <Tr key={k.id} onClick={isAdmin ? () => onRowClick(k) : undefined}>
                  <Td>{k.name}</Td>
                  <Td className="text-muted">{k.departmentName}</Td>
                  <Td className="text-muted">{DIRECTION_LABELS[k.direction]}</Td>
                  <Td className="text-muted">{k.period}</Td>
                  <Td className="text-muted">{k.targetValue}</Td>
                  <Td className="text-muted">{k.deviationThresholdPct}%</Td>
                  <Td className="text-muted">{k.criticalThresholdPct}%</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ))}
    </div>
  );
}

function KpiForm({
  kpi,
  departments,
  action,
  onDone,
}: {
  kpi?: KpiRow;
  departments: Option[];
  action: (formData: FormData) => void | Promise<void>;
  onDone: () => void;
}) {
  return (
    <form
      action={action}
      onSubmit={onDone}
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {kpi && <input type="hidden" name="id" value={kpi.id} />}
      <Input
        name="name"
        placeholder="KPI name"
        defaultValue={kpi?.name}
        required
        className="sm:col-span-2"
      />
      <Input name="cluster" placeholder="Cluster" defaultValue={kpi?.cluster} required />
      <Select name="departmentId" required defaultValue={kpi?.departmentId ?? ""}>
        <option value="" disabled>
          Department
        </option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      <Select name="direction" defaultValue={kpi?.direction ?? KpiDirection.HIGHER_IS_BETTER}>
        {Object.values(KpiDirection).map((d) => (
          <option key={d} value={d}>
            {DIRECTION_LABELS[d]}
          </option>
        ))}
      </Select>
      <Select name="period" defaultValue={kpi?.period ?? KpiPeriod.MONTHLY}>
        {Object.values(KpiPeriod).map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      <Input
        name="targetValue"
        type="number"
        step="any"
        placeholder="Target value"
        defaultValue={kpi?.targetValue}
        required
      />
      <Input
        name="deviationThresholdPct"
        type="number"
        step="any"
        placeholder="At Risk % (default 10)"
        defaultValue={kpi?.deviationThresholdPct}
      />
      <Input
        name="criticalThresholdPct"
        type="number"
        step="any"
        placeholder="Critical % (default 25)"
        defaultValue={kpi?.criticalThresholdPct}
      />
      <Button type="submit" className="col-span-2 sm:col-span-4">
        {kpi ? "Save" : "Add KPI"}
      </Button>
    </form>
  );
}

/**
 * KPI Library, rendered through the shared DataTable — mirrors legacy's
 * KPI Master screen (AppKPI.html: `renderKPIMaster()`), which itself opened
 * an edit modal per row (`openEditKPI()`) and a create modal
 * (`openCreateKPI()`) rather than the inline whole-row edit form and
 * wall-of-delete-buttons this replaces.
 */
export function KpiLibraryTable({
  kpis,
  departments,
  isAdmin,
}: {
  kpis: KpiRow[];
  departments: Option[];
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState<KpiRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"list" | "cluster">("list");

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-surface-border bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              view === "list"
                ? "bg-surface-hover text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            <List className="size-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setView("cluster")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              view === "cluster"
                ? "bg-surface-hover text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            <LayoutGrid className="size-3.5" />
            By Cluster
          </button>
        </div>
        {isAdmin && <Button onClick={() => setAdding(true)}>+ Add KPI</Button>}
      </div>

      {view === "list" ? (
        <DataTable
          columns={COLUMNS}
          data={kpis}
          getRowId={(k) => k.id}
          defaultLimit={25}
          onRowClick={isAdmin ? (k) => setEditing(k) : undefined}
          emptyMessage="No KPIs defined yet."
        />
      ) : (
        <ClusterView kpis={kpis} isAdmin={isAdmin} onRowClick={setEditing} />
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add KPI">
        <KpiForm
          departments={departments}
          action={createKpiDefinition}
          onDone={() => setAdding(false)}
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ""}
      >
        {editing && (
          <div className="space-y-4">
            <KpiForm
              kpi={editing}
              departments={departments}
              action={updateKpiDefinition}
              onDone={() => setEditing(null)}
            />
            <div className="border-t border-surface-border pt-4">
              <ConfirmSubmitButton
                action={deleteKpiDefinition}
                fields={{ id: editing.id }}
                label="Delete this KPI"
                successMessage="KPI deleted."
                onSuccess={() => setEditing(null)}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
