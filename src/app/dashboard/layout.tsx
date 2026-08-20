import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard-topbar";
import { ToastProvider } from "@/components/ui/toast";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/period";
import { getAppName } from "@/lib/settings";
import { getEffectiveSession } from "@/lib/view-as";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const [session, submissionsToday, appName] = await Promise.all([
    getEffectiveSession(),
    prisma.submission.count({
      where: { submittedAt: { gte: startOfToday() } },
    }),
    getAppName(),
  ]);

  return (
    <ToastProvider>
      <div className="flex h-screen bg-background">
        <DashboardSidebar
          role={session?.role ?? ""}
          submissionsToday={submissionsToday}
          appName={appName}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardTopbar />
          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-8 py-6">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
