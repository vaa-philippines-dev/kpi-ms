"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { TextAction } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  renameDepartment,
  deleteDepartment,
  renameService,
  toggleServiceActive,
} from "@/app/dashboard/departments/actions";

export type DepartmentRow = {
  id: string;
  name: string;
  kpiCount: number;
  connectionCount: number;
};

export type ServiceRow = {
  id: string;
  name: string;
  departmentName: string;
  isActive: boolean;
};

/**
 * Department list — legacy has no dedicated DataTable-backed screen for
 * this (it's a small admin list, `AppKPI.html: renderDepartments()`), but
 * gets the same shared component for consistency with every other admin
 * table in this app. Rows are few enough that the per-row rename form
 * (rather than a modal) still makes sense here.
 */
export function DepartmentsTable({
  departments,
  isAdmin,
}: {
  departments: DepartmentRow[];
  isAdmin: boolean;
}) {
  const columns: DataTableColumn<DepartmentRow>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      filterable: true,
      render: (v, row) =>
        isAdmin ? (
          <form action={renameDepartment} className="flex gap-2">
            <input type="hidden" name="id" value={row.id} />
            <Input name="name" defaultValue={v as string} className="py-1" />
            <TextAction type="submit" className="shrink-0">
              Save
            </TextAction>
          </form>
        ) : (
          (v as string)
        ),
    },
    { key: "kpiCount", label: "KPIs", sortable: true, className: "text-muted" },
    {
      key: "connectionCount",
      label: "Connections",
      sortable: true,
      className: "text-muted",
    },
    ...(isAdmin
      ? [
          {
            key: "id" as const,
            label: "",
            render: (_v: unknown, row: DepartmentRow) => (
              <ConfirmSubmitButton
                action={deleteDepartment}
                fields={{ id: row.id }}
                label="Delete"
                successMessage={`${row.name} deleted.`}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      data={departments}
      getRowId={(d) => d.id}
      defaultLimit={25}
      emptyMessage="No departments yet."
    />
  );
}

/** Services list — same rationale as DepartmentsTable above. */
export function ServicesTable({
  services,
  isAdmin,
}: {
  services: ServiceRow[];
  isAdmin: boolean;
}) {
  const columns: DataTableColumn<ServiceRow>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      filterable: true,
      render: (v, row) =>
        isAdmin ? (
          <form action={renameService} className="flex gap-2">
            <input type="hidden" name="id" value={row.id} />
            <Input name="name" defaultValue={v as string} className="py-1" />
            <TextAction type="submit" className="shrink-0">
              Save
            </TextAction>
          </form>
        ) : (
          (v as string)
        ),
    },
    {
      key: "departmentName",
      label: "Department",
      sortable: true,
      filterable: "select",
      className: "text-muted",
    },
    {
      key: "isActive",
      label: "Status",
      sortable: true,
      filterable: "select",
      filterOptions: [
        { value: "true", label: "Active" },
        { value: "false", label: "Inactive" },
      ],
      className: "text-muted",
      searchText: (row) => (row.isActive ? "Active" : "Inactive"),
      render: (v) => (v ? "Active" : "Inactive"),
    },
    ...(isAdmin
      ? [
          {
            key: "id" as const,
            label: "",
            render: (_v: unknown, row: ServiceRow) => (
              <ConfirmSubmitButton
                action={toggleServiceActive}
                fields={{ id: row.id }}
                label={row.isActive ? "Deactivate" : "Reactivate"}
                successMessage={
                  row.isActive ? `${row.name} deactivated.` : `${row.name} reactivated.`
                }
                tone={row.isActive ? "danger" : "accent"}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      data={services}
      getRowId={(s) => s.id}
      defaultLimit={25}
      emptyMessage="No services yet."
    />
  );
}
