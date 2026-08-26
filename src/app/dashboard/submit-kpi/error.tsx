"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

/**
 * Safety net for a genuinely unexpected crash while submitting (e.g. a DB
 * outage) — expected, user-actionable failures (missing value, already
 * submitted, rate-limited) never reach here, since createSubmission()
 * returns those as state for SubmitForm to show inline instead of throwing.
 */
export default function SubmitKpiError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="Submit KPI" />
      <Card className="mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-danger" />
        <h2 className="mt-4 text-lg font-semibold tracking-tight">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-muted">
          Your submission wasn&apos;t saved. Please try again — if it keeps
          happening, contact your Team Leader or Manager.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
        >
          Try again
        </button>
      </Card>
    </>
  );
}
