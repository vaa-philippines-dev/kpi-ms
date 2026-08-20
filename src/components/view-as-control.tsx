"use client";

import { useTransition } from "react";
import { Eye, X } from "lucide-react";
import { setViewAs, exitViewAs } from "@/app/dashboard/view-as-actions";

export type ViewAsUserOption = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  DM: "Manager",
  OM: "Team Leader",
  SERVICE_MANAGER: "CS Specialist",
  VA: "Virtual Assistant",
};

/**
 * Admin-only "view as" picker — lets an admin preview the dashboard exactly
 * as any other real user would see it (server-scoped via lib/view-as.ts),
 * without changing their own account or losing real admin privileges.
 */
export function ViewAsControl({
  users,
  viewingAs,
}: {
  users: ViewAsUserOption[];
  viewingAs: ViewAsUserOption | null;
}) {
  const [isPending, startTransition] = useTransition();

  if (viewingAs) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs">
        <Eye className="size-3.5 shrink-0 text-accent" />
        <span className="whitespace-nowrap">
          Viewing as <strong>{viewingAs.name ?? viewingAs.email}</strong>{" "}
          <span className="text-muted">
            ({ROLE_LABELS[viewingAs.role] ?? viewingAs.role})
          </span>
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => exitViewAs())}
          title="Exit view-as"
          className="text-muted transition hover:text-foreground disabled:opacity-50"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  const grouped = users.reduce<Record<string, ViewAsUserOption[]>>((acc, u) => {
    (acc[u.role] ??= []).push(u);
    return acc;
  }, {});

  return (
    <select
      defaultValue=""
      disabled={isPending || users.length === 0}
      onChange={(e) => {
        const userId = e.target.value;
        if (!userId) return;
        const formData = new FormData();
        formData.set("userId", userId);
        startTransition(() => setViewAs(formData));
      }}
      title="Preview the dashboard as another user"
      className="rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-xs outline-none transition focus:border-accent"
    >
      <option value="">View as…</option>
      {Object.entries(grouped).map(([role, list]) => (
        <optgroup key={role} label={ROLE_LABELS[role] ?? role}>
          {list.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
