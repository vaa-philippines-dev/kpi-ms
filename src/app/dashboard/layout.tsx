import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard-topbar";
import { HelpHintListener } from "@/components/help-hint-listener";
import { SubmissionNotificationListener } from "@/components/submission-notification-listener";
import { SystemMessageListener } from "@/components/system-message-listener";
import { TicketNotificationListener } from "@/components/ticket-notification-listener";
import { ToastProvider } from "@/components/ui/toast";
import { WelcomeNoticeModal } from "@/components/welcome-notice-modal";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/period";
import { getAppName, getSystemMessage } from "@/lib/settings";
import { getEffectiveSession } from "@/lib/view-as";
import { connectionScopeWhere, SUBMISSION_WATCHER_ROLES } from "@/lib/connection-scope";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const [session, authSession] = await Promise.all([
    getEffectiveSession(),
    // The real signed-in session (never the "view as" target) — the
    // welcome notice's login marker must track the actual person's sign-in,
    // not whoever an admin happens to be previewing.
    auth(),
  ]);

  // Same visibility rules as everywhere else (connectionScopeWhere) — a DM
  // or OM must only see today's count for connections in their own
  // scope, not every department's submissions.
  const scope = session ? connectionScopeWhere(session) : { id: "__none__" };
  const [submissionsToday, appName, systemMessage] = await Promise.all([
    prisma.submission.count({
      where: { submittedAt: { gte: startOfToday() }, connection: scope },
    }),
    getAppName(),
    getSystemMessage(),
  ]);

  const isSubmissionWatcher = session
    ? SUBMISSION_WATCHER_ROLES.includes(session.role as (typeof SUBMISSION_WATCHER_ROLES)[number])
    : false;

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
      {isSubmissionWatcher && <SubmissionNotificationListener />}
      {session && <TicketNotificationListener />}
      {session && <SystemMessageListener message={systemMessage} />}
      {authSession?.user && <HelpHintListener loginCount={authSession.user.loginCount} />}
    </ToastProvider>
  );
}
