"use client";

import { useTransition } from "react";
import { Eye, Loader2, X } from "lucide-react";
import { setViewAsRole, exitViewAs } from "@/app/dashboard/view-as-actions";
import { useToast } from "@/components/ui/toast";

export type ViewingAs = {
  role: string;
  departmentId?: string | null;
  departmentName?: string | null;
  teamId?: string | null;
  teamName?: string | null;
};

export type ViewAsDepartment = { id: string; name: string };
export type ViewAsTeam = { id: string; name: string; departmentId: string; departmentName: string };

// The only roles actually scoped by team (see connection-scope.ts) — every
// other role is department-wide or unscoped, so a team picker would just be
// noise for them.
const TEAM_SCOPED_ROLES = new Set(["OM", "VA"]);

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "EXECUTIVE", label: "Executive" },
  { value: "DM", label: "Manager" },
  { value: "OPS_MANAGER", label: "Ops Manager" },
  { value: "OM", label: "Team Leader" },
  { value: "SERVICE_MANAGER", label: "CS Specialist" },
  { value: "VA", label: "Virtual Assistant" },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  EXECUTIVE: "Executive",
  DM: "Manager",
  OPS_MANAGER: "Ops Manager",
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
export function ViewAsControl({
  viewingAs,
  departments,
  teams,
}: {
  viewingAs: ViewingAs | null;
  departments: ViewAsDepartment[];
  teams: ViewAsTeam[];
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function changeDepartment(departmentId: string) {
    if (!viewingAs) return;
    const formData = new FormData();
    formData.set("role", viewingAs.role);
    if (departmentId) formData.set("departmentId", departmentId);
    startTransition(async () => {
      try {
        await setViewAsRole(formData);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Something went wrong.", "error");
      }
    });
  }

  function changeTeam(teamId: string) {
    if (!viewingAs) return;
    const formData = new FormData();
    formData.set("role", viewingAs.role);
    if (teamId) formData.set("teamId", teamId);
    startTransition(async () => {
      try {
        await setViewAsRole(formData);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Something went wrong.", "error");
      }
    });
  }

  if (viewingAs) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs">
        <Eye className="size-3.5 shrink-0 text-accent" />
        <span className="whitespace-nowrap">
          Viewing as <strong>{ROLE_LABELS[viewingAs.role] ?? viewingAs.role}</strong>
        </span>
        {departments.length > 0 && (
          <select
            value={viewingAs.departmentId ?? ""}
            disabled={isPending}
            onChange={(e) => changeDepartment(e.target.value)}
            title="Narrow the preview to a specific department"
            className="rounded border-none bg-transparent py-0 pr-5 text-xs text-accent outline-none disabled:opacity-50"
          >
            <option value="">Any department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {TEAM_SCOPED_ROLES.has(viewingAs.role) &&
          (() => {
            const teamOptions = viewingAs.departmentId
              ? teams.filter((t) => t.departmentId === viewingAs.departmentId)
              : teams;
            if (teamOptions.length === 0) return null;
            return (
              <select
                value={viewingAs.teamId ?? ""}
                disabled={isPending}
                onChange={(e) => changeTeam(e.target.value)}
                title="Narrow the preview to a specific team"
                className="rounded border-none bg-transparent py-0 pr-5 text-xs text-accent outline-none disabled:opacity-50"
              >
                <option value="">Any team</option>
                {teamOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {viewingAs.departmentId ? t.name : `${t.name} — ${t.departmentName}`}
                  </option>
                ))}
              </select>
            );
          })()}
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
