"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiPeriod } from "@/generated/prisma/enums";

/** Step 2's connection-code entry — see PeriodForm for why this needs its
 * own local pending state rather than useFormStatus. */
export function CodeForm({ period, dateParam }: { period: KpiPeriod; dateParam?: string }) {
  const [pending, setPending] = useState(false);

  return (
    <form
      method="GET"
      onSubmit={() => setPending(true)}
      className={`mt-6 flex flex-col gap-3 transition-opacity duration-150 ${
        pending ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <input type="hidden" name="period" value={period} />
      {dateParam && <input type="hidden" name="date" value={dateParam} />}
      <Input
        name="code"
        required
        autoFocus
        disabled={pending}
        placeholder="e.g. A3B9K2 or CON_A3B9K2"
        className="w-full text-center font-mono text-base tracking-wider uppercase"
      />
      <p className="text-xs text-muted">
        Just the ID number or the full CON_ID — either works.
      </p>
      <Button type="submit" loading={pending} disabled={pending}>
        Continue
      </Button>
    </form>
  );
}
