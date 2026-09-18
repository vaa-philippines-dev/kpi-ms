"use client";

type DepartmentOption = { id: string; name: string };
type ServiceOption = { id: string; name: string; departmentId: string };

// Every Service belongs to exactly one Department, so a hybrid VA's extra
// services are grouped by department here, one group per department that
// has at least one service — mirroring the flat department-checkbox picker
// (see UserActions/UsersTable) one level down. Submitted under a single
// `serviceIds` form field (read via formData.getAll in actions.ts) so the
// server doesn't need to know the department list up front; "at most one
// per department" is nudged here by un-checking siblings in the same group
// on click, and enforced for real server-side in
// assertTeamAndServicesInDepartments.
export function ServiceCheckboxGroups({
  departments,
  services,
  defaultCheckedIds = [],
}: {
  departments: DepartmentOption[];
  services: ServiceOption[];
  defaultCheckedIds?: string[];
}) {
  const groups = departments
    .map((department) => ({
      department,
      services: services.filter((s) => s.departmentId === department.id),
    }))
    .filter((g) => g.services.length > 0);

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
      <p className="mb-1 text-xs text-muted">Services (at most one per department)</p>
      <div className="space-y-2 rounded-md border border-surface-border p-2">
        {groups.map(({ department, services: deptServices }) => {
          const groupId = `service-group-${department.id}`;
          return (
            <div key={department.id} id={groupId}>
              <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
                {department.name}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {deptServices.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      name="serviceIds"
                      value={s.id}
                      defaultChecked={defaultCheckedIds.includes(s.id)}
                      onChange={(e) => uncheckSiblings(e, groupId)}
                    />
                    {s.name}
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
