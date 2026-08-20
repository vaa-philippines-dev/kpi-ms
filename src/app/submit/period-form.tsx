"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiPeriod } from "@/generated/prisma/enums";

/**
 * Step 1's period/date picker. Plain GET-navigation forms don't get a
 * pending state for free from useFormStatus (it only tracks form `action`
 * functions, not native navigation) — this tracks which button was clicked
 * locally so the click gets an immediate spinner instead of the page just
 * sitting there until the next render arrives.
 *
 * The pending state is set from onSubmit (via the submitter), not onClick —
 * setting it from onClick would synchronously disable the very button that
 * was just clicked before the browser finishes the click's default action
 * (triggering the submit), silently cancelling the navigation.
 */
export function PeriodForm({ maxDate }: { maxDate: string }) {
  const [pendingPeriod, setPendingPeriod] = useState<KpiPeriod | null>(null);
  const isPending = pendingPeriod !== null;

  return (
    <form
      method="GET"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name === "period") {
          setPendingPeriod(submitter.value as KpiPeriod);
        }
      }}
      className={`mt-6 space-y-5 text-left transition-opacity duration-150 ${
        isPending ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted uppercase">
          Cadence
        </label>
        <div className="flex gap-3">
          <Button
            type="submit"
            name="period"
            value={KpiPeriod.WEEKLY}
            className="flex-1"
            loading={pendingPeriod === KpiPeriod.WEEKLY}
            disabled={isPending}
          >
            Weekly
          </Button>
          <Button
            type="submit"
            name="period"
            value={KpiPeriod.MONTHLY}
            variant="outline"
            className="flex-1"
            loading={pendingPeriod === KpiPeriod.MONTHLY}
            disabled={isPending}
          >
            Monthly
          </Button>
        </div>
      </div>
      <div>
        <label htmlFor="date" className="mb-1.5 block text-xs font-medium text-muted uppercase">
          Which week or month? (optional)
        </label>
        <Input id="date" type="date" name="date" max={maxDate} disabled={isPending} className="w-full" />
        <p className="mt-1.5 text-xs text-muted">
          Leave this blank to submit for the current period, or pick a date
          to backfill an earlier one.
        </p>
      </div>
    </form>
  );
}
