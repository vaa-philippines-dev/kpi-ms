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
 * Cadence is a non-submitting toggle rather than the submitter itself —
 * previously Weekly/Monthly were `type="submit"` buttons in this same form,
 * so clicking "Monthly" navigated immediately, before a VA backfilling a
 * past month ever saw the date field below it. That silently submitted an
 * empty date, which defaults to the current period instead of the one they
 * meant to submit for. A single "Continue" submitter forces the date field
 * into view first.
 *
 * Deliberately does NOT set `disabled` on Continue (directly, or via
 * Button's `loading` prop, which sets `disabled` internally): browsers
 * exclude disabled controls when constructing the submitted form data, so
 * disabling it synchronously in response to its own submit event can
 * silently drop the navigation. The dim/opacity effect below is purely
 * visual (no `disabled`), so the click always goes through.
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
  const [period, setPeriod] = useState<KpiPeriod>(KpiPeriod.MONTHLY);
  const [pending, setPending] = useState(false);

  return (
    <form
      method="GET"
      onSubmit={() => setPending(true)}
      className={`mt-6 space-y-5 text-left transition-opacity duration-150 ${pending ? "opacity-50" : ""}`}
    >
      {extraParams &&
        Object.entries(extraParams).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <input type="hidden" name="period" value={period} />
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted uppercase">
          Cadence
        </label>
        <div className="flex gap-3">
          <Button
            type="button"
            variant={period === KpiPeriod.WEEKLY ? "solid" : "outline"}
            onClick={() => setPeriod(KpiPeriod.WEEKLY)}
            className="flex-1"
          >
            Weekly
          </Button>
          <Button
            type="button"
            variant={period === KpiPeriod.MONTHLY ? "solid" : "outline"}
            onClick={() => setPeriod(KpiPeriod.MONTHLY)}
            className="flex-1"
          >
            Monthly
          </Button>
        </div>
      </div>
      <div>
        <label htmlFor="date" className="mb-1.5 block text-xs font-medium text-muted uppercase">
          Which week or month? (optional)
        </label>
        <Input id="date" type="date" name="date" max={maxDate} className="w-full" />
        <p className="mt-1.5 text-xs text-muted">
          Leave this blank to submit for the current period, or pick a date
          to backfill an earlier one.
        </p>
      </div>
      <Button type="submit" className="flex w-full items-center justify-center gap-2">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Continue
      </Button>
    </form>
  );
}
