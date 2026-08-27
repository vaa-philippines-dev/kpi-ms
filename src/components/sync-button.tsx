"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type PhaseResult = { created: number; updated: number; skipped: number; errors: string[] };
export type SyncReport = Record<string, PhaseResult>;

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

type Progress = { phase: string; done: number; total: number };

export function SyncButton({ label, endpoint }: { label: string; endpoint: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setReport(null);
    setProgress(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Sync failed.");
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setError("No response body.");
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "progress") {
            setProgress({ phase: event.phase, done: event.done, total: event.total });
          } else if (event.type === "done") {
            setReport(event.report);
            setProgress(null);
            router.refresh();
          } else if (event.type === "error") {
            setError(event.error);
          }
        }
      }
    } catch {
      setError("Network error while syncing.");
    } finally {
      setLoading(false);
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <div className="rounded-lg border border-surface-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Button onClick={run} disabled={loading}>
          {loading ? "Syncing…" : "Run Sync"}
        </Button>
      </div>
      {loading && (
        <div className="mt-2 text-xs text-muted">
          {progress ? (
            <>
              <div>
                {progress.phase}: {progress.done}/{progress.total} ({pct}%)
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          ) : (
            "Starting…"
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {report && <ReportTable report={report} />}
    </div>
  );
}
