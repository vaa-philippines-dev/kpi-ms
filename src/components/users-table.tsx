"use client";

import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { UserRole } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";
import { updateUser, toggleUserActive } from "@/app/dashboard/users/actions";

type Option = { id: string; name: string };

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  departmentName: string | null;
  serviceName: string | null;
  teamName: string | null;
  departmentId: string | null;
  serviceId: string | null;
  teamId: string | null;
};

const ROLE_FILTER_OPTIONS = Object.values(UserRole).map((r) => ({
  value: r,
  label: roleLabel(r),
}));

const STATUS_FILTER_OPTIONS = [
  { value: "true", label: "Active" },
  { value: "false", label: "Deactivated" },
];

function columns(): DataTableColumn<UserRow>[] {
  return [
    { key: "email", label: "Email", sortable: true, filterable: true },
    {
      key: "name",
      label: "Name",
      sortable: true,
      filterable: true,
      render: (v) => (v as string | null) ?? "—",
    },
    {
      key: "role",
      label: "Role",
      sortable: true,
      filterable: "select",
      filterOptions: ROLE_FILTER_OPTIONS,
      searchText: (row) => roleLabel(row.role),
      render: (v) => roleLabel(v as string),
    },
    {
      key: "departmentName",
      label: "Department",
      sortable: true,
      filterable: "select",
      className: "text-muted",
      render: (v) => (v as string | null) ?? "—",
    },
    {
      key: "serviceName",
      label: "Service",
      sortable: true,
      className: "text-muted",
      render: (v) => (v as string | null) ?? "—",
    },
    {
      key: "teamName",
      label: "Team",
      sortable: true,
      className: "text-muted",
      render: (v) => (v as string | null) ?? "—",
    },
    {
      key: "isActive",
      label: "Status",
      sortable: true,
      filterable: "select",
      filterOptions: STATUS_FILTER_OPTIONS,
      searchText: (row) => (row.isActive ? "Active" : "Deactivated"),
      render: (v) => (v ? "Active" : "Deactivated"),
    },
  ];
}

/**
 * Users list, rendered through the shared DataTable (search, sort,
 * per-column filters, pagination) — mirrors legacy's Users screen, which
 * was itself built on `renderDataTable()` (AppUsers.html: `renderUserPanel`).
 * Admins and DMs (scoped to their own department — see actions.ts) can
 * click a row to edit it in a modal (name/role/department/service/team +
 * activate/deactivate) instead of the old inline edit-the-whole-row form.
 */
export function UsersTable({
  users,
  departments,
  services,
  teams,
  roles = Object.values(UserRole),
  canManage,
}: {
  users: UserRow[];
  departments: Option[];
  services: Option[];
  teams: Option[];
  /** Role choices offered in the edit modal — a DM only offers OM/VA (mirrors createUser's restriction). */
  roles?: UserRole[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<UserRow | null>(null);

  return (
    <>
      <DataTable
        columns={columns()}
        data={users}
        getRowId={(u) => u.id}
        defaultLimit={25}
        onRowClick={
          canManage ? (u) => (roles.includes(u.role) ? setEditing(u) : undefined) : undefined
        }
        emptyMessage="No users found."
      />

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit user">
        {editing && (
          <div className="space-y-4">
            <form
              action={updateUser}
              onSubmit={() => setEditing(null)}
              className="space-y-3"
            >
              <input type="hidden" name="id" value={editing.id} />
              <p className="text-xs text-muted">{editing.email}</p>
              <Input
                name="name"
                defaultValue={editing.name ?? ""}
                placeholder="Name"
                className="w-full"
              />
              <div className="grid grid-cols-2 gap-3">
                <Select name="role" defaultValue={editing.role}>
                  {(roles.includes(editing.role) ? roles : [editing.role, ...roles]).map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </Select>
                <Select name="departmentId" defaultValue={editing.departmentId ?? ""}>
                  <option value="">Department —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
                <Select name="serviceId" defaultValue={editing.serviceId ?? ""}>
                  <option value="">Service —</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <Select name="teamId" defaultValue={editing.teamId ?? ""}>
                  <option value="">Team —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" className="w-full">
                Save
              </Button>
            </form>

            <ConfirmSubmitButton
              action={toggleUserActive}
              fields={{ id: editing.id }}
              label={editing.isActive ? "Deactivate user" : "Reactivate user"}
              successMessage={editing.isActive ? "User deactivated." : "User reactivated."}
              tone={editing.isActive ? "danger" : "accent"}
              onSuccess={() => setEditing(null)}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
