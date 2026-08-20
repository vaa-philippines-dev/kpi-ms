"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  getKpiConfigDetail,
  initKpiConfig,
  updateKpiConfig,
  deleteKpiConfig,
  resetKpiConfig,
  type KpiConfigDetailRow,
} from "@/app/dashboard/connections/kpi-config/actions";

/**
 * Per-connection KPI override editor — the guts of `KpiConfigTable`'s
 * row-click modal, extracted so it can also be embedded as a tab inside the
 * Connections detail modal (mirrors legacy's inline "KPI Configuration" tab,
 * AppVAConnections.html:848-989, rather than only being reachable from a
 * separate system-wide KPI Config screen).
 */
export function KpiConfigPanel({
  connectionId,
  isAdmin,
}: {
  connectionId: string;
  isAdmin: boolean;
}) {
  const [detail, setDetail] = useState<{
    missingCount: number;
    rows: KpiConfigDetailRow[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function load() {
    setDetail(null);
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

  return (
    <div className="space-y-4">
      {/* Mirrors legacy's "Reset to Defaults" (resetToDefaults() ->
          deleteKPIConfig + initKPIConfig back-to-back) — only shown once at
          least one override exists, same as legacy's hasConfig-gated button. */}
      {isAdmin && detail.rows.some((r) => r.id !== null) && (
        <div className="flex justify-end">
          <ConfirmSubmitButton
            action={resetKpiConfig}
            fields={{ connectionId }}
            label="Reset to defaults"
            confirmLabel="Replace all overrides with defaults?"
            successMessage="Reset to defaults."
            onSuccess={load}
          />
        </div>
      )}

      {detail.missingCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <p className="flex-1 text-xs text-warning">
            {detail.missingCount} KPI{detail.missingCount === 1 ? "" : "s"} not yet
            configured for this connection.
          </p>
          {isAdmin && (
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
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {detail.rows.map((r) => (
            <div key={r.kpiDefinitionId} className="rounded-lg border border-surface-border p-3">
              {r.id && isAdmin ? (
                <form
                  action={async (formData) => {
                    try {
                      await updateKpiConfig(formData);
                      toast("KPI config saved.", "success");
                      load();
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Something went wrong.", "error");
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
                    <input type="checkbox" name="isApplicable" defaultChecked={r.isApplicable} />
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
                    onSuccess={load}
                  />
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="flex-1">{r.name}</span>
                  <span className="text-xs text-muted">
                    Target {r.targetValue} · At Risk {r.deviationThresholdPct}% · Critical{" "}
                    {r.criticalThresholdPct}%
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
    </div>
  );
}
