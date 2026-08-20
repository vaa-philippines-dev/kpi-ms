/** Pulsing placeholder block — the base unit for skeleton loading states. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-hover ${className}`} />;
}

/** A handful of skeleton rows shaped like a DataTable, for content that
 * loads client-side inside an already-mounted page (e.g. a modal). */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-surface-border">
      <div className="h-9 animate-pulse bg-surface-hover/60" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-t border-surface-border px-3 py-2.5"
        >
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}
