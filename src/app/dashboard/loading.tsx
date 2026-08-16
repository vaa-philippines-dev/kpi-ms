/**
 * Route-level loading fallback for every /dashboard/* page — shown while
 * a page's server data is being fetched (e.g. on slow navigations or
 * period-nav clicks against pages doing unbounded queries). A generic
 * skeleton rather than a spinner, since most dashboard pages share the
 * same page-bar + stat-tiles + table shape.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-md bg-surface-hover" />
          <div className="h-3.5 w-64 rounded-md bg-surface-hover" />
        </div>
        <div className="h-8 w-36 rounded-lg bg-surface-hover" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-surface-border bg-surface" />
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-surface-border">
        <div className="h-9 bg-surface" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 border-t border-surface-border bg-background" />
        ))}
      </div>
    </div>
  );
}
