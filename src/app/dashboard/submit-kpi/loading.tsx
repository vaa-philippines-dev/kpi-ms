import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Overrides the generic dashboard/loading.tsx (stat-tiles + table shape,
 * which doesn't fit this page) while a step's server data — connection
 * lookup, cluster grouping, KPI list — is being fetched between
 * GET-navigation steps.
 */
export default function SubmitKpiLoading() {
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3.5 w-56" />
        </div>
      </div>
      <Card className="mx-auto mt-6 max-w-lg p-8">
        <Skeleton className="mx-auto h-5 w-48" />
        <div className="mt-6 space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 rounded-lg border border-surface-border bg-background/40 px-4 py-3"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
