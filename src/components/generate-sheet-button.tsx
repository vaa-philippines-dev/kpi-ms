"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function GenerateSheetButton({ label, endpoint }: { label: string; endpoint: string }) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setUrl(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
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
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Button onClick={run} disabled={loading}>
          {loading ? "Generating…" : "Generate Sheet"}
        </Button>
      </div>
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
