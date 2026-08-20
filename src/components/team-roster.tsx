import type { ConnectionRow } from "@/components/connections-table";

/**
 * OM ("My Team") connections view — mirrors legacy's `renderMyTeam()`
 * (AppVAConnections.html:15-58), which groups by VA person rather than by
 * connection: one row per VA with a connection-count badge and a preview
 * of up to 3 client names, not the flat per-connection table Admin/DM get.
 */
export function TeamRoster({ connections }: { connections: ConnectionRow[] }) {
  const byVa = new Map<string, { vaName: string; departmentName: string; rows: ConnectionRow[] }>();
  for (const c of connections) {
    const existing = byVa.get(c.vaEmail);
    if (existing) existing.rows.push(c);
    else byVa.set(c.vaEmail, { vaName: c.vaName, departmentName: c.departmentName, rows: [c] });
  }
  const vas = [...byVa.entries()]
    .map(([vaEmail, v]) => ({ vaEmail, ...v }))
    .sort((a, b) => a.vaName.localeCompare(b.vaName));

  if (vas.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No team members found.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-surface-border text-left text-xs text-muted uppercase">
          <tr>
            <th className="px-4 py-2.5 font-medium">Virtual Assistant</th>
            <th className="px-4 py-2.5 font-medium">Department</th>
            <th className="px-4 py-2.5 font-medium">Connections</th>
            <th className="px-4 py-2.5 font-medium">Clients</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {vas.map((va) => {
            const preview = va.rows.slice(0, 3).map((r) => r.clientName);
            const extra = va.rows.length - preview.length;
            return (
              <tr key={va.vaEmail}>
                <td className="px-4 py-3">
                  <div className="font-medium">{va.vaName}</div>
                  <div className="text-xs text-muted">{va.vaEmail}</div>
                </td>
                <td className="px-4 py-3 text-muted">{va.departmentName}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                    {va.rows.length}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {preview.join(", ")}
                  {extra > 0 && <span> +{extra} more</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
