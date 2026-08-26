"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  additionalDepartmentIds: string[];
};

const ROLE_FILTER_OPTIONS = Object.values(UserRole).map((r) => ({
  value: r,
  label: roleLabel(r),
}));

const STATUS_FILTER_OPTIONS = [
  { value: "true", label: "Active" },
  { value: "false", label: "Deactivated" },
];

function columns(canManage: boolean): DataTableColumn<UserRow>[] {
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
      filterPlaceholder: "All Departments",
      className: "text-muted",
      render: (v) => (v as string | null) ?? "—",
    },
    {
      key: "serviceName",
      label: "Service",
      sortable: true,
      filterable: "select",
      filterPlaceholder: "All Services",
      className: "text-muted",
      render: (v) => (v as string | null) ?? "—",
    },
    {
      key: "teamName",
      label: "Team",
      sortable: true,
      filterable: "select",
      filterPlaceholder: "All Teams",
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
      render: (v) => (
        <Badge tone={v ? "success" : "neutral"}>{v ? "Active" : "Deactivated"}</Badge>
      ),
    },
    ...(canManage
      ? [
          {
            key: "id" as const,
            label: "",
            className: "w-6 text-right text-muted",
            render: () => <ChevronRight className="ml-auto size-4" />,
          },
        ]
      : []),
  ];
}

/**
 * Users list, rendered through the shared DataTable (search, sort,
 * per-column filters, pagination) — mirrors legacy's Users screen, which
 * was itself built on `renderDataTable()` (AppUsers.html: `renderUserPanel`).
 * Admins and DMs/Ops Managers (scoped to their own department, and never a
 * fellow DM/Ops Manager/Admin/Service Manager account — see actions.ts) can
 * click a row to edit it in a modal (email/name/role/department/service/team
 * + activate/deactivate) instead of the old inline edit-the-whole-row form.
 */
export function UsersTable({
  users,
  departments,
  services,
  teams,
  roles = Object.values(UserRole),
  canManage,
  isAdmin = false,
  viewerDepartmentId = null,
}: {
  users: UserRow[];
  departments: Option[];
  services: Option[];
  teams: Option[];
  /** Role choices offered in the edit modal — a DM only offers OM/VA (mirrors createUser's restriction). */
  roles?: UserRole[];
  canManage: boolean;
  /** Admin only: lets a VA's department field become a multi-select. */
  isAdmin?: boolean;
  /**
   * A DM/Ops Manager's own department — when set (non-admin managers only),
   * rows whose primary department isn't this one are shown but not
   * editable, even if this DM co-manages the row via an additional-
   * department tag. Mirrors updateUser()'s server-side rejection of that
   * edit, so a row that would fail to save doesn't open an editor at all.
   */
  viewerDepartmentId?: string | null;
}) {
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<UserRole | null>(null);

  const canEditRow = (u: UserRow) =>
    roles.includes(u.role) && (isAdmin || !viewerDepartmentId || u.departmentId === viewerDepartmentId);

  return (
    <>
      <DataTable
        columns={columns(canManage)}
        data={users}
        getRowId={(u) => u.id}
        defaultLimit={25}
        onRowClick={
          canManage
            ? (u) => {
                if (!canEditRow(u)) return;
                setEditing(u);
                setEditRole(u.role);
              }
            : undefined
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
              <Input
                name="email"
                type="email"
                defaultValue={editing.email}
                placeholder="Email"
                required
                className="w-full"
              />
              <Input
                name="name"
                defaultValue={editing.name ?? ""}
                placeholder="Name"
                className="w-full"
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  name="role"
                  defaultValue={editing.role}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                >
                  {(roles.includes(editing.role) ? roles : [editing.role, ...roles]).map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </Select>
                {isAdmin && editRole === UserRole.VA ? (
                  <div className="col-span-2">
                    <p className="mb-1 text-xs text-muted">Departments (a VA can belong to more than one)</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-surface-border p-2">
                      {departments.map((d) => (
                        <label key={d.id} className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            name="departmentIds"
                            value={d.id}
                            defaultChecked={
                              d.id === editing.departmentId ||
                              editing.additionalDepartmentIds.includes(d.id)
                            }
                          />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Select name="departmentId" defaultValue={editing.departmentId ?? ""}>
                    <option value="">Department —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                )}
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
