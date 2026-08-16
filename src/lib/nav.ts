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
  Contact,
  Send,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Undefined = visible to every role. Otherwise mirrors what the page itself enforces. */
  roles?: string[];
  /**
   * Legacy showed a different label for the same page depending on role
   * (e.g. "VA Connections" vs "My Team" vs "My VA Connections" for what's
   * the same scoped Connections page here). Falls back to `label`.
   */
  labelByRole?: Record<string, string>;
  /** Extra search terms for the command palette — never rendered. */
  keywords?: string;
};

/** `item.labelByRole[role] ?? item.label` — the label this role actually sees. */
export function navItemLabel(item: NavItem, role: string): string {
  return item.labelByRole?.[role] ?? item.label;
}

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const dashboardNavGroups: NavGroup[] = [
  {
    label: "Performance",
    items: [
      {
        href: "/dashboard",
        label: "Overview",
        icon: LayoutDashboard,
        keywords: "home dashboard summary",
      },
      {
        href: "/dashboard/performance",
        label: "Performance",
        icon: TrendingUp,
        keywords: "actual target kpi status cluster",
      },
      {
        href: "/dashboard/submissions",
        label: "Submissions",
        icon: Inbox,
        keywords: "pending submitted log",
      },
      {
        href: "/submit",
        label: "Submit KPI Report",
        icon: Send,
        roles: ["VA"],
        keywords: "log data weekly monthly",
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        href: "/dashboard/reports/customer-overview",
        label: "Customer Overview",
        icon: FileText,
        keywords: "client contract status",
      },
      {
        href: "/dashboard/reports/client-detail",
        label: "Client Detail",
        icon: UserSearch,
        keywords: "drill down history trend",
      },
      {
        href: "/dashboard/reports/weekly-interventions",
        label: "Weekly Interventions",
        icon: MessageSquareWarning,
        keywords: "coaching escalation week",
      },
      {
        href: "/dashboard/reports/lifetime-value",
        label: "Lifetime Value",
        icon: Gem,
        keywords: "ltv tenure retention",
      },
      {
        href: "/dashboard/reports/va-kpi-sheet",
        label: "VA KPI Sheet",
        icon: Grid3x3,
        keywords: "grid spreadsheet matrix",
      },
    ],
  },
  {
    label: "Configuration",
    items: [
      {
        href: "/dashboard/kpi-library",
        label: "KPI Library",
        icon: BookOpen,
        keywords: "definitions targets thresholds",
      },
      {
        href: "/dashboard/connections",
        label: "Connections",
        icon: Link2,
        // Legacy showed a different label per role for this same scoped
        // page: "VA Connections" (Admin/Manager), "My Team" (Team Leader),
        // "My VA Connections" (VA). CS Specialist had no connections nav
        // item at all in legacy, so SERVICE_MANAGER keeps the plain label.
        labelByRole: {
          ADMIN: "VA Connections",
          DM: "VA Connections",
          OM: "My Team",
          VA: "My VA Connections",
        },
        keywords: "va client pairing my team",
      },
      {
        href: "/dashboard/connections/kpi-config",
        label: "KPI Config",
        icon: SlidersHorizontal,
        keywords: "override per connection target",
      },
      {
        href: "/dashboard/departments",
        label: "Departments",
        icon: Building2,
        keywords: "services",
      },
      {
        href: "/dashboard/teams",
        label: "Teams",
        icon: UsersRound,
        keywords: "roster leader",
      },
      {
        href: "/dashboard/interventions",
        label: "Interventions",
        icon: ClipboardList,
        keywords: "coaching training escalation",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/dashboard/users",
        label: "Users",
        icon: Users,
        keywords: "roles accounts access",
      },
      {
        href: "/dashboard/login-activity",
        label: "Login Activity",
        icon: History,
        roles: ["ADMIN", "DM"],
        keywords: "sign in audit last login",
      },
      {
        href: "/dashboard/settings",
        label: "System Settings",
        icon: Settings,
        roles: ["ADMIN"],
        keywords: "app name week start sync",
      },
      {
        href: "/dashboard/customers",
        label: "Customers",
        icon: Contact,
        roles: ["ADMIN"],
        keywords: "accounts directory",
      },
    ],
  },
];

/** Drops items the given role can't open anyway, and any group left empty. */
export function visibleNavGroups(role: string): NavGroup[] {
  return dashboardNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

export type NavMatch = { group: NavGroup; item: NavItem };

/**
 * Longest-prefix match, so `/dashboard/connections/kpi-config` resolves to
 * KPI Config rather than lighting up Connections as well.
 */
export function matchNavItem(pathname: string): NavMatch | null {
  let best: NavMatch | null = null;
  for (const group of dashboardNavGroups) {
    for (const item of group.items) {
      const hit =
        item.href === "/dashboard"
          ? pathname === "/dashboard"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (hit && (!best || item.href.length > best.item.href.length)) {
        best = { group, item };
      }
    }
  }
  return best;
}
