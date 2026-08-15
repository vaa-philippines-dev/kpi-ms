import {
  LayoutDashboard,
  TrendingUp,
  Inbox,
  BookOpen,
  Link2,
  Building2,
  Users,
  UsersRound,
  ClipboardList,
  Settings,
  History,
  FileText,
  UserSearch,
  MessageSquareWarning,
  SlidersHorizontal,
  Gem,
  Grid3x3,
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
    label: "Reports",
    items: [
      {
        href: "/dashboard/reports/customer-overview",
        label: "Customer Overview",
        icon: FileText,
      },
      {
        href: "/dashboard/reports/client-detail",
        label: "Client Detail",
        icon: UserSearch,
      },
      {
        href: "/dashboard/reports/weekly-interventions",
        label: "Weekly Interventions",
        icon: MessageSquareWarning,
      },
      {
        href: "/dashboard/reports/lifetime-value",
        label: "Lifetime Value",
        icon: Gem,
      },
      {
        href: "/dashboard/reports/va-kpi-sheet",
        label: "VA KPI Sheet",
        icon: Grid3x3,
      },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/dashboard/kpi-library", label: "KPI Library", icon: BookOpen },
      { href: "/dashboard/connections", label: "Connections", icon: Link2 },
      {
        href: "/dashboard/connections/kpi-config",
        label: "KPI Config",
        icon: SlidersHorizontal,
      },
      { href: "/dashboard/departments", label: "Departments", icon: Building2 },
      { href: "/dashboard/teams", label: "Teams", icon: UsersRound },
      { href: "/dashboard/interventions", label: "Interventions", icon: ClipboardList },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/dashboard/users", label: "Users", icon: Users },
      { href: "/dashboard/login-activity", label: "Login Activity", icon: History },
      { href: "/dashboard/settings", label: "System Settings", icon: Settings },
    ],
  },
];
