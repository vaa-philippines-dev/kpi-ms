import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard-topbar";
import { HelpHintListener } from "@/components/help-hint-listener";
import { ToastProvider } from "@/components/ui/toast";
import { WelcomeNoticeModal } from "@/components/welcome-notice-modal";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/period";
import { getAppName } from "@/lib/settings";
import { getEffectiveSession } from "@/lib/view-as";
import { connectionScopeWhere } from "@/lib/connection-scope";

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
  const [submissionsToday, appName] = await Promise.all([
    prisma.submission.count({
      where: { submittedAt: { gte: startOfToday() }, connection: scope },
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
      {/*
        * Both dashboard pollers are unmounted deliberately — see the note at
        * the top of components/ticket-notification-listener.tsx. Between them
        * they were issuing a function invocation per tab per interval, around
        * the clock, which was the bulk of this project's Vercel invocation and
        * Active CPU usage while both quotas were already blown.
        *
        * Everything they fed still works, just not live: the Inbox, ticket
        * threads and the system message banner all render current data on
        * load and on navigation. What is gone is the push — no toast when a
        * ticket arrives, and an open thread or Inbox no longer appends new
        * messages without a refresh (ticket-live-bus has no producer while
        * this is unmounted).
        *
        * To restore, re-add these two lines and the getSystemMessage() call
        * feeding the `message` prop; the components and the
        * /api/notifications/tickets/poll route are all still in the tree.
        *
        * {session && <TicketNotificationListener />}
        * {session && <SystemMessageListener message={systemMessage} />}
        */}
      {authSession?.user && <HelpHintListener loginCount={authSession.user.loginCount} />}
    </ToastProvider>
  );
}
