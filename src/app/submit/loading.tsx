import { Skeleton } from "@/components/ui/skeleton";
import { SubmitShell } from "./submit-shell";

/**
 * Route-level fallback for /submit — shown while a step's server data
 * (connection lookup, cluster grouping, KPI list) is being fetched between
 * GET-navigation steps. Reuses the exact modal chrome so there's no layout
 * shift when the real step swaps in.
 */
export default function SubmitLoading() {
  return (
    <SubmitShell>
      <div className="text-center">
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="h-1 w-9 rounded-full bg-surface-border" />
          ))}
        </div>
        <Skeleton className="mx-auto mt-3 h-3 w-20" />
        <Skeleton className="mx-auto mt-3 h-6 w-56" />
      </div>
      <div className="mt-8 space-y-2.5">
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
    </SubmitShell>
  );
}
