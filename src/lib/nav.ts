export type NavItem = {
  href: string;
  label: string;
};

export const dashboardNav: NavItem[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/performance", label: "Performance" },
  { href: "/dashboard/submissions", label: "Submissions" },
  { href: "/dashboard/kpi-library", label: "KPI Library" },
  { href: "/dashboard/connections", label: "Connections" },
  { href: "/dashboard/departments", label: "Departments" },
  { href: "/dashboard/users", label: "Users" },
  { href: "/dashboard/settings", label: "System Settings" },
];
