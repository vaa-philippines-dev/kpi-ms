import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { getAlerts } from "@/lib/alerts";
import { getWeekStartDay } from "@/lib/settings";
import { Breadcrumb } from "@/components/breadcrumb";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { PeriodNav } from "@/components/period-nav";
import { ProfileCard } from "@/components/profile-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { ViewAsControl } from "@/components/view-as-control";
import { TeamViewAsControl } from "@/components/team-view-as-control";
import { teamLeaderViewableVasWhere } from "@/lib/view-as";
import { pickTeamForDepartment } from "@/lib/user-teams";
import type { UserRole } from "@/generated/prisma/enums";

export async function DashboardTopbar() {
  const [session, realSession] = await Promise.all([requireSession(), auth()]);
  const scope = connectionScopeWhere(session);
  const isRealAdmin = realSession?.user?.role === "ADMIN";
  const isRealTeamLeader = realSession?.user?.role === "OM";
  const realId = realSession?.user?.id;
  const realDepartmentId = realSession?.user?.departmentId ?? null;

  const [user, alerts, weekStartDay, viewAsDepartments, viewAsTeams, teamViewAsMembers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: {
        name: true,
        email: true,
        departmentId: true,
        teamId: true,
        department: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
    getAlerts(scope, session.role),
    getWeekStartDay(),
    // Only fetched for real admins — the one audience that can ever see the
    // View As control that uses these lists.
    isRealAdmin
      ? prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    // Team names aren't unique across departments (e.g. an Amazon "Team 02"
    // and an unrelated Executive Assistant "Team 02" can both exist), so the
    // department name comes along for the picker to disambiguate them.
    isRealAdmin
      ? prisma.team.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
        })
      : Promise.resolve([]),
    // Team Leaders' own View As list — only VAs on teams they lead in their
    // own department (see lib/view-as.ts).
    isRealTeamLeader && realId
      ? prisma.user.findMany({
          where: teamLeaderViewableVasWhere(realId, realDepartmentId),
          orderBy: [{ name: "asc" }, { email: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            team: { select: { id: true, name: true, departmentId: true } },
            additionalTeams: { select: { team: { select: { id: true, name: true, departmentId: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  // A Team Leader previewing a VA — that VA's profile shows the team
  // leader's department (the only one in view), not the VA's primary one,
  // which for a hybrid VA may be a department the team leader can't see.
  const isTeamViewingAs = isRealTeamLeader && Boolean(realId) && session.id !== realId;
  const teamViewDepartment =
    isTeamViewingAs && realDepartmentId
      ? await prisma.department.findUnique({ where: { id: realDepartmentId }, select: { name: true } })
      : null;

  const isViewingAs = Boolean(isRealAdmin && realId && session.id !== realId && user);
  // "Pick a specific person" list for the role currently being previewed —
  // narrowed to the previewed user's own department (home or additional)
  // for department-scoped roles, so the VA list isn't all ~800 VAs at once.
  // CS Specialists and Executives aren't department-scoped, so they list all.
  const DEPT_SCOPED = new Set(["DM", "OPS_MANAGER", "OM", "VA"]);
  const viewAsUsers = isViewingAs
    ? await prisma.user.findMany({
        where: {
          role: session.role as UserRole,
          isActive: true,
          ...(DEPT_SCOPED.has(session.role) && user?.departmentId
            ? {
                OR: [
                  { departmentId: user.departmentId },
                  { additionalDepartments: { some: { departmentId: user.departmentId } } },
                ],
              }
            : {}),
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { id: true, name: true, email: true },
      })
    : [];

  const viewingAs =
    isViewingAs && user
      ? {
          userId: session.id,
          role: session.role,
          departmentId: user.departmentId,
          departmentName: user.department?.name,
          teamId: user.teamId,
          teamName: user.team?.name,
        }
      : null;

  return (
    <header className="sticky top-0 z-30 grid min-h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-surface-border bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-3">
        <Breadcrumb role={session.role} />
      </div>

      <div className="flex items-center justify-center">
        <PeriodNav weekStartDay={weekStartDay} />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        {isRealAdmin && (
          <ViewAsControl
            viewingAs={viewingAs}
            departments={viewAsDepartments}
            users={viewAsUsers.map((u) => ({ id: u.id, name: u.name ?? u.email }))}
            teams={viewAsTeams.map((t) => ({
              id: t.id,
              name: t.name,
              departmentId: t.departmentId,
              departmentName: t.department.name,
            }))}
          />
        )}
        {isRealTeamLeader && (
          <TeamViewAsControl
            viewingUserId={isTeamViewingAs ? session.id : null}
            members={teamViewAsMembers.map((m) => ({
              id: m.id,
              name: m.name ?? m.email,
              teamName: realDepartmentId ? (pickTeamForDepartment(m, realDepartmentId)?.name ?? null) : null,
            }))}
          />
        )}
        <CommandPalette role={session.role} />
        <NotificationBell alerts={alerts} />
        <ThemeToggle variant="inline" />
        {user && (
          <ProfileCard
            name={user.name}
            email={user.email}
            role={session.role}
            departmentName={teamViewDepartment?.name ?? user.department?.name}
          />
        )}
      </div>
    </header>
  );
}
