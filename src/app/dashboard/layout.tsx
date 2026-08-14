import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/period";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const [session, submissionsToday] = await Promise.all([
    auth(),
    prisma.submission.count({
      where: { submittedAt: { gte: startOfToday() } },
    }),
  ]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        email={session?.user?.email ?? ""}
        role={session?.user?.role ?? ""}
        submissionsToday={submissionsToday}
      />
      <main className="min-w-0 flex-1 overflow-x-hidden p-8">{children}</main>
    </div>
  );
}
