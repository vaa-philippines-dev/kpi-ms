import {
  LayoutDashboard,
  TrendingUp,
  Inbox,
  BookOpen,
  Link2,
  Building2,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const dashboardNavGroups: NavGroup[] = [
  {
    label: "Performance",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/performance", label: "Performance", icon: TrendingUp },
      { href: "/dashboard/submissions", label: "Submissions", icon: Inbox },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/dashboard/kpi-library", label: "KPI Library", icon: BookOpen },
      { href: "/dashboard/connections", label: "Connections", icon: Link2 },
      { href: "/dashboard/departments", label: "Departments", icon: Building2 },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/dashboard/users", label: "Users", icon: Users },
      { href: "/dashboard/settings", label: "System Settings", icon: Settings },
    ],
  },
];
