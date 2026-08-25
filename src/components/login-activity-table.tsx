"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { roleLabel } from "@/lib/roles";

export type LoginActivityRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  departmentName: string | null;
  loginCount: number;
  lastLoginMs: number;
  lastLoginIso: string | null;
  isActive: boolean;
};

const ROLE_FILTER_OPTIONS = ["ADMIN", "DM", "OPS_MANAGER", "OM", "SERVICE_MANAGER", "VA"].map((r) => ({
  value: r,
  label: roleLabel(r),
}));

const STATUS_FILTER_OPTIONS = [
  { value: "true", label: "Active" },
  { value: "false", label: "Deactivated" },
];

const COLUMNS: DataTableColumn<LoginActivityRow>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    filterable: true,
    render: (v, row) => (
      <>
        <span className="font-medium text-foreground">{(v as string | null) ?? row.email}</span>
        <div className="text-xs text-muted">{row.email}</div>
      </>
    ),
  },
  {
    key: "role",
    label: "Role",
    sortable: true,
    filterable: "select",
    filterOptions: ROLE_FILTER_OPTIONS,
    className: "text-muted",
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
    key: "loginCount",
    label: "Login Count",
    sortable: true,
    className: "text-muted",
  },
  {
    key: "lastLoginMs",
    label: "Last Login",
    sortable: true,
    className: "text-muted",
    // Sorting/filtering on the epoch-ms field (not the ISO string) so
    // DataTable's numeric-aware comparator orders chronologically instead
    // of by year-prefix substring — the ISO string is only used for display.
    render: (_v, row) =>
      row.lastLoginIso ? new Date(row.lastLoginIso).toLocaleString() : "Never",
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

/**
 * Login Activity report, rendered through the shared DataTable — mirrors
 * legacy's renderLoginActivity() (AppUsers.html), which was itself built
 * on renderDataTable() with the same default sort (Last Login, descending).
 */
export function LoginActivityTable({ rows }: { rows: LoginActivityRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      getRowId={(r) => r.id}
      defaultLimit={25}
      defaultSort={{ key: "lastLoginMs", dir: "desc" }}
      emptyMessage="No users found."
    />
  );
}
