import { Badge } from "@/components/ui/badge";
import { CONNECTION_STATUS_LABELS, CONNECTION_STATUS_TONE } from "@/lib/connection-labels";
import type { ConnectionRow } from "@/components/connections-table";

/**
 * VA ("My VA Connections") view — mirrors legacy's `renderVAConnections()`
 * (AppVAConnections.html:812-843), a card grid rather than the flat table
 * Admin/DM/OM get: one card per connection with Client Name, status badge,
 * Secondary Name, and "Started: date".
 */
export function ConnectionCardGrid({ connections }: { connections: ConnectionRow[] }) {
  if (connections.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No connections found.</p>;
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {connections.map((c) => (
        <div key={c.id} className="rounded-xl border border-surface-border bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{c.clientName}</p>
              {c.secondaryName && (
                <p className="truncate text-xs text-muted">{c.secondaryName}</p>
              )}
            </div>
            <Badge tone={CONNECTION_STATUS_TONE[c.status]}>{CONNECTION_STATUS_LABELS[c.status]}</Badge>
          </div>
          <p className="mt-3 text-xs text-muted">
            Started: {new Date(c.sinceDate).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}
