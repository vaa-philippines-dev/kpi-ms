"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiPeriod } from "@/generated/prisma/enums";

/**
 * Step 1's period/date picker. This is a plain GET-navigation form, not a
 * server action, so there's no free pending state from useFormStatus.
 *
 * Deliberately does NOT set `disabled` on the clicked button (directly, or
 * via Button's `loading` prop, which sets `disabled` internally): browsers
 * exclude disabled controls when constructing the submitted form data, so
 * disabling the button synchronously in response to its own submit event
 * silently drops `period=...` from the navigation — the page just reloads
 * to bare /submit with nothing submitted. The dim/opacity effect below is
 * purely visual (no `disabled`), so the click always goes through.
 */
export function PeriodForm({
  maxDate,
  extraParams,
}: {
  maxDate: string;
  /** Extra hidden fields carried through the GET navigation (e.g. a
   * connectionId already resolved by the caller, so this step's submit
   * doesn't lose it). */
  extraParams?: Record<string, string>;
}) {
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
      className="mt-6 space-y-5 text-left"
    >
      {extraParams &&
        Object.entries(extraParams).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <div className={`transition-opacity duration-150 ${isPending ? "opacity-50" : ""}`}>
        <label className="mb-1.5 block text-xs font-medium text-muted uppercase">
          Cadence
        </label>
        <div className="flex gap-3">
          <Button type="submit" name="period" value={KpiPeriod.WEEKLY} className="flex-1">
            {pendingPeriod === KpiPeriod.WEEKLY && <Loader2 className="size-4 animate-spin" />}
            Weekly
          </Button>
          <Button
            type="submit"
            name="period"
            value={KpiPeriod.MONTHLY}
            variant="outline"
            className="flex-1"
          >
            {pendingPeriod === KpiPeriod.MONTHLY && <Loader2 className="size-4 animate-spin" />}
            Monthly
          </Button>
        </div>
      </div>
      <div className={`transition-opacity duration-150 ${isPending ? "opacity-50" : ""}`}>
        <label htmlFor="date" className="mb-1.5 block text-xs font-medium text-muted uppercase">
          Which week or month? (optional)
        </label>
        <Input id="date" type="date" name="date" max={maxDate} className="w-full" />
        <p className="mt-1.5 text-xs text-muted">
          Leave this blank to submit for the current period, or pick a date
          to backfill an earlier one.
        </p>
      </div>
    </form>
  );
}
