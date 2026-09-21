"use client";

type DepartmentOption = { id: string; name: string };
type TeamOption = { id: string; name: string; departmentId: string };

// Every Team belongs to exactly one Department, so a hybrid VA's extra teams
// are grouped by department here, one group per department that has at
// least one team — mirrors ServiceCheckboxGroups one level up, except a
// team (unlike a service) stays capped at one per department: "at most one
// per department" is nudged here by un-checking siblings in the same group
// on click, and enforced for real server-side in
// assertTeamsAndServicesInDepartments. Submitted under a single `teamIds`
// form field, read via formData.getAll in actions.ts.
export function TeamCheckboxGroups({
  departments,
  teams,
  defaultCheckedIds = [],
}: {
  departments: DepartmentOption[];
  teams: TeamOption[];
  defaultCheckedIds?: string[];
}) {
  const groups = departments
    .map((department) => ({
      department,
      teams: teams.filter((t) => t.departmentId === department.id),
    }))
    .filter((g) => g.teams.length > 0);

  if (groups.length === 0) return null;

  function uncheckSiblings(e: React.ChangeEvent<HTMLInputElement>, groupId: string) {
    if (!e.target.checked) return;
    const container = document.getElementById(groupId);
    container?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
      if (input !== e.target) input.checked = false;
    });
  }

  return (
    <div className="col-span-2 sm:col-span-2">
      <p className="mb-1 text-xs text-muted">Teams (at most one per department)</p>
      <div className="space-y-2 rounded-md border border-surface-border p-2">
        {groups.map(({ department, teams: deptTeams }) => {
          const groupId = `team-group-${department.id}`;
          return (
            <div key={department.id} id={groupId}>
              <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
                {department.name}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {deptTeams.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      name="teamIds"
                      value={t.id}
                      defaultChecked={defaultCheckedIds.includes(t.id)}
                      onChange={(e) => uncheckSiblings(e, groupId)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
