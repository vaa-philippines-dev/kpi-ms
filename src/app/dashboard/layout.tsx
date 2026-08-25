import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard-topbar";
import { ToastProvider } from "@/components/ui/toast";
import { WelcomeNoticeModal } from "@/components/welcome-notice-modal";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/period";
import { getAppName } from "@/lib/settings";
import { getEffectiveSession } from "@/lib/view-as";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const [session, authSession, submissionsToday, appName] = await Promise.all([
    getEffectiveSession(),
    // The real signed-in session (never the "view as" target) — the
    // welcome notice's login marker must track the actual person's sign-in,
    // not whoever an admin happens to be previewing.
    auth(),
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
      {authSession?.user && (
        <WelcomeNoticeModal loginCount={authSession.user.loginCount} />
      )}
    </ToastProvider>
  );
}
