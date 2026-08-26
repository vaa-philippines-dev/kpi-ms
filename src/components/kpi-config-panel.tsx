"use client";

import { ReactNode, useEffect, useState, useTransition } from "react";
import { Eye, Pencil } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  getKpiConfigDetail,
  initKpiConfig,
  updateKpiConfig,
  resetKpiConfig,
  type KpiConfigGroupRow,
} from "@/app/dashboard/connections/kpi-config/actions";
import { KpiDirection } from "@/generated/prisma/enums";

const DIRECTION_LABELS: Record<KpiDirection, string> = {
  HIGHER_IS_BETTER: "Higher is better",
  LOWER_IS_BETTER: "Lower is better",
};

/**
 * Per-connection KPI override editor — the guts of `KpiConfigTable`'s
 * row-click modal, extracted so it can also be embedded as a tab inside the
 * Connections detail modal (mirrors legacy's inline "KPI Configuration" tab,
 * AppVAConnections.html:848-989, rather than only being reachable from a
 * separate system-wide KPI Config screen). One row per KPI (Weekly and
 * Monthly targets side by side, mirroring legacy's KPI_Master grouping), with
 * a per-row "View/Edit" opening the detail editor (legacy's
 * `openKPIConfigEditor()`).
 */
export function KpiConfigPanel({
  connectionId,
  canEdit,
}: {
  connectionId: string;
  canEdit: boolean;
}) {
  const [detail, setDetail] = useState<{
    missingCount: number;
    rows: KpiConfigGroupRow[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<KpiConfigGroupRow | null>(null);
  const { toast } = useToast();

  function load() {
    // No explicit setDetail(null) here — `isPending` alone already gates
    // the loading skeleton below from the instant startTransition is
    // called, so resetting state synchronously isn't needed and trips
    // react-hooks/set-state-in-effect when this runs from the effect below.
    startTransition(async () => {
      try {
        const result = await getKpiConfigDetail(connectionId);
        setDetail(result);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to load KPI config.", "error");
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  if (isPending || !detail) {
    return <TableSkeleton rows={4} />;
  }

  const hasOverride = detail.rows.some((r) => r.hasOverride);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">KPI Configuration</h3>
          {hasOverride ? (
            <Badge tone="success">Custom Config</Badge>
          ) : (
            <Badge tone="warning">Using Defaults</Badge>
          )}
        </div>
        {canEdit && hasOverride && (
          <ConfirmSubmitButton
            action={resetKpiConfig}
            fields={{ connectionId }}
            label="Reset to Defaults"
            confirmLabel="Replace all overrides with defaults?"
            successMessage="Reset to defaults."
            onSuccess={load}
            tone="muted"
          />
        )}
      </div>

      {detail.missingCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <p className="flex-1 text-xs text-warning">
            {detail.missingCount} KPI{detail.missingCount === 1 ? "" : "s"} not yet
            configured for this connection.
          </p>
          {canEdit && (
            <form
              action={async (formData) => {
                try {
                  await initKpiConfig(formData);
                  toast("KPI config generated from defaults.", "success");
                  load();
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Something went wrong.", "error");
                }
              }}
            >
              <input type="hidden" name="connectionId" value={connectionId} />
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
        <Table>
          <TableHead>
            <tr>
              <Th>KPI Name</Th>
              <Th>Weekly Target</Th>
              <Th>Monthly Target</Th>
              <Th>Deviation</Th>
              <Th>At Risk Max</Th>
              <Th>Applicable</Th>
              <Th />
            </tr>
          </TableHead>
          <tbody>
            {detail.rows.map((r) => (
              <Tr key={r.key}>
                <Td>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted">{r.cluster}</div>
                </Td>
                <Td>{r.weekly ? r.weekly.targetValue : "—"}</Td>
                <Td>{r.monthly ? r.monthly.targetValue : "—"}</Td>
                <Td className="font-semibold text-warning">{r.deviationThresholdPct}</Td>
                <Td className="font-semibold text-danger">{r.criticalThresholdPct}</Td>
                <Td>
                  {r.isApplicable ? (
                    <Badge tone="success">Yes</Badge>
                  ) : (
                    <Badge tone="neutral">No</Badge>
                  )}
                </Td>
                <Td className="text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    aria-label={`${canEdit ? "Edit" : "View"} ${r.name}`}
                    className="text-muted transition hover:text-foreground"
                  >
                    {canEdit ? <Pencil className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${canEdit ? "Edit" : "View"} KPI — ${editing.name}` : ""}
        size="lg"
      >
        {editing && (
          <KpiEditForm
            connectionId={connectionId}
            row={editing}
            canEdit={canEdit}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function KpiInfoBox({
  row,
  directionLabel,
  defaultTargetLabel,
}: {
  row: KpiConfigGroupRow;
  directionLabel: string;
  defaultTargetLabel: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-surface-border p-3">
      <p className="text-sm font-semibold">{row.name}</p>
      <p className="text-xs text-muted">{row.cluster}</p>
      <p className="mt-2 text-xs text-muted">
        Unit: <span className="font-medium text-foreground">{row.unit ?? "—"}</span> · Direction:{" "}
        <span className="font-medium text-foreground">{directionLabel}</span> · Default Target:{" "}
        <span className="font-medium text-foreground">{defaultTargetLabel}</span>
      </p>
    </div>
  );
}

/**
 * The Weekly/Monthly Target fields, plus Deviation/At Risk Max/Applicable/
 * Notes, are edited in one submit — the latter four are stored per-period
 * underneath (see KpiConfigGroupRow) but shown here as one shared set of
 * fields, which `updateKpiConfig` then syncs to both period rows.
 */
function KpiEditForm({
  connectionId,
  row,
  canEdit,
  onCancel,
  onSaved,
}: {
  connectionId: string;
  row: KpiConfigGroupRow;
  canEdit: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const directionLabel = DIRECTION_LABELS[row.direction];
  const defaultWeekly = row.weekly?.defaultTargetValue;
  const defaultMonthly = row.monthly?.defaultTargetValue;
  const defaultTargetLabel: ReactNode =
    defaultWeekly !== undefined && defaultMonthly !== undefined
      ? defaultWeekly === defaultMonthly
        ? defaultWeekly
        : `${defaultWeekly} (Weekly) / ${defaultMonthly} (Monthly)`
      : (defaultWeekly ?? defaultMonthly ?? "—");

  if (!canEdit) {
    return (
      <div className="space-y-4">
        <KpiInfoBox row={row} directionLabel={directionLabel} defaultTargetLabel={defaultTargetLabel} />
        <div className="grid grid-cols-2 gap-4">
          <ReadOnlyField label="Weekly Target" value={row.weekly ? row.weekly.targetValue : "—"} />
          <ReadOnlyField label="Monthly Target" value={row.monthly ? row.monthly.targetValue : "—"} />
          <ReadOnlyField label="Deviation (%)" value={row.deviationThresholdPct} />
          <ReadOnlyField label="At Risk Max (%)" value={row.criticalThresholdPct} />
        </div>
        <ReadOnlyField label="Applicable to this connection" value={row.isApplicable ? "Yes" : "No"} />
        <ReadOnlyField label="Notes" value={row.notes || "—"} />
        <div className="flex justify-end border-t border-surface-border pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        try {
          await updateKpiConfig(formData);
          toast("KPI config saved.", "success");
          onSaved();
        } catch (e) {
          toast(e instanceof Error ? e.message : "Something went wrong.", "error");
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="connectionId" value={connectionId} />
      {row.weekly && (
        <input type="hidden" name="weeklyKpiDefinitionId" value={row.weekly.kpiDefinitionId} />
      )}
      {row.monthly && (
        <input type="hidden" name="monthlyKpiDefinitionId" value={row.monthly.kpiDefinitionId} />
      )}

      <KpiInfoBox row={row} directionLabel={directionLabel} defaultTargetLabel={defaultTargetLabel} />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Weekly Target">
          <Input
            name="weeklyTargetValue"
            type="number"
            step="any"
            defaultValue={row.weekly?.targetValue}
            disabled={!row.weekly}
            className="w-full"
          />
        </Field>
        <Field label="Monthly Target">
          <Input
            name="monthlyTargetValue"
            type="number"
            step="any"
            defaultValue={row.monthly?.targetValue}
            disabled={!row.monthly}
            className="w-full"
          />
        </Field>
        <Field label="Deviation (%)">
          <Input
            name="deviationThresholdPct"
            type="number"
            step="any"
            defaultValue={row.deviationThresholdPct}
            className="w-full"
          />
        </Field>
        <Field label="At Risk Max (%)">
          <Input
            name="criticalThresholdPct"
            type="number"
            step="any"
            defaultValue={row.criticalThresholdPct}
            className="w-full"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isApplicable" defaultChecked={row.isApplicable} />
        Applicable to this connection
      </label>

      <Field label="Notes">
        <Textarea name="notes" rows={3} defaultValue={row.notes ?? ""} className="w-full" />
      </Field>

      <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit">Save Changes</Button>
      </div>
    </form>
  );
}
