import { CheckCircle2 } from "lucide-react";
import { Select } from "@/components/ui/input";
import { TextAction } from "@/components/ui/button";
import { addTeamMember } from "@/app/dashboard/teams/actions";

type UnassignedVA = {
  id: string;
  name: string | null;
  email: string;
  department: { name: string } | null;
};

type TeamOption = { id: string; name: string };

/**
 * "Unassigned Virtual Assistants" card — mirrors legacy's
 * renderUnassignedVAs() (AppDashboards.html) / getUnassignedVAs()
 * (Teams.js): active VAs with no team, each with an inline
 * pick-a-team-and-assign action. Shows up to 10 at a time, same cap as
 * legacy; `totalCount` (not just this page's slice) drives the badge.
 */
export function UnassignedVasPanel({
  vas,
  totalCount,
  teams,
}: {
  vas: UnassignedVA[];
  totalCount: number;
  teams: TeamOption[];
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Unassigned Virtual Assistants</h2>
          <p className="text-xs text-muted">Active VAs not yet assigned to a team</p>
        </div>
        {totalCount > 0 && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
            {totalCount}
          </span>
        )}
      </div>

      {vas.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" />
          All VAs are assigned to a team.
        </p>
      ) : (
        <ul className="divide-y divide-surface-border">
          {vas.map((va) => (
            <li key={va.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{va.name ?? va.email}</p>
                <p className="truncate text-xs text-muted">
                  {va.department?.name ?? "—"}
                </p>
              </div>
              {teams.length === 0 ? (
                <span className="shrink-0 text-xs text-muted">No teams available</span>
              ) : (
                <form action={addTeamMember} className="flex shrink-0 items-center gap-2">
                  <input type="hidden" name="userId" value={va.id} />
                  <Select name="teamId" required defaultValue="" className="w-40 py-1">
                    <option value="" disabled>
                      Select team
                    </option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                  <TextAction type="submit">Assign</TextAction>
                </form>
              )}
            </li>
          ))}
          {totalCount > vas.length && (
            <li className="pt-2.5 text-xs text-muted">
              +{totalCount - vas.length} more not shown
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
