import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { getAlerts } from "@/lib/alerts";
import { Breadcrumb } from "@/components/breadcrumb";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileCard } from "@/components/profile-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { ViewAsControl } from "@/components/view-as-control";

export async function DashboardTopbar() {
  const [session, realSession] = await Promise.all([requireSession(), auth()]);
  const scope = connectionScopeWhere(session);
  const isRealAdmin = realSession?.user?.role === "ADMIN";
  const realId = realSession?.user?.id;

  const [user, alerts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: {
        name: true,
        email: true,
        department: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
    getAlerts(scope, session.role),
  ]);

  const viewingAs =
    isRealAdmin && realId && session.id !== realId && user
      ? {
          role: session.role,
          departmentName: user.department?.name,
          teamName: user.team?.name,
        }
      : null;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-surface-border bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Breadcrumb role={session.role} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isRealAdmin && <ViewAsControl viewingAs={viewingAs} />}
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
