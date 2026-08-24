"use client";

import { useTransition } from "react";
import { Eye, Loader2, X } from "lucide-react";
import { setViewAsRole, exitViewAs } from "@/app/dashboard/view-as-actions";
import { useToast } from "@/components/ui/toast";

export type ViewingAs = {
  role: string;
  departmentName?: string | null;
  teamName?: string | null;
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "DM", label: "Manager" },
  { value: "OM", label: "Team Leader" },
  { value: "SERVICE_MANAGER", label: "CS Specialist" },
  { value: "VA", label: "Virtual Assistant" },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  DM: "Manager",
  OM: "Team Leader",
  SERVICE_MANAGER: "CS Specialist",
  VA: "Virtual Assistant",
};

/**
 * Admin-only "view as" picker — lets an admin preview the dashboard exactly
 * as a given role would see it (server-scoped via lib/view-as.ts, borrowing
 * one real active user of that role under the hood), without changing
 * their own account or losing real admin privileges.
 */
export function ViewAsControl({ viewingAs }: { viewingAs: ViewingAs | null }) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  if (viewingAs) {
    const context = viewingAs.teamName ?? viewingAs.departmentName;
    return (
      <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs">
        <Eye className="size-3.5 shrink-0 text-accent" />
        <span className="whitespace-nowrap">
          Viewing as <strong>{ROLE_LABELS[viewingAs.role] ?? viewingAs.role}</strong>
          {context && <span className="text-muted"> · {context}</span>}
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                await exitViewAs();
              } catch (err) {
                toast(err instanceof Error ? err.message : "Something went wrong.", "error");
              }
            })
          }
          title="Exit view-as"
          className="text-muted transition hover:text-foreground disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <X className="size-3.5" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        defaultValue=""
        disabled={isPending}
        onChange={(e) => {
          const role = e.target.value;
          if (!role) return;
          const formData = new FormData();
          formData.set("role", role);
          startTransition(async () => {
            try {
              await setViewAsRole(formData);
            } catch (err) {
              toast(err instanceof Error ? err.message : "Something went wrong.", "error");
            }
          });
        }}
        title="Preview the dashboard as another role"
        className={`rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-xs outline-none transition focus:border-accent ${
          isPending ? "opacity-60" : ""
        }`}
      >
        <option value="">View as…</option>
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {isPending && (
        <Loader2 className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 animate-spin text-accent" />
      )}
    </div>
  );
}
