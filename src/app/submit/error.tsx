"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { NewTicketModal } from "@/components/new-ticket-modal";
import { TicketCategory } from "@/generated/prisma/enums";
import { SubmitShell } from "./submit-shell";

/**
 * Safety net for a genuinely unexpected crash while submitting (e.g. a DB
 * outage) — expected, user-actionable failures (missing value, already
 * submitted, rate-limited) never reach here, since createSubmission()
 * returns those as state for SubmitForm to show inline instead of throwing.
 */
export default function SubmitError({
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
    <SubmitShell>
      <div className="text-center">
        <AlertTriangle className="mx-auto size-10 text-danger" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted">
          Your submission wasn&apos;t saved. Please try again — if it keeps
          happening, contact your Team Leader or Manager, or{" "}
          <NewTicketModal
            defaultSubject="Submission error"
            defaultCategory={TicketCategory.BUG}
            defaultBody={`What were you trying to submit when this happened?\n\n(Error reference: ${
              error.digest ?? "none"
            })`}
            renderTrigger={(open) => (
              <button type="button" onClick={open} className="text-accent hover:underline">
                submit a ticket
              </button>
            )}
          />
          .
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </SubmitShell>
  );
}
