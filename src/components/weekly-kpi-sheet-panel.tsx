"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function WeeklyKpiSheetPanel({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/export/weekly-kpi-sheet", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to refresh the sheet.");
        return;
      }
      setUrl(data.url);
    } catch {
      setError("Network error while refreshing the sheet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">Weekly KPI Sheet</span>
        <Button onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Same link every week — automatically refreshed every Monday (08:00
        Manila time) with the previous week&apos;s submissions. Also set to
        &quot;anyone with the link can view&quot;: treat it as public, not
        access-controlled.
      </p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {url ? (
        <p className="mt-2 text-xs">
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            {url}
          </a>
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Not generated yet — click &quot;Refresh now&quot; or wait for the next Monday run.
        </p>
      )}
    </div>
  );
}
