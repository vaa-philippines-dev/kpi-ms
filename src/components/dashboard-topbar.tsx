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

export async function DashboardTopbar() {
  const [session, realSession] = await Promise.all([requireSession(), auth()]);
  const scope = connectionScopeWhere(session);
  const isRealAdmin = realSession?.user?.role === "ADMIN";
  const realId = realSession?.user?.id;

  const [user, alerts, weekStartDay, viewAsDepartments, viewAsTeams] = await Promise.all([
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
  ]);

  const viewingAs =
    isRealAdmin && realId && session.id !== realId && user
      ? {
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
            teams={viewAsTeams.map((t) => ({
              id: t.id,
              name: t.name,
              departmentId: t.departmentId,
              departmentName: t.department.name,
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
            departmentName={user.department?.name}
          />
        )}
      </div>
    </header>
  );
}
