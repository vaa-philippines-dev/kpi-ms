"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiPeriod } from "@/generated/prisma/enums";

/**
 * Step 2's connection-code entry — a plain GET-navigation form, not a
 * server action, so useFormStatus won't report pending here.
 *
 * Deliberately does NOT set `disabled` on the code input or submit button
 * (directly, or via Button's `loading` prop, which sets `disabled`
 * internally) — see PeriodForm for why: browsers drop disabled controls'
 * values when constructing the submitted form data, so disabling the code
 * field in response to its own submit event would silently submit without
 * `code=...` at all. The dim/opacity effect is purely visual.
 */
export function CodeForm({ period, dateParam }: { period: KpiPeriod; dateParam?: string }) {
  const [pending, setPending] = useState(false);

  return (
    <form
      method="GET"
      onSubmit={() => setPending(true)}
      className={`mt-6 flex flex-col gap-3 transition-opacity duration-150 ${
        pending ? "opacity-50" : ""
      }`}
    >
      <input type="hidden" name="period" value={period} />
      {dateParam && <input type="hidden" name="date" value={dateParam} />}
      <Input
        name="code"
        required
        autoFocus
        placeholder="e.g. A3B9K2 or CON_A3B9K2"
        className="w-full text-center font-mono text-base tracking-wider uppercase"
      />
      <p className="text-xs text-muted">
        Just the ID number or the full CON_ID — either works.
      </p>
      <Button type="submit" className="flex items-center justify-center gap-2">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Continue
      </Button>
    </form>
  );
}
