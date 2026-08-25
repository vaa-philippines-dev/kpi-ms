import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * Overrides the generic dashboard/loading.tsx (stat-tiles + table shape,
 * which doesn't fit this page) while a connection's history — status
 * events, performance summaries, interventions — is being fetched, both on
 * first navigation into the page and when the combobox swaps connections.
 */
export default function ClientDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3.5 w-80" />
      </div>

      <div className="max-w-4xl space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-10 sm:w-56" />
          <Skeleton className="h-10 flex-1" />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-surface-border p-5">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>
          <Skeleton className="h-9 w-32 shrink-0" />
        </div>

        <div>
          <Skeleton className="mb-3 h-3.5 w-48" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>

        <div>
          <Skeleton className="mb-3 h-3.5 w-40" />
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="size-6" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="size-6" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 28 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        </div>

        <div>
          <Skeleton className="mb-3 h-3.5 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-72" />
            ))}
          </div>
        </div>

        <div>
          <Skeleton className="mb-3 h-3.5 w-28" />
          <TableSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}
