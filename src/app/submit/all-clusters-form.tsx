"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiValueField } from "@/components/kpi-value-field";
import { getClusterIcon } from "@/lib/cluster-icons";
import { KpiDirection, KpiPeriod } from "@/generated/prisma/enums";
import { SubmitForm } from "./submit-form";
import { saveDraftBatch, type DraftEntry } from "./draft-actions";

export type AllClustersKpi = {
  id: string;
  name: string;
  cluster: string;
  targetValue: number;
  direction: KpiDirection;
  configTargetValue: number | null;
};

export type AllClustersGroup = { cluster: string; kpis: AllClustersKpi[] };

export type DraftValue = { value: number | null; noData: boolean };

/**
 * Every not-yet-submitted cluster on one scrollable page, with a single
 * Submit at the bottom instead of one submit-and-redirect round trip per
 * area — for a VA with several areas to log in one sitting. Field-level
 * changes are debounced into SubmissionDraft rows (draft-actions.ts) so
 * progress survives a closed tab; createSubmission clears the matching
 * drafts once the real Submission lands.
 */
export function AllClustersForm({
  groups,
  connectionId,
  period,
  dateParam,
  returnTo,
  submittingAsLabel,
  periodStartLabel,
  initialDrafts,
}: {
  groups: AllClustersGroup[];
  connectionId: string;
  period: KpiPeriod;
  dateParam?: string;
  returnTo?: string;
  submittingAsLabel: string;
  periodStartLabel: string;
  initialDrafts: Record<string, DraftValue>;
}) {
  const pendingRef = useRef(new Map<string, DraftEntry>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const flush = useCallback(() => {
    const entries = [...pendingRef.current.values()];
    if (entries.length === 0) return;
    pendingRef.current.clear();
    setSaveState("saving");
    saveDraftBatch(connectionId, period, dateParam, entries)
      .then((res) => setSaveState(res.ok ? "saved" : "idle"))
      .catch(() => setSaveState("idle"));
  }, [connectionId, period, dateParam]);

  useEffect(() => () => flush(), [flush]);

  const scheduleSave = useCallback(
    (kpiId: string, raw: string, noData: boolean) => {
      const parsed = raw === "" ? null : Number(raw);
      pendingRef.current.set(kpiId, {
        kpiDefinitionId: kpiId,
        value: noData || parsed === null || Number.isNaN(parsed) ? null : parsed,
        noData,
      });
      if (timerRef.current) clearTimeout(timerRef.current);
      // 1.5s of idle time after the last keystroke/toggle, not per
      // keystroke — a debounced batch call rather than a request storm.
      timerRef.current = setTimeout(flush, 1500);
    },
    [flush],
  );

  const clusterNames = groups.map((g) => g.cluster).join(",");

  return (
    <SubmitForm
      className="mt-8"
      hidden={{
        connectionId,
        period,
        clusters: clusterNames,
        ...(dateParam ? { date: dateParam } : {}),
        ...(returnTo ? { returnTo } : {}),
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border bg-background/40 px-3 py-2 text-xs text-muted">
        <span>
          Submitting as <span className="text-foreground">{submittingAsLabel}</span> for period
          starting {periodStartLabel}.
        </span>
        <span className="shrink-0">
          {saveState === "saving" ? "Saving draft…" : saveState === "saved" ? "Draft saved" : " "}
        </span>
      </div>

      {groups.map((group) => {
        const Icon = getClusterIcon(group.cluster);
        return (
          <div key={group.cluster} className="space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
              <Icon className="size-3.5" />
              {group.cluster}
            </h2>
            <div className="space-y-3">
              {group.kpis.map((kpi, i) => {
                const draft = initialDrafts[kpi.id];
                return (
                  <KpiValueField
                    key={kpi.id}
                    name={`kpi_${kpi.id}`}
                    label={kpi.name}
                    hint={`target ${kpi.configTargetValue ?? kpi.targetValue}, ${
                      kpi.direction === KpiDirection.HIGHER_IS_BETTER ? "higher is better" : "lower is better"
                    }`}
                    cluster={group.cluster}
                    index={i}
                    defaultValue={draft?.value ?? undefined}
                    defaultNoData={draft?.noData ?? false}
                    onValueChange={(value, noData) => scheduleSave(kpi.id, value, noData)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <Button type="submit" className="flex w-full items-center justify-center gap-2">
        Submit all
        <ArrowRight className="size-4" />
      </Button>
    </SubmitForm>
  );
}
