"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { removeTeamMember } from "@/app/dashboard/teams/actions";

export type TeamMemberRow = {
  id: string;
  name: string;
  role: string;
};

/**
 * One team's member roster, rendered through the shared DataTable for
 * consistency with the rest of the admin screens — teams are small enough
 * that sort/search add little here, but it keeps every list in the app on
 * the same component rather than a one-off table.
 */
export function TeamRosterTable({
  members,
  isManager,
}: {
  members: TeamMemberRow[];
  isManager: boolean;
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
              <ConfirmSubmitButton
                action={removeTeamMember}
                fields={{ userId: row.id }}
                label="Remove"
                successMessage={`${row.name} removed from team.`}
              />
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
