"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Select } from "@/components/ui/input";
import { removeTeamMember, transferTeamMember } from "@/app/dashboard/teams/actions";

export type TeamMemberRow = {
  id: string;
  name: string;
  role: string;
};

export type OtherTeamOption = { id: string; name: string };

/**
 * One team's member roster, rendered through the shared DataTable for
 * consistency with the rest of the admin screens — teams are small enough
 * that sort/search add little here, but it keeps every list in the app on
 * the same component rather than a one-off table.
 */
export function TeamRosterTable({
  members,
  isManager,
  otherTeams = [],
}: {
  members: TeamMemberRow[];
  isManager: boolean;
  // Other teams in the same department — lets a manager transfer a member
  // directly, atomically, and only within the department (mirrors legacy
  // transferTeamMember()'s same-department guard).
  otherTeams?: OtherTeamOption[];
}) {
  const columns: DataTableColumn<TeamMemberRow>[] = [
    { key: "name", label: "Member", sortable: true, filterable: true },
    { key: "role", label: "Role", sortable: true, className: "text-muted" },
    ...(isManager
      ? [
          {
            key: "id" as const,
            label: "",
            render: (_v: unknown, row: TeamMemberRow) => (
              <div className="flex items-center justify-end gap-2">
                {otherTeams.length > 0 && (
                  <form action={transferTeamMember} className="flex items-center gap-1">
                    <input type="hidden" name="userId" value={row.id} />
                    <Select name="toTeamId" required defaultValue="" className="py-1 text-xs">
                      <option value="" disabled>
                        Transfer to…
                      </option>
                      {otherTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="submit"
                      className="text-xs text-accent hover:underline"
                    >
                      Go
                    </button>
                  </form>
                )}
                <ConfirmSubmitButton
                  action={removeTeamMember}
                  fields={{ userId: row.id }}
                  label="Remove"
                  successMessage={`${row.name} removed from team.`}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      data={members}
      getRowId={(m) => m.id}
      defaultLimit={10}
      limitOptions={[10, 25, 50]}
      emptyMessage="No members yet."
    />
  );
}
