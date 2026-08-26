"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Select, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { KpiConfigPanel } from "@/components/kpi-config-panel";
import { ConnectionPerformancePanel } from "@/components/connection-performance-panel";
import {
  CONNECTION_STATUS_LABELS,
  CONNECTION_STATUS_TONE,
  TERMINAL_CONNECTION_STATUSES,
} from "@/lib/connection-labels";
import { ConnectionStatus, ConnectionType } from "@/generated/prisma/enums";
import {
  updateConnectionStatus,
  updateConnectionType,
  updateConnectionInfo,
  toggleConnectionFlag,
  updateConnectionNotes,
  deleteConnection,
} from "@/app/dashboard/connections/actions";

const TYPE_LABELS: Record<ConnectionType, string> = {
  REGULAR: "Regular",
  PROJECT_BASED: "Project-based",
};

export type ConnectionStatusEventRow = {
  status: ConnectionStatus;
  changedAt: string;
  changedByName: string;
};

export type ConnectionInterventionRow = {
  id: string;
  createdAtLabel: string;
  type: string;
  description: string;
  actionTaken: string | null;
  outcome: string | null;
};

export type ConnectionRow = {
  id: string;
  // Null only for rows created before this field existed and not yet
  // backfilled — see scripts/backfill-connection-short-codes.ts.
  shortCode: string | null;
  clientName: string;
  secondaryName: string | null;
  vaName: string;
  vaEmail: string;
  departmentName: string;
  serviceName: string | null;
  teamLeaderName: string | null;
  status: ConnectionStatus;
  connectionType: ConnectionType;
  isFlagged: boolean;
  notes: string | null;
  hasKpiConfig: boolean;
  // Raw StartDate (nullable) for the editable field's default value —
  // distinct from `sinceDate` below, which already has the createdAt
  // fallback baked in for display/sort.
  startDate: string | null;
  createdAt: string;
  sinceDate: string;
  statusEvents: ConnectionStatusEventRow[];
  interventions: ConnectionInterventionRow[];
  interventionCount: number;
};

const STATUS_FILTER_OPTIONS = Object.entries(CONNECTION_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Most recent status-history entry matching a connection's *current*
 * status — used to answer legacy's "Paused/End date" info-grid item, which
 * only means something for Paused (since when) or terminal (ended when)
 * statuses. */
function currentStatusSince(row: ConnectionRow): string | null {
  const match = row.statusEvents.find((e) => e.status === row.status);
  return match ? match.changedAt : null;
}

// Column set mirrors legacy's connFilter() DataTable exactly (AppVAConnections.html:229-249):
// Account, VA Name, Dept / Service, Start Date, Status — no Flag or Type
// columns in the table itself; both are still editable from the detail modal.
function getColumns(isAdmin: boolean): DataTableColumn<ConnectionRow>[] {
  return [
    {
      key: "clientName",
      label: "Account",
      sortable: true,
      filterable: true,
      // Account = Client Name + SecondaryName subline, mirrors legacy's
      // Account cell (AppVAConnections.html connFilter()).
      render: (v, row) => (
        <>
          {v as string}
          {row.secondaryName && (
            <div className="text-xs text-muted">{row.secondaryName}</div>
          )}
        </>
      ),
    },
    {
      key: "shortCode",
      label: "Connection ID",
      sortable: true,
      filterable: true,
      className: "font-mono text-xs text-muted",
    },
    { key: "vaName", label: "VA Name", sortable: true, filterable: true, className: "text-muted" },
    {
      key: "departmentName",
      label: "Dept / Service",
      sortable: true,
      filterable: "select",
      className: "text-muted",
      // Service subline, kept distinct from the Client/SecondaryName cell above.
      render: (v, row) => (
        <>
          {v as string}
          {row.serviceName && row.serviceName !== row.departmentName && (
            <div className="text-xs text-muted">{row.serviceName}</div>
          )}
        </>
      ),
    },
    {
      key: "sinceDate",
      label: "Start Date",
      sortable: true,
      className: "text-muted",
      render: (v) => new Date(v as string).toLocaleDateString(),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: "select",
      filterOptions: STATUS_FILTER_OPTIONS,
      searchText: (row) => CONNECTION_STATUS_LABELS[row.status],
      render: (v, row) => {
        const status = v as ConnectionStatus;
        const label = CONNECTION_STATUS_LABELS[status];
        // Per-row quick "Set Active" action for admins on non-active,
        // non-terminal rows — mirrors legacy's inline quick-action button.
        if (isAdmin && status !== ConnectionStatus.ACTIVE && !TERMINAL_CONNECTION_STATUSES.has(status)) {
          return (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Badge tone={CONNECTION_STATUS_TONE[status]}>{label}</Badge>
              <form action={updateConnectionStatus}>
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="status" value={ConnectionStatus.ACTIVE} />
                <button
                  type="submit"
                  className="rounded-md border border-success/30 px-1.5 py-0.5 text-[11px] font-medium text-success transition hover:bg-success/10"
                >
                  Set Active
                </button>
              </form>
            </div>
          );
        }
        return <Badge tone={CONNECTION_STATUS_TONE[status]}>{label}</Badge>;
      },
    },
  ];
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted uppercase">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

// Hand this to the VA (chat/email) so they can paste it into /submit
// instead of picking their connection off a roster only managers should see.
function ShortCodeItem({ shortCode }: { shortCode: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!shortCode) {
    return <InfoItem label="Submission code">—</InfoItem>;
  }
  return (
    <InfoItem label="Submission code">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(shortCode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="font-mono text-sm text-accent hover:underline"
        title="Copy to clipboard"
      >
        {copied ? "Copied!" : shortCode}
      </button>
    </InfoItem>
  );
}

type DetailTab = "performance" | "kpi-config" | "interventions";

function ConnectionDetailTabs({
  connection,
  canEditKpi,
}: {
  connection: ConnectionRow;
  canEditKpi: boolean;
}) {
  const [tab, setTab] = useState<DetailTab>("performance");

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "performance", label: "Performance" },
    { key: "kpi-config", label: "KPI Configuration" },
    { key: "interventions", label: `Interventions (${connection.interventionCount})` },
  ];

  return (
    <div>
      <div className="mb-4 flex w-fit flex-wrap gap-1 rounded-lg bg-surface-hover/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === t.key
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "performance" && <ConnectionPerformancePanel connectionId={connection.id} />}
      {tab === "kpi-config" && (
        <KpiConfigPanel connectionId={connection.id} canEdit={canEditKpi} />
      )}
      {tab === "interventions" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Link
              href="/dashboard/interventions"
              className="text-xs text-accent hover:underline"
            >
              Log new →
            </Link>
          </div>
          {connection.interventions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No interventions logged for this connection.
            </p>
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {connection.interventions.map((iv) => (
                <div key={iv.id} className="rounded-lg border border-surface-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{iv.type}</span>
                    <span className="text-xs text-muted">{iv.createdAtLabel}</span>
                  </div>
                  <p className="mt-1 text-muted">{iv.description}</p>
                  {iv.actionTaken && (
                    <p className="mt-1 text-xs text-muted">
                      <span className="font-medium text-foreground">Action: </span>
                      {iv.actionTaken}
                    </p>
                  )}
                  {iv.outcome && (
                    <p className="mt-1 text-xs text-muted">
                      <span className="font-medium text-foreground">Outcome: </span>
                      {iv.outcome}
                    </p>
                  )}
                </div>
              ))}
              {connection.interventionCount > connection.interventions.length && (
                <p className="text-center text-xs text-muted">
                  +{connection.interventionCount - connection.interventions.length} more —{" "}
                  <Link href="/dashboard/interventions" className="text-accent hover:underline">
                    view all
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Connections list, rendered through the shared DataTable — mirrors
 * legacy's VA Connections screen, itself built on `renderDataTable()`
 * (AppVAConnections.html: `connFilter()`), including its row-click-opens-
 * detail behavior (`connOpenDetail()`/`openConnectionDetail()`,
 * AppVAConnections.html:848-989), ported here as a detail/edit modal with:
 * an info grid, inline-editable Account Name/SecondaryName/Start Date
 * (admin-only), the status-change and type-change forms, status history,
 * and three tabs (Performance / KPI Configuration / Interventions).
 */
export function ConnectionsTable({
  connections,
  isAdmin,
  canEditKpi,
  initialOpenId = null,
}: {
  connections: ConnectionRow[];
  isAdmin: boolean;
  // Separate from isAdmin — DM and OM can also edit KPI config, but not
  // the other admin-only connection-management actions this table gates.
  canEditKpi: boolean;
  // Deep-links straight into a connection's detail modal — e.g. the
  // Performance Summary table's "View Connection" link (`?open=<id>`).
  initialOpenId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const openConn = connections.find((c) => c.id === openId) ?? null;
  const columns = getColumns(isAdmin);

  function closeAnd(action: (formData: FormData) => void | Promise<void>) {
    return async (formData: FormData) => {
      await action(formData);
      setOpenId(null);
    };
  }

  const pausedOrEndedSince = openConn ? currentStatusSince(openConn) : null;

  return (
    <>
      <DataTable
        columns={columns}
        data={connections}
        getRowId={(c) => c.id}
        defaultLimit={25}
        onRowClick={(c) => setOpenId(c.id)}
        emptyMessage="No connections found."
      />

      <Modal
        open={openConn !== null}
        onClose={() => setOpenId(null)}
        title={openConn?.clientName ?? ""}
        size="xl"
      >
        {openConn && (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{openConn.vaName}</p>
                <p className="text-xs text-muted">
                  {openConn.vaEmail} · {openConn.departmentName}
                  {openConn.serviceName ? ` · ${openConn.serviceName}` : ""}
                </p>
              </div>
              {isAdmin && (
                <form action={toggleConnectionFlag}>
                  <input type="hidden" name="id" value={openConn.id} />
                  <button
                    type="submit"
                    title={openConn.isFlagged ? "Unflag connection" : "Flag connection"}
                    className={`rounded-md p-1.5 transition ${
                      openConn.isFlagged
                        ? "text-danger hover:bg-danger/10"
                        : "text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <Flag className={`size-4 ${openConn.isFlagged ? "fill-danger" : ""}`} />
                  </button>
                </form>
              )}
            </div>

            {isAdmin && (
              <form
                action={updateConnectionInfo}
                className="grid grid-cols-1 gap-2 rounded-lg border border-dashed border-surface-border p-3 sm:grid-cols-3"
              >
                <input type="hidden" name="id" value={openConn.id} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted uppercase">
                    Account Name
                  </label>
                  <Input name="clientName" defaultValue={openConn.clientName} className="w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted uppercase">
                    Secondary Name
                  </label>
                  <Input
                    name="secondaryName"
                    defaultValue={openConn.secondaryName ?? ""}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted uppercase">
                    Start Date
                  </label>
                  <Input
                    name="startDate"
                    type="date"
                    defaultValue={toDateInputValue(openConn.startDate)}
                    className="w-full"
                  />
                </div>
                <Button type="submit" className="px-3 py-1.5 text-xs sm:col-span-3 sm:w-fit">
                  Save account info
                </Button>
              </form>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <ShortCodeItem shortCode={openConn.shortCode} />
              <InfoItem label="Department">{openConn.departmentName}</InfoItem>
              <InfoItem label="Service">{openConn.serviceName ?? "—"}</InfoItem>
              <InfoItem label="VA Name">{openConn.vaName}</InfoItem>
              <InfoItem label="Team Leader">{openConn.teamLeaderName ?? "—"}</InfoItem>
              <InfoItem label="Start Date">
                {new Date(openConn.sinceDate).toLocaleDateString()}
              </InfoItem>
              <InfoItem label="Paused / End Date">
                {pausedOrEndedSince ? new Date(pausedOrEndedSince).toLocaleDateString() : "—"}
              </InfoItem>
              <InfoItem label="Flagged">{openConn.isFlagged ? "Yes" : "No"}</InfoItem>
              <InfoItem label="Has KPI Config">
                {openConn.hasKpiConfig ? (
                  <Badge tone="success">Custom Config</Badge>
                ) : (
                  <Badge tone="warning">Using Defaults</Badge>
                )}
              </InfoItem>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted uppercase">Status</p>
                {isAdmin && !TERMINAL_CONNECTION_STATUSES.has(openConn.status) ? (
                  <form action={closeAnd(updateConnectionStatus)} className="flex gap-1.5">
                    <input type="hidden" name="id" value={openConn.id} />
                    <Select name="status" defaultValue={openConn.status} className="py-1.5">
                      {Object.values(ConnectionStatus).map((s) => (
                        <option key={s} value={s}>
                          {CONNECTION_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" className="shrink-0 px-3 py-1.5 text-xs">
                      Save
                    </Button>
                  </form>
                ) : (
                  <Badge tone={CONNECTION_STATUS_TONE[openConn.status]}>
                    {CONNECTION_STATUS_LABELS[openConn.status]}
                  </Badge>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted uppercase">Type</p>
                {isAdmin ? (
                  <form action={closeAnd(updateConnectionType)} className="flex gap-1.5">
                    <input type="hidden" name="id" value={openConn.id} />
                    <Select
                      name="connectionType"
                      defaultValue={openConn.connectionType}
                      className="py-1.5"
                    >
                      {Object.values(ConnectionType).map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" className="shrink-0 px-3 py-1.5 text-xs">
                      Save
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm">{TYPE_LABELS[openConn.connectionType]}</p>
                )}
              </div>
            </div>

            {openConn.statusEvents.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted uppercase">
                  Status history
                </p>
                <ul className="space-y-1.5 text-xs text-muted">
                  {openConn.statusEvents.map((e, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <Badge tone={CONNECTION_STATUS_TONE[e.status]}>
                        {CONNECTION_STATUS_LABELS[e.status]}
                      </Badge>
                      <span>
                        {new Date(e.changedAt).toLocaleString()} by {e.changedByName}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-surface-border pt-4">
              <ConnectionDetailTabs connection={openConn} canEditKpi={canEditKpi} />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted uppercase">Notes</p>
              {isAdmin ? (
                <form action={updateConnectionNotes} className="space-y-1.5">
                  <input type="hidden" name="id" value={openConn.id} />
                  <Textarea
                    name="notes"
                    defaultValue={openConn.notes ?? ""}
                    rows={2}
                    placeholder="Free-text note about this connection…"
                    className="w-full"
                  />
                  <Button type="submit" className="px-3 py-1.5 text-xs">
                    Save note
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted">{openConn.notes || "—"}</p>
              )}
            </div>

            {isAdmin && (
              <div className="flex items-center justify-end border-t border-surface-border pt-4">
                <ConfirmSubmitButton
                  action={deleteConnection}
                  fields={{ id: openConn.id }}
                  label="Delete connection"
                  successMessage="Connection deleted."
                  onSuccess={() => setOpenId(null)}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
