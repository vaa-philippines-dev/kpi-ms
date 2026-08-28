"use client";

import { useMemo, useState, type DragEvent } from "react";
import { List, LayoutGrid, GripVertical } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { useToast } from "@/components/ui/toast";
import { formatKpiValue } from "@/lib/kpi-format";
import { KpiDirection, KpiPeriod, ThresholdUnit } from "@/generated/prisma/enums";
import {
  createKpiDefinition,
  updateKpiDefinition,
  deleteKpiDefinition,
  forceDeleteKpiDefinition,
  moveKpiCluster,
} from "@/app/dashboard/kpi-library/actions";

type Option = { id: string; name: string };
type ServiceOption = { id: string; name: string; departmentName: string };

export type KpiRow = {
  id: string;
  name: string;
  cluster: string;
  departmentId: string;
  departmentName: string;
  // Optional — null means the KPI applies dept-wide (every service/connection
  // in the department); set, it applies only to connections in that service.
  // See kpi-config/actions.ts and lib/alerts.ts for where this is consumed.
  serviceId: string | null;
  serviceName: string | null;
  direction: KpiDirection;
  period: KpiPeriod;
  // Display format for targetValue/actualValue — "Number" (2 decimal
  // places), "%" (percent sign), a custom string ("hrs", "$", …), or null
  // for no formatting at all. Free text historically (populated only by
  // the legacy sync), now editable as a structured choice here.
  unit: string | null;
  targetValue: number;
  deviationThresholdPct: number;
  criticalThresholdPct: number;
  // PERCENT: deviationThresholdPct/criticalThresholdPct are %-of-target
  // deviation. VALUE: they're raw floor/ceiling values on the target's own
  // scale (e.g. "actual must stay at or above 3.8") — see computeStatus.
  thresholdUnit: ThresholdUnit;
};

const DIRECTION_LABELS: Record<KpiDirection, string> = {
  HIGHER_IS_BETTER: "Higher is better",
  LOWER_IS_BETTER: "Lower is better",
};

const PERIOD_LABELS: Record<KpiPeriod, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

const DIRECTION_OPTIONS = Object.entries(DIRECTION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// The page filters to a single period from the global Weekly/Monthly topbar
// toggle before these rows ever get here, so a per-row Period column would
// always read the same value — dropped from both views for that reason.
function getColumns(onClusterClick: (cluster: string) => void): DataTableColumn<KpiRow>[] {
  return [
    { key: "name", label: "Name", sortable: true, filterable: true },
    {
      key: "cluster",
      label: "Cluster",
      sortable: true,
      filterable: "select",
      className: "text-muted",
      render: (v) => {
        // Blank cluster values group under the same "— No Cluster —" bucket
        // the "By Cluster" view uses, so clicking here filters consistently
        // with clicking that section's header.
        const label = (v as string).trim() || UNCLUSTERED;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClusterClick(label);
            }}
            className="hover:text-foreground hover:underline"
            title={`Filter to "${label}"`}
          >
            {label}
          </button>
        );
      },
    },
    {
      key: "departmentName",
      label: "Department",
      sortable: true,
      filterable: true,
      className: "text-muted",
    },
    {
      key: "serviceName",
      label: "Service",
      sortable: true,
      filterable: "select",
      filterPlaceholder: "All Services",
      className: "text-muted",
      render: (v) => (v as string | null) ?? "All Services",
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
      key: "unit",
      label: "Unit",
      sortable: true,
      filterable: "select",
      filterPlaceholder: "All Units",
      className: "text-muted",
      render: (v) => (v as string | null) ?? "—",
    },
    {
      key: "targetValue",
      label: "Target",
      sortable: true,
      className: "text-muted",
      render: (v, row) => formatKpiValue(v as number, row.unit),
    },
    {
      key: "deviationThresholdPct",
      label: "At Risk",
      sortable: true,
      className: "text-muted",
      render: (v, row) => (row.thresholdUnit === ThresholdUnit.VALUE ? `${v}` : `${v}%`),
    },
    {
      key: "criticalThresholdPct",
      label: "Critical",
      sortable: true,
      className: "text-muted",
      render: (v, row) => (row.thresholdUnit === ThresholdUnit.VALUE ? `${v}` : `${v}%`),
    },
  ];
}

const UNCLUSTERED = "— No Cluster —";
const NEW_CLUSTER_VALUE = "__new__";

/**
 * Grouped-by-cluster read view — mirrors legacy's cluster view
 * (AppKPI.html: `_buildClusterView()`), sub-grouped by department within
 * each cluster. Rows are clickable (same edit modal as the List view) and,
 * for managers, draggable onto another cluster's section to reassign them
 * without opening the edit modal at all.
 */
function ClusterView({
  kpis,
  canManage,
  onRowClick,
  pendingClusters,
  onMove,
  activeCluster,
  onClusterClick,
}: {
  kpis: KpiRow[];
  canManage: boolean;
  onRowClick: (k: KpiRow) => void;
  pendingClusters: string[];
  onMove: (id: string, cluster: string) => void;
  /** Set when a cluster header was clicked to narrow the view to just it —
   * `kpis` is already pre-filtered by the parent when this is set, so this
   * only drives the header's highlighted/"active" styling. */
  activeCluster: string | null;
  onClusterClick: (cluster: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCluster, setDragOverCluster] = useState<string | null>(null);

  const clusters = useMemo(() => {
    const byCluster = new Map<string, KpiRow[]>();
    for (const k of kpis) {
      const key = k.cluster.trim() || UNCLUSTERED;
      if (!byCluster.has(key)) byCluster.set(key, []);
      byCluster.get(key)!.push(k);
    }
    // Clusters created via "+ New Cluster" that don't have a KPI in them
    // yet — kept as empty drop targets until a KPI actually lands in one.
    for (const name of pendingClusters) {
      if (!byCluster.has(name)) byCluster.set(name, []);
    }
    return [...byCluster.entries()].sort(([a], [b]) => {
      if (a === UNCLUSTERED) return 1;
      if (b === UNCLUSTERED) return -1;
      return a.localeCompare(b);
    });
  }, [kpis, pendingClusters]);

  if (clusters.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-surface-border py-10 text-center text-sm text-muted">
        No KPIs defined yet.
      </p>
    );
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, cluster: string) {
    e.preventDefault();
    setDragOverCluster(null);
    const id = e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    if (!id) return;
    const dragged = kpis.find((k) => k.id === id);
    if (!dragged || (dragged.cluster.trim() || UNCLUSTERED) === cluster) return;
    onMove(id, cluster);
  }

  return (
    <div className="space-y-8">
      {clusters.map(([cluster, rows]) => {
        const droppable = canManage && cluster !== UNCLUSTERED;
        return (
          <div
            key={cluster}
            onDragOver={
              droppable
                ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverCluster(cluster);
                  }
                : undefined
            }
            onDragLeave={droppable ? () => setDragOverCluster((c) => (c === cluster ? null : c)) : undefined}
            onDrop={droppable ? (e) => handleDrop(e, cluster) : undefined}
            className={`rounded-xl p-2 -m-2 transition ${
              dragOverCluster === cluster ? "bg-accent/5 ring-2 ring-accent/30" : ""
            }`}
          >
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <button
                type="button"
                onClick={() => onClusterClick(cluster)}
                title={
                  activeCluster === cluster
                    ? "Clear cluster filter"
                    : `Filter to just "${cluster}"`
                }
                className={`rounded transition hover:underline ${
                  activeCluster === cluster ? "text-accent" : ""
                }`}
              >
                {cluster}
              </button>
              <span className="font-normal text-muted">({rows.length})</span>
            </h3>
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-surface-border py-6 text-center text-xs text-muted">
                Drag a KPI here to add it to this cluster.
              </p>
            ) : (
              <Table>
                <TableHead>
                  <tr>
                    {canManage && <Th className="w-8" />}
                    <Th>Name</Th>
                    <Th>Department</Th>
                    <Th>Service</Th>
                    <Th>Direction</Th>
                    <Th>Unit</Th>
                    <Th>Target</Th>
                    <Th>At Risk %</Th>
                    <Th>Critical %</Th>
                  </tr>
                </TableHead>
                <tbody>
                  {rows.map((k) => (
                    <Tr
                      key={k.id}
                      onClick={canManage ? () => onRowClick(k) : undefined}
                      className={draggingId === k.id ? "opacity-40" : ""}
                    >
                      {canManage && (
                        <Td className="text-muted">
                          <span
                            draggable
                            role="button"
                            aria-label={`Drag ${k.name} to another cluster`}
                            onClick={(e) => e.stopPropagation()}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.setData("text/plain", k.id);
                              e.dataTransfer.effectAllowed = "move";
                              setDraggingId(k.id);
                            }}
                            onDragEnd={() => {
                              setDraggingId(null);
                              setDragOverCluster(null);
                            }}
                            className="inline-flex cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical className="size-4" />
                          </span>
                        </Td>
                      )}
                      <Td>{k.name}</Td>
                      <Td className="text-muted">{k.departmentName}</Td>
                      <Td className="text-muted">{k.serviceName ?? "All Services"}</Td>
                      <Td className="text-muted">{DIRECTION_LABELS[k.direction]}</Td>
                      <Td className="text-muted">{k.unit ?? "—"}</Td>
                      <Td className="text-muted">{formatKpiValue(k.targetValue, k.unit)}</Td>
                      <Td className="text-muted">
                        {k.deviationThresholdPct}
                        {k.thresholdUnit === ThresholdUnit.PERCENT ? "%" : ""}
                      </Td>
                      <Td className="text-muted">
                        {k.criticalThresholdPct}
                        {k.thresholdUnit === ThresholdUnit.PERCENT ? "%" : ""}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Cluster picker — a dropdown of every cluster already in use, plus an
 * "+ Add new cluster…" option that swaps in a plain text field for a brand
 * new name. Replaces the old free-text box so a KPI can only land in an
 * existing cluster unless someone deliberately creates a new one.
 */
function ClusterField({
  clusters,
  initialCluster,
}: {
  clusters: string[];
  initialCluster?: string;
}) {
  const startsAsCustom = !!initialCluster && !clusters.includes(initialCluster);
  const [mode, setMode] = useState<"select" | "custom">(
    clusters.length === 0 || startsAsCustom ? "custom" : "select",
  );
  const [customValue, setCustomValue] = useState(startsAsCustom ? (initialCluster ?? "") : "");
  const [selectValue, setSelectValue] = useState(!startsAsCustom ? (initialCluster ?? "") : "");

  if (mode === "custom") {
    return (
      <div className="flex gap-2 sm:col-span-2">
        <Input
          name="cluster"
          placeholder="New cluster name"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          required
          autoFocus={clusters.length > 0}
          className="flex-1"
        />
        {clusters.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="shrink-0 px-3 py-2 text-xs"
            onClick={() => setMode("select")}
          >
            Choose existing
          </Button>
        )}
      </div>
    );
  }

  return (
    <Select
      name="cluster"
      required
      value={selectValue}
      onChange={(e) => {
        if (e.target.value === NEW_CLUSTER_VALUE) {
          setMode("custom");
          setCustomValue("");
        } else {
          setSelectValue(e.target.value);
        }
      }}
    >
      <option value="" disabled>
        Select a cluster…
      </option>
      {clusters.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={NEW_CLUSTER_VALUE}>+ Add new cluster…</option>
    </Select>
  );
}

const UNIT_OPTIONS = ["Number", "%"] as const;
const UNIT_LABELS: Record<(typeof UNIT_OPTIONS)[number], string> = {
  Number: "Number (2 decimals)",
  "%": "Percentage (%)",
};
const CUSTOM_UNIT_VALUE = "__custom__";

/**
 * Number-vs-Percentage picker for a KPI's value format — the actual fix for
 * "ROAS is set to Percentage, it should be Number with 2 decimal places":
 * before this, `unit` was a free-text column only the legacy sync ever
 * wrote, with no way to change it in-app. Same select-or-custom pattern as
 * ClusterField, so a legacy unit like "hrs" still round-trips through the
 * custom field instead of being silently dropped.
 */
function UnitField({ initialUnit }: { initialUnit?: string | null }) {
  const normalizedInitial = initialUnit?.trim() ?? "";
  const isKnown = (UNIT_OPTIONS as readonly string[]).includes(normalizedInitial);
  const startsAsCustom = !!normalizedInitial && !isKnown;
  const [mode, setMode] = useState<"select" | "custom">(startsAsCustom ? "custom" : "select");
  const [customValue, setCustomValue] = useState(startsAsCustom ? normalizedInitial : "");
  const [selectValue, setSelectValue] = useState(isKnown ? normalizedInitial : "");

  if (mode === "custom") {
    return (
      <div className="flex gap-2">
        <Input
          name="unit"
          placeholder="Custom unit (e.g. hrs)"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          autoFocus
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 px-3 py-2 text-xs"
          onClick={() => setMode("select")}
        >
          Standard
        </Button>
      </div>
    );
  }

  return (
    <Select
      name="unit"
      value={selectValue}
      onChange={(e) => {
        if (e.target.value === CUSTOM_UNIT_VALUE) {
          setMode("custom");
          setCustomValue("");
        } else {
          setSelectValue(e.target.value);
        }
      }}
    >
      <option value="">No unit</option>
      {UNIT_OPTIONS.map((u) => (
        <option key={u} value={u}>
          {UNIT_LABELS[u]}
        </option>
      ))}
      <option value={CUSTOM_UNIT_VALUE}>+ Custom unit…</option>
    </Select>
  );
}

const THRESHOLD_UNIT_LABELS: Record<ThresholdUnit, string> = {
  [ThresholdUnit.PERCENT]: "Percentage of target",
  [ThresholdUnit.VALUE]: "Raw value (same scale as target)",
};

function KpiForm({
  kpi,
  departments,
  services,
  clusters,
  defaultPeriod,
  action,
  onDone,
}: {
  kpi?: KpiRow;
  departments: Option[];
  services: ServiceOption[];
  clusters: string[];
  defaultPeriod: KpiPeriod;
  action: (formData: FormData) => void | Promise<void>;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [thresholdUnit, setThresholdUnit] = useState<ThresholdUnit>(
    kpi?.thresholdUnit ?? ThresholdUnit.PERCENT,
  );
  const [targetValue, setTargetValue] = useState<string>(
    kpi?.targetValue !== undefined ? String(kpi.targetValue) : "",
  );
  const [deviationThresholdPct, setDeviationThresholdPct] = useState<string>(
    kpi?.deviationThresholdPct !== undefined ? String(kpi.deviationThresholdPct) : "",
  );
  const [criticalThresholdPct, setCriticalThresholdPct] = useState<string>(
    kpi?.criticalThresholdPct !== undefined ? String(kpi.criticalThresholdPct) : "",
  );

  const target = parseFloat(targetValue);
  const isValueMode = thresholdUnit === ThresholdUnit.VALUE;
  const pctHint = (raw: string) => {
    if (!isValueMode || !target) return null;
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return null;
    return `≈ ${((n / target) * 100).toFixed(1)}% of target`;
  };

  function handleSubmit(formData: FormData) {
    setSaving(true);
    (async () => {
      try {
        await action(formData);
        toast(kpi ? "KPI updated." : "KPI added.", "success");
        onDone();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong.", "error");
      } finally {
        setSaving(false);
      }
    })();
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      {kpi && <input type="hidden" name="id" value={kpi.id} />}

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          Basic info
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input
            name="name"
            placeholder="KPI name"
            defaultValue={kpi?.name}
            required
            className="col-span-2"
          />
          <ClusterField clusters={clusters} initialCluster={kpi?.cluster} />
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
          <Select name="serviceId" defaultValue={kpi?.serviceId ?? ""} className="col-span-2 sm:col-span-4">
            <option value="">Service (optional — applies dept-wide)</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.departmentName})
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          Measurement
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Select name="direction" defaultValue={kpi?.direction ?? KpiDirection.HIGHER_IS_BETTER}>
            {Object.values(KpiDirection).map((d) => (
              <option key={d} value={d}>
                {DIRECTION_LABELS[d]}
              </option>
            ))}
          </Select>
          <Select name="period" defaultValue={kpi?.period ?? defaultPeriod}>
            {Object.values(KpiPeriod).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </Select>
          <UnitField initialUnit={kpi?.unit} />
          <Input
            name="targetValue"
            type="number"
            step="any"
            placeholder="Target value"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          Alert thresholds
        </h3>
        <div className="mb-3">
          <Select
            name="thresholdUnit"
            value={thresholdUnit}
            onChange={(e) => setThresholdUnit(e.target.value as ThresholdUnit)}
          >
            {Object.values(ThresholdUnit).map((u) => (
              <option key={u} value={u}>
                {THRESHOLD_UNIT_LABELS[u]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input
              name="deviationThresholdPct"
              type="number"
              step="any"
              placeholder={isValueMode ? "At Risk floor value" : "At Risk % (default 10)"}
              value={deviationThresholdPct}
              onChange={(e) => setDeviationThresholdPct(e.target.value)}
            />
            {pctHint(deviationThresholdPct) && (
              <p className="mt-1 text-xs text-muted">{pctHint(deviationThresholdPct)}</p>
            )}
          </div>
          <div>
            <Input
              name="criticalThresholdPct"
              type="number"
              step="any"
              placeholder={isValueMode ? "Critical floor value" : "Critical % (default 25)"}
              value={criticalThresholdPct}
              onChange={(e) => setCriticalThresholdPct(e.target.value)}
            />
            {pctHint(criticalThresholdPct) && (
              <p className="mt-1 text-xs text-muted">{pctHint(criticalThresholdPct)}</p>
            )}
          </div>
        </div>
        {isValueMode && (
          <p className="mt-2 text-xs text-muted">
            Enter both thresholds as raw values on the same scale as the target (e.g. an actual
            ROAS number), not percentages — the percentage above is just a reference.
          </p>
        )}
      </div>

      <Button type="submit" loading={saving} className="w-full">
        {kpi ? "Save changes" : "Add KPI"}
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
  services,
  clusters,
  canManage,
  defaultPeriod,
}: {
  kpis: KpiRow[];
  departments: Option[];
  services: ServiceOption[];
  clusters: string[];
  canManage: boolean;
  defaultPeriod: KpiPeriod;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<KpiRow | null>(null);
  const [adding, setAdding] = useState(false);
  // Defaults to the grouped view — easier to scan a department's clusters at
  // a glance, and it's what drag-and-drop reassignment needs anyway.
  const [view, setView] = useState<"list" | "cluster">("cluster");
  const [departmentFilter, setDepartmentFilter] = useState("");
  // Set by clicking a cluster name (List view's Cluster cell, or a "By
  // Cluster" section header) — click again on the same one to clear it.
  const [clusterFilter, setClusterFilter] = useState<string | null>(null);
  const [pendingClusters, setPendingClusters] = useState<string[]>([]);
  const [addingCluster, setAddingCluster] = useState(false);
  const [newClusterName, setNewClusterName] = useState("");

  const filteredKpis = useMemo(
    () =>
      kpis.filter(
        (k) =>
          (!departmentFilter || k.departmentId === departmentFilter) &&
          (!clusterFilter || (k.cluster.trim() || UNCLUSTERED) === clusterFilter),
      ),
    [kpis, departmentFilter, clusterFilter],
  );

  function handleClusterClick(cluster: string) {
    setClusterFilter((current) => (current === cluster ? null : cluster));
  }

  const allClusters = useMemo(
    () => Array.from(new Set([...clusters, ...pendingClusters])).sort((a, b) => a.localeCompare(b)),
    [clusters, pendingClusters],
  );

  const clusterCount = useMemo(
    () => new Set(filteredKpis.map((k) => k.cluster.trim()).filter(Boolean)).size,
    [filteredKpis],
  );

  function commitNewCluster() {
    const name = newClusterName.trim();
    if (name && !allClusters.includes(name)) {
      setPendingClusters((p) => [...p, name]);
      setView("cluster");
    }
    setNewClusterName("");
    setAddingCluster(false);
  }

  function handleMove(id: string, cluster: string) {
    (async () => {
      try {
        await moveKpiCluster(id, cluster);
        toast(`Moved to "${cluster}".`, "success");
        setPendingClusters((p) => p.filter((c) => c !== cluster));
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't move that KPI.", "error");
      }
    })();
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
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
            <Select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-auto"
              aria-label="Filter by department"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted">
              {filteredKpis.length} KPI{filteredKpis.length === 1 ? "" : "s"} · {clusterCount} cluster
              {clusterCount === 1 ? "" : "s"}
            </span>
            {clusterFilter && (
              <button
                type="button"
                onClick={() => setClusterFilter(null)}
                className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent transition hover:bg-accent/25"
              >
                Cluster: {clusterFilter}
                <span aria-hidden>✕</span>
              </button>
            )}
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="px-3 py-2 text-xs"
                onClick={() => setAddingCluster((v) => !v)}
              >
                + New Cluster
              </Button>
              <Button onClick={() => setAdding(true)}>+ Add KPI</Button>
            </div>
          )}
        </div>

        {addingCluster && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-surface-border p-2">
            <Input
              autoFocus
              value={newClusterName}
              onChange={(e) => setNewClusterName(e.target.value)}
              placeholder="New cluster name"
              className="max-w-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitNewCluster();
                } else if (e.key === "Escape") {
                  setAddingCluster(false);
                  setNewClusterName("");
                }
              }}
            />
            <Button type="button" className="px-3 py-1.5 text-xs" onClick={commitNewCluster}>
              Create
            </Button>
            <Button
              type="button"
              variant="outline"
              className="px-3 py-1.5 text-xs"
              onClick={() => {
                setAddingCluster(false);
                setNewClusterName("");
              }}
            >
              Cancel
            </Button>
            <span className="text-xs text-muted">
              Switches to By Cluster — drag a KPI into it there to save, or pick it from the KPI form.
            </span>
          </div>
        )}
      </div>

      {view === "list" ? (
        <DataTable
          columns={getColumns(handleClusterClick)}
          data={filteredKpis}
          getRowId={(k) => k.id}
          defaultLimit={25}
          onRowClick={canManage ? (k) => setEditing(k) : undefined}
          emptyMessage="No KPIs match the current filters."
        />
      ) : (
        <ClusterView
          kpis={filteredKpis}
          canManage={canManage}
          onRowClick={setEditing}
          pendingClusters={pendingClusters.filter((c) => !clusterFilter || c === clusterFilter)}
          onMove={handleMove}
          activeCluster={clusterFilter}
          onClusterClick={handleClusterClick}
        />
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add KPI" size="lg">
        <KpiForm
          departments={departments}
          services={services}
          clusters={allClusters}
          defaultPeriod={defaultPeriod}
          action={createKpiDefinition}
          onDone={() => setAdding(false)}
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ""}
        size="lg"
      >
        {editing && (
          <div className="space-y-4">
            <KpiForm
              kpi={editing}
              departments={departments}
              services={services}
              clusters={allClusters}
              defaultPeriod={defaultPeriod}
              action={updateKpiDefinition}
              onDone={() => setEditing(null)}
            />
            <div className="border-t border-surface-border pt-4">
              <DeleteKpiControl
                kpiId={editing.id}
                kpiName={editing.name}
                onDeleted={() => setEditing(null)}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * Progressive-disclosure delete: tries the safe delete first (blocked
 * server-side if the KPI has submissions/performance data/config overrides
 * — see deleteKpiDefinition), and only reveals the irreversible "force
 * delete" option, with its own scarier confirm text, once that's actually
 * been rejected. Keeps the common case (no history yet) a single click
 * while still requiring a second explicit action to destroy real data.
 */
function DeleteKpiControl({
  kpiId,
  kpiName,
  onDeleted,
}: {
  kpiId: string;
  kpiName: string;
  onDeleted: () => void;
}) {
  const [blocked, setBlocked] = useState(false);

  if (blocked) {
    return (
      <ConfirmSubmitButton
        action={forceDeleteKpiDefinition}
        fields={{ id: kpiId }}
        label="Force delete anyway"
        confirmLabel="This permanently deletes every submission, performance record, and config override for this KPI — it cannot be undone."
        typeToConfirm={kpiName}
        successMessage="KPI and its history deleted."
        onSuccess={onDeleted}
      />
    );
  }

  return (
    <ConfirmSubmitButton
      action={async (formData) => {
        try {
          await deleteKpiDefinition(formData);
        } catch (e) {
          if (e instanceof Error && e.message.includes("submissions recorded")) {
            setBlocked(true);
          }
          throw e;
        }
      }}
      fields={{ id: kpiId }}
      label="Delete this KPI"
      successMessage="KPI deleted."
      onSuccess={onDeleted}
    />
  );
}
