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
  Target,
  Activity,
  LifeBuoy,
  MessageCircle,
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

// Single source of truth per page, shared across every role's nav below so
// icon/keywords/labelByRole never drift between role variants.
const dashboardItem: NavItem = {
  href: "/dashboard",
  label: "Dashboard",
  icon: LayoutDashboard,
  keywords: "home dashboard summary overview",
};
const vaConnectionsItem: NavItem = {
  href: "/dashboard/connections",
  label: "VA Connections",
  icon: Link2,
  // Legacy showed a different label per role for this same scoped page:
  // "VA Connections" (Admin/Manager), "My Team" (Team Leader), "My VA
  // Connections" (VA — renamed to "My Connections" per user feedback, less
  // redundant since the VA already knows these are their own). CS Specialist
  // had no connections nav item at all in legacy, so it never appears in
  // that role's groups below.
  labelByRole: {
    OM: "My Team",
    VA: "My Connections",
  },
  keywords: "va client pairing my team my connections",
};
const myKpiItem: NavItem = {
  href: "/dashboard/kpi",
  label: "KPI",
  icon: Target,
  keywords: "my kpis targets actual status ongoing current",
};
const historyItem: NavItem = {
  href: "/dashboard/history",
  label: "History",
  icon: History,
  keywords: "trend past weeks months over time streak",
};
const kpiConfigItem: NavItem = {
  href: "/dashboard/connections/kpi-config",
  label: "KPI Configuration",
  icon: SlidersHorizontal,
  keywords: "override per connection target",
};
const submissionsItem: NavItem = {
  href: "/dashboard/submissions",
  label: "Submissions",
  icon: Inbox,
  keywords: "pending submitted log",
};
const performanceItem: NavItem = {
  href: "/dashboard/performance",
  label: "Performance",
  icon: TrendingUp,
  keywords: "actual target kpi status cluster",
};
const vaKpiSheetItem: NavItem = {
  href: "/dashboard/reports/va-kpi-sheet",
  label: "VA KPI Sheet",
  icon: Grid3x3,
  keywords: "grid spreadsheet matrix",
};
const lifetimeValueItem: NavItem = {
  href: "/dashboard/reports/lifetime-value",
  label: "Lifetime Value",
  icon: Gem,
  keywords: "ltv tenure retention",
};
const customerOverviewItem: NavItem = {
  href: "/dashboard/reports/customer-overview",
  label: "Customer Overview",
  icon: FileText,
  keywords: "client contract status",
};
const clientDetailItem: NavItem = {
  href: "/dashboard/reports/client-detail",
  label: "Client Detail",
  icon: UserSearch,
  keywords: "drill down history trend",
};
const weeklyInterventionsItem: NavItem = {
  href: "/dashboard/reports/weekly-interventions",
  label: "Weekly Interventions",
  icon: MessageSquareWarning,
  keywords: "coaching escalation week",
};
const usersItem: NavItem = {
  href: "/dashboard/users",
  label: "Users",
  icon: Users,
  keywords: "roles accounts access",
};
const loginActivityItem: NavItem = {
  href: "/dashboard/login-activity",
  label: "Login Activity",
  icon: History,
  roles: ["ADMIN", "EXECUTIVE", "DM", "OPS_MANAGER"],
  keywords: "sign in audit last login",
};
const activityLogItem: NavItem = {
  href: "/dashboard/activity",
  label: "Activity Log",
  icon: Activity,
  roles: ["ADMIN", "EXECUTIVE"],
  keywords: "audit trail changes edits deletions kpi submissions dm om team leader",
};
const teamManagementItem: NavItem = {
  href: "/dashboard/teams",
  label: "Team Management",
  icon: UsersRound,
  keywords: "roster leader teams",
};
const departmentsItem: NavItem = {
  href: "/dashboard/departments",
  label: "Departments",
  icon: Building2,
  keywords: "services",
};
const kpiLibraryItem: NavItem = {
  href: "/dashboard/kpi-library",
  label: "KPI Library",
  icon: BookOpen,
  keywords: "definitions targets thresholds",
};
const customersItem: NavItem = {
  href: "/dashboard/customers",
  label: "Customers",
  icon: Contact,
  roles: ["ADMIN", "EXECUTIVE"],
  keywords: "accounts directory",
};
const systemSettingsItem: NavItem = {
  href: "/dashboard/settings",
  label: "System Settings",
  icon: Settings,
  roles: ["ADMIN", "EXECUTIVE"],
  keywords: "app name week start sync",
};
const devInboxItem: NavItem = {
  href: "/dashboard/dev/inbox",
  label: "Inbox",
  icon: LifeBuoy,
  keywords: "tickets support triage concerns questions",
};
const devTicketsItem: NavItem = {
  href: "/dashboard/dev/tickets",
  label: "Tickets",
  icon: MessageCircle,
  keywords: "support concerns questions chat dev help",
};
const interventionsItem: NavItem = {
  href: "/dashboard/interventions",
  label: "Interventions",
  icon: ClipboardList,
  // Already scoped correctly for a VA by connectionScopeWhere (their own
  // connections only) and already read-only when isManager is false — see
  // InterventionsTable — so surfacing it to VAs needed no new page, just
  // this nav entry and a role-aware label/description on the page itself.
  labelByRole: {
    VA: "My Interventions",
  },
  keywords: "coaching training escalation my interventions",
};

// Group names, order, and item placement per role mirror the legacy sidebar
// (legacy-appscript/AppCore.html getNavItems) exactly. Role mapping: ADMIN
// = legacy Admin, DM = legacy Manager, OM = legacy Team Leader,
// SERVICE_MANAGER = legacy CS Specialist, VA = legacy VA. A few pages that
// don't exist in legacy (Client Detail, Weekly Interventions, Interventions)
// are slotted into whichever legacy-equivalent group they read closest to.

const adminGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [dashboardItem, vaConnectionsItem, kpiConfigItem, customerOverviewItem, clientDetailItem],
  },
  {
    label: "Reports",
    items: [submissionsItem, performanceItem, vaKpiSheetItem, lifetimeValueItem, weeklyInterventionsItem],
  },
  {
    label: "Administration",
    items: [
      usersItem,
      loginActivityItem,
      activityLogItem,
      teamManagementItem,
      departmentsItem,
      kpiLibraryItem,
      customersItem,
      systemSettingsItem,
      interventionsItem,
    ],
  },
  {
    label: "Dev",
    items: [devInboxItem],
  },
];

// EXECUTIVE — read-only admin: same Overview/Reports/Administration groups
// as ADMIN (full visibility, nothing to manage), but the Dev group points at
// the regular Tickets page instead of the Inbox triage shell. Inbox is
// deliberately excluded — sendTicketMessage() lets anyone who can see a
// ticket reply to it (no separate role check beyond the closed-ticket admin
// lock), so giving Executive Inbox's unscoped ticketScopeWhere visibility
// would incidentally let them message into every ticket company-wide, which
// is a real write capability, not a view.
const executiveGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [dashboardItem, vaConnectionsItem, kpiConfigItem, customerOverviewItem, clientDetailItem],
  },
  {
    label: "Reports",
    items: [submissionsItem, performanceItem, vaKpiSheetItem, lifetimeValueItem, weeklyInterventionsItem],
  },
  {
    label: "Administration",
    items: [
      usersItem,
      loginActivityItem,
      activityLogItem,
      teamManagementItem,
      departmentsItem,
      kpiLibraryItem,
      customersItem,
      systemSettingsItem,
      interventionsItem,
    ],
  },
  {
    label: "Dev",
    items: [devTicketsItem],
  },
];

// DM — legacy Manager: Overview, then a "Management" group instead of
// Administration (no Departments/Customers/System Settings — those stay
// Admin-only), then Reports.
const managerGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [dashboardItem, vaConnectionsItem, kpiConfigItem, customerOverviewItem, clientDetailItem, devTicketsItem],
  },
  {
    label: "Management",
    items: [teamManagementItem, usersItem, loginActivityItem, kpiLibraryItem, interventionsItem],
  },
  {
    label: "Reports",
    items: [submissionsItem, performanceItem, vaKpiSheetItem, lifetimeValueItem, weeklyInterventionsItem],
  },
];

// OM — legacy Team Leader: a narrower Overview/Reports plus a "Tools" group.
const teamLeaderGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [dashboardItem, vaConnectionsItem, kpiConfigItem, customerOverviewItem, devTicketsItem],
  },
  {
    label: "Reports",
    items: [performanceItem, vaKpiSheetItem],
  },
  {
    label: "Tools",
    items: [submissionsItem, interventionsItem, kpiLibraryItem],
  },
];

// SERVICE_MANAGER — legacy CS Specialist: minimal, no Connections/KPI Config.
const csGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [dashboardItem, customerOverviewItem, devTicketsItem],
  },
  {
    label: "Reports",
    items: [performanceItem],
  },
];

// VA — legacy VA: a single "My Work" group. KPI, History, and My
// Interventions are all new (not in legacy) — previously a VA had no way to
// check their current KPI standing, whether it's trending up or down over
// time, or what's been logged against them, between submissions.
const vaGroups: NavGroup[] = [
  {
    label: "My Work",
    // No standalone "Submit KPI Report" entry — a VA submits via the Submit
    // KPI button on a connection card (Dashboard or My Connections), which
    // already knows which connection it's for.
    items: [dashboardItem, vaConnectionsItem, myKpiItem, historyItem, interventionsItem, devTicketsItem],
  },
];

const navGroupsByRole: Record<string, NavGroup[]> = {
  ADMIN: adminGroups,
  EXECUTIVE: executiveGroups,
  DM: managerGroups,
  // Ops Manager is department-wide/DM-equivalent by spec — reuses the exact
  // same nav groups as DM rather than a parallel copy that could drift.
  OPS_MANAGER: managerGroups,
  OM: teamLeaderGroups,
  SERVICE_MANAGER: csGroups,
  VA: vaGroups,
};

/** Drops items the given role can't open anyway, and any group left empty. */
export function visibleNavGroups(role: string): NavGroup[] {
  const groups = navGroupsByRole[role] ?? adminGroups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

export type NavMatch = { group: NavGroup; item: NavItem };

function findInGroups(groups: NavGroup[], pathname: string): NavMatch | null {
  let best: NavMatch | null = null;
  for (const group of groups) {
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

/**
 * Longest-prefix match against this role's own nav, so a nested page (KPI
 * Config) doesn't also light up its parent (Connections), and the
 * breadcrumb's group label matches what the sidebar actually shows this
 * role. Falls back to the full Admin nav (a superset of every page) so
 * pages reachable but not curated into a role's sidebar — e.g. an OM
 * opening Lifetime Value directly — still get a sensible breadcrumb.
 */
export function matchNavItem(pathname: string, role: string): NavMatch | null {
  return findInGroups(visibleNavGroups(role), pathname) ?? findInGroups(adminGroups, pathname);
}
