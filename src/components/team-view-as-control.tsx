"use client";

import { useTransition } from "react";
import { Eye, Loader2, X } from "lucide-react";
import { setTeamViewAsUser, exitViewAs } from "@/app/dashboard/view-as-actions";
import { useToast } from "@/components/ui/toast";

export type TeamViewAsMember = { id: string; name: string; teamName: string | null };

/**
 * Team Leader "view as" picker — the team-scoped counterpart to the admin
 * ViewAsControl. Lists only the VAs on teams this team leader leads in their
 * own department, and previews the dashboard as that VA would see it, minus
 * anything from a hybrid VA's other departments (see lib/view-as.ts).
 */
export function TeamViewAsControl({
  members,
  viewingUserId,
}: {
  members: TeamViewAsMember[];
  /** The VA currently being previewed, or null when not viewing as anyone. */
  viewingUserId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Something went wrong.", "error");
      }
    });
  }

  function viewAs(userId: string) {
    if (!userId) return;
    const formData = new FormData();
    formData.set("userId", userId);
    run(() => setTeamViewAsUser(formData));
  }

  // Several teams led at once — show which team each VA is on.
  const showTeam = new Set(members.map((m) => m.teamName)).size > 1;
  const options = members.map((m) => (
    <option key={m.id} value={m.id}>
      {showTeam && m.teamName ? `${m.name} — ${m.teamName}` : m.name}
    </option>
  ));

  if (viewingUserId) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs">
        <Eye className="size-3.5 shrink-0 text-accent" />
        <span className="whitespace-nowrap">Viewing as</span>
        <select
          value={viewingUserId}
          disabled={isPending}
          onChange={(e) => viewAs(e.target.value)}
          title="Preview as a different team member"
          className="max-w-48 rounded border-none bg-transparent py-0 pr-5 text-xs font-medium text-accent outline-none disabled:opacity-50"
        >
          {options}
        </select>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(exitViewAs)}
          title="Exit view-as"
          className="text-muted transition hover:text-foreground disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
        </button>
      </div>
    );
  }

  if (members.length === 0) return null;

  return (
    <div className="relative">
      <select
        defaultValue=""
        disabled={isPending}
        onChange={(e) => viewAs(e.target.value)}
        title="Preview the dashboard as one of your team members"
        className={`max-w-56 rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-xs outline-none transition focus:border-accent ${
          isPending ? "opacity-60" : ""
        }`}
      >
        <option value="">View as…</option>
        {options}
      </select>
      {isPending && (
        <Loader2 className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 animate-spin text-accent" />
      )}
    </div>
  );
}
