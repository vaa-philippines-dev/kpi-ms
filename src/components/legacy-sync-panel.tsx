"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type PhaseResult = { created: number; updated: number; skipped: number; errors: string[] };
type SyncReport = Record<string, PhaseResult>;

function ReportTable({ report }: { report: SyncReport }) {
  return (
    <div className="mt-3 space-y-2 text-xs">
      {Object.entries(report).map(([phase, r]) => (
        <div key={phase} className="rounded border border-surface-border p-2">
          <div className="font-medium">{phase}</div>
          <div className="text-muted">
            created {r.created} · updated {r.updated} · skipped {r.skipped}
            {r.errors.length > 0 && (
              <span className="text-danger"> · {r.errors.length} errors</span>
            )}
          </div>
          {r.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-danger">
              {r.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {r.errors.length > 10 && <li>...and {r.errors.length - 10} more</li>}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function SyncButton({ label, endpoint }: { label: string; endpoint: string }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sync failed.");
      } else {
        setReport(data.report);
      }
    } catch {
      setError("Network error while syncing.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Button onClick={run} disabled={loading}>
          {loading ? "Syncing…" : "Run Sync"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {report && <ReportTable report={report} />}
    </div>
  );
}

export function LegacySyncPanel() {
  return (
    <div className="space-y-4">
      <SyncButton label="Sync Reference Data (Departments, Services, Teams, Users, Connections, KPI Library, KPI Config, Interventions, Settings)" endpoint="/api/legacy-sync/reference" />
      <SyncButton label="Sync Historical Performance (KPI_Weekly_Summary / KPI_Monthly_Summary)" endpoint="/api/legacy-sync/performance" />
    </div>
  );
}
