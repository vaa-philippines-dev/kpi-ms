import { prisma } from "@/lib/prisma";
import { requireSession, connectionScopeWhere } from "@/lib/connection-scope";
import { getAlerts } from "@/lib/alerts";
import { Breadcrumb } from "@/components/breadcrumb";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileCard } from "@/components/profile-card";
import { ThemeToggle } from "@/components/theme-toggle";

export async function DashboardTopbar() {
  const session = await requireSession();
  const scope = connectionScopeWhere(session);

  const [user, alerts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: { name: true, email: true, department: { select: { name: true } } },
    }),
    getAlerts(scope, session.role),
  ]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-surface-border bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center">
        <Breadcrumb role={session.role} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
