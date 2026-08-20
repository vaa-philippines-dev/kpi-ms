"use client";

import { useFormStatus } from "react-dom";

/** Dims the KPI field list while createSubmission() is in flight — must be
 * rendered inside the <form action={createSubmission}> to see its status. */
export function SubmitFade({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <div
      className={`space-y-4 transition-opacity duration-150 ${
        pending ? "pointer-events-none opacity-50" : ""
      }`}
    >
      {children}
    </div>
  );
}
