"use client";

import { useEffect, useState, useTransition } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { useToast } from "@/components/ui/toast";
import {
  getKpiConfigDetail,
  initKpiConfig,
  updateKpiConfig,
  deleteKpiConfig,
  type KpiConfigDetailRow,
} from "@/app/dashboard/connections/kpi-config/actions";

export type ConnectionConfigRow = {
  id: string;
  clientName: string;
  vaName: string;
  departmentName: string;
  serviceName: string | null;
  hasConfig: boolean;
};

const COLUMNS: DataTableColumn<ConnectionConfigRow>[] = [
  { key: "clientName", label: "Client", sortable: true, filterable: true },
  { key: "vaName", label: "VA", sortable: true, filterable: true, className: "text-muted" },
  {
    key: "departmentName",
    label: "Department",
    sortable: true,
    filterable: "select",
    className: "text-muted",
  },
  {
    key: "serviceName",
    label: "Service",
    sortable: true,
    filterable: "select",
    className: "text-muted",
    render: (v) => (v as string | null) ?? "—",
  },
  {
    key: "hasConfig",
    label: "Config",
    sortable: true,
    filterable: "select",
    filterOptions: [
      { value: "true", label: "Custom Config" },
      { value: "false", label: "Using Defaults" },
    ],
    searchText: (row) => (row.hasConfig ? "Custom Config" : "Using Defaults"),
    render: (v) =>
      v ? <Badge tone="success">Custom Config</Badge> : <Badge tone="warning">Using Defaults</Badge>,
  },
];

/**
 * KPI Config, rendered through the shared DataTable — mirrors legacy's KPI
 * Configuration screen (AppKPIConfig.html: `renderKPIConfig()`), which is a
 * system-wide connection list (not a pick-one-connection-first form) with a
 * per-row "View / Edit" that opens a KPI override editor
 * (`openKPIConfigEditor()`), ported here as a row-click modal. That
 * modal's data is fetched lazily on open rather than preloaded for every
 * connection — this system has roughly 11k KpiConfig rows in total, far
 * more than's reasonable to ship to the browser up front.
 */
export function KpiConfigTable({
  connections,
  isAdmin,
  initialConnectionId,
}: {
  connections: ConnectionConfigRow[];
  isAdmin: boolean;
  initialConnectionId?: string;
}) {
  // Deep link from Connections' "KPI Config →" — auto-opens the row the
  // user came from, same as clicking it directly. Computed as the initial
  // state (not set via an effect), since it only depends on props present
  // at mount.
  const [openId, setOpenId] = useState<string | null>(() =>
    initialConnectionId && connections.some((c) => c.id === initialConnectionId)
      ? initialConnectionId
      : null,
  );
  const [detail, setDetail] = useState<{
    missingCount: number;
    rows: KpiConfigDetailRow[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const openConn = connections.find((c) => c.id === openId) ?? null;

  function load(connectionId: string) {
    setDetail(null);
    startTransition(async () => {
      try {
        const result = await getKpiConfigDetail(connectionId);
        setDetail(result);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to load KPI config.", "error");
        setOpenId(null);
      }
    });
  }

  function openRow(conn: ConnectionConfigRow) {
    setOpenId(conn.id);
    load(conn.id);
  }

  // Trigger the deep link's data fetch once, on mount, if a row was
  // deep-link-opened. Fetches inline (not via `load`) since `detail` is
  // already null at this point and `load`'s own leading `setDetail(null)`
  // is what the "don't setState synchronously in an effect" lint rule
  // reacts to when called from here.
  useEffect(() => {
    if (!openId) return;
    startTransition(async () => {
      try {
        const result = await getKpiConfigDetail(openId);
        setDetail(result);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to load KPI config.", "error");
        setOpenId(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    setOpenId(null);
    setDetail(null);
  }

  function refetch() {
    if (openId) load(openId);
  }

  return (
    <>
      <DataTable
        columns={COLUMNS}
        data={connections}
        getRowId={(c) => c.id}
        defaultLimit={25}
        onRowClick={openRow}
        emptyMessage="No connections found."
      />

      <Modal open={openConn !== null} onClose={close} title={openConn?.clientName ?? ""}>
        {openConn && (
          <div className="space-y-4">
            <p className="text-xs text-muted">
              {openConn.vaName} · {openConn.departmentName}
            </p>

            {isPending || !detail ? (
              <p className="py-8 text-center text-sm text-muted">Loading…</p>
            ) : (
              <>
                {detail.missingCount > 0 && (
                  <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <p className="flex-1 text-xs text-warning">
                      {detail.missingCount} KPI{detail.missingCount === 1 ? "" : "s"} not
                      yet configured for this connection.
                    </p>
                    {isAdmin && (
                      <form
                        action={async (formData) => {
                          try {
                            await initKpiConfig(formData);
                            toast("KPI config generated from defaults.", "success");
                            refetch();
                          } catch (e) {
                            toast(
                              e instanceof Error ? e.message : "Something went wrong.",
                              "error",
                            );
                          }
                        }}
                      >
                        <input type="hidden" name="connectionId" value={openConn.id} />
                        <Button type="submit" className="shrink-0 px-3 py-1.5 text-xs">
                          Generate from defaults
                        </Button>
                      </form>
                    )}
                  </div>
                )}

                {detail.rows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">
                    No applicable KPIs for this connection&apos;s department/service.
                  </p>
                ) : (
                  <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                    {detail.rows.map((r) => (
                      <div
                        key={r.kpiDefinitionId}
                        className="rounded-lg border border-surface-border p-3"
                      >
                        {r.id && isAdmin ? (
                          <form
                            action={async (formData) => {
                              try {
                                await updateKpiConfig(formData);
                                toast("KPI config saved.", "success");
                                refetch();
                              } catch (e) {
                                toast(
                                  e instanceof Error ? e.message : "Something went wrong.",
                                  "error",
                                );
                              }
                            }}
                            className="grid grid-cols-2 items-center gap-2 sm:grid-cols-5"
                          >
                            <input type="hidden" name="id" value={r.id} />
                            <span className="text-sm sm:col-span-2">{r.name}</span>
                            <Input
                              name="targetValue"
                              type="number"
                              step="any"
                              defaultValue={r.targetValue}
                              className="py-1"
                            />
                            <Input
                              name="deviationThresholdPct"
                              type="number"
                              step="any"
                              defaultValue={r.deviationThresholdPct}
                              className="py-1"
                            />
                            <Input
                              name="criticalThresholdPct"
                              type="number"
                              step="any"
                              defaultValue={r.criticalThresholdPct}
                              className="py-1"
                            />
                            <label className="flex items-center gap-1.5 text-xs text-muted">
                              <input
                                type="checkbox"
                                name="isApplicable"
                                defaultChecked={r.isApplicable}
                              />
                              Applicable
                            </label>
                            <Button type="submit" className="px-3 py-1 text-xs">
                              Save
                            </Button>
                            <ConfirmSubmitButton
                              action={deleteKpiConfig}
                              fields={{ id: r.id }}
                              label="Remove override"
                              successMessage="Override removed."
                              onSuccess={refetch}
                            />
                          </form>
                        ) : (
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="flex-1">{r.name}</span>
                            <span className="text-xs text-muted">
                              Target {r.targetValue} · At Risk {r.deviationThresholdPct}%
                              · Critical {r.criticalThresholdPct}%
                            </span>
                            <span className="text-xs text-muted">
                              {r.id ? "Custom override" : "Using default"}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
