"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import type { ClusterSummary } from "@/lib/kpi-cluster";
import { getClusterIcon } from "@/lib/cluster-icons";

/**
 * Cluster-picker step — lets a VA choose which cluster (e.g. Facebook,
 * Instagram, Amazon Task-based) to submit next instead of scrolling one flat
 * list of every KPI their department has. Same GET-navigation-form shape as
 * PeriodForm/CodeForm: one submit button per cluster, tracked via the
 * submit event's `submitter` so only the clicked option shows a spinner.
 *
 * Deliberately does NOT set `disabled` on any button (see PeriodForm for
 * the same note) — browsers exclude disabled controls when constructing
 * the submitted form data, so disabling the clicked button synchronously
 * in response to its own submit event silently drops `cluster=...` from
 * the navigation, and the page just reloads back to the picker with
 * nothing selected. The dim/opacity effect on the other buttons is purely
 * visual (no `disabled`), so the click always goes through.
 */
export function ClusterForm({
  clusters,
  extraParams,
}: {
  clusters: ClusterSummary[];
  /** Hidden fields carried through the GET navigation (period, date, and
   * either `code` or `connectionId` depending on which flow this is). */
  extraParams: Record<string, string>;
}) {
  const [pendingCluster, setPendingCluster] = useState<string | null>(null);
  const isPending = pendingCluster !== null;

  return (
    <form
      method="GET"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name === "cluster") {
          setPendingCluster(submitter.value);
        }
      }}
      className="mt-6 space-y-2 text-left"
    >
      {Object.entries(extraParams).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {clusters.map((c, i) => {
        const done = c.submittedCount >= c.kpiCount;
        const partial = c.submittedCount > 0 && !done;
        const Icon = getClusterIcon(c.cluster);
        return (
          <button
            key={c.cluster}
            type="submit"
            name="cluster"
            value={c.cluster}
            className={`animate-field-in flex w-full items-center justify-between gap-3 rounded-lg border border-surface-border bg-background/40 px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-hover ${
              isPending ? "pointer-events-none" : ""
            } ${isPending && pendingCluster !== c.cluster ? "opacity-40" : ""}`}
            style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
          >
            <span className="flex min-w-0 items-center gap-3">
              <Icon className="size-4 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{c.cluster}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {c.kpiCount} KPI{c.kpiCount === 1 ? "" : "s"}
                  {partial ? ` · ${c.submittedCount} submitted` : ""}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {done && (
                <span className="flex items-center gap-1 text-xs font-medium text-success">
                  <CheckCircle2 className="size-3.5" />
                  Submitted
                </span>
              )}
              {pendingCluster === c.cluster ? (
                <Loader2 className="size-4 animate-spin text-muted" />
              ) : (
                <ArrowRight className="size-4 text-muted" />
              )}
            </span>
          </button>
        );
      })}
    </form>
  );
}
