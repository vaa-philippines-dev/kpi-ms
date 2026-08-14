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

export const dashboardNav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/performance", label: "Performance", icon: TrendingUp },
  { href: "/dashboard/submissions", label: "Submissions", icon: Inbox },
  { href: "/dashboard/kpi-library", label: "KPI Library", icon: BookOpen },
  { href: "/dashboard/connections", label: "Connections", icon: Link2 },
  { href: "/dashboard/departments", label: "Departments", icon: Building2 },
  { href: "/dashboard/users", label: "Users", icon: Users },
  { href: "/dashboard/settings", label: "System Settings", icon: Settings },
];
