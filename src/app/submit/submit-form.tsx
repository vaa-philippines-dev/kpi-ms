"use client";

import { useActionState } from "react";
import { createSubmission } from "./actions";

const initialState: { error?: string } = {};

/**
 * Wraps createSubmission() with useActionState so a validation failure
 * (missing value, already submitted, outside window, rate-limited) shows
 * inline instead of crashing the page — the form stays mounted with
 * whatever the VA already typed, so nothing they entered is lost.
 */
export function SubmitForm({
  hidden,
  className,
  children,
}: {
  /** Hidden field name/value pairs, e.g. connectionId, period, cluster. */
  hidden: Record<string, string>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(createSubmission, initialState);

  return (
    <form action={formAction} className={className}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state?.error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {state.error}
        </p>
      )}
      <div
        className={`space-y-4 transition-opacity duration-150 ${
          pending ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {children}
      </div>
    </form>
  );
}
