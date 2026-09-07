"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, Input } from "@/components/ui/input";

const CADENCE_OPTIONS = [
  { value: "", label: "Weekly + Monthly" },
  { value: "WEEKLY", label: "Weekly only" },
  { value: "MONTHLY", label: "Monthly only" },
];

export function GenerateSheetButton({ label, endpoint }: { label: string; endpoint: string }) {
  const [cadence, setCadence] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setUrl(null);
    try {
      const params = new URLSearchParams();
      if (cadence) params.set("period", cadence);
      if (date) params.set("date", date);
      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${endpoint}${query}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to generate sheet.");
        return;
      }
      setUrl(data.url);
    } catch {
      setError("Network error while generating the sheet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Cadence</label>
            <Select value={cadence} onChange={(e) => setCadence(e.target.value)} className="w-40">
              {CADENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Specific period (optional)</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          </div>
          <Button onClick={run} disabled={loading}>
            {loading ? "Generating…" : "Generate Sheet"}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Leave the period date blank to include every period on record, or pick
        any date in the target week/month to generate just that one.
      </p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {url && (
        <p className="mt-2 text-xs">
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            {url}
          </a>
        </p>
      )}
    </div>
  );
}
