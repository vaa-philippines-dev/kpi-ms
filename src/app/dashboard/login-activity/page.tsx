import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { LoginActivityTable, type LoginActivityRow } from "@/components/login-activity-table";
import { requireSession } from "@/lib/connection-scope";

// Mirrors legacy's Login Activity screen (AppUsers.html: renderLoginActivity())
// — same stat cards, same DataTable-backed report.
export default async function LoginActivityPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.role !== "DM") {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    where:
      session.role === "DM" && session.departmentId
        ? { departmentId: session.departmentId }
        : {},
    orderBy: { lastLogin: "desc" },
    include: { department: true },
  });

  const rows: LoginActivityRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    departmentName: u.department?.name ?? null,
    loginCount: u.loginCount,
    lastLoginMs: u.lastLogin ? u.lastLogin.getTime() : 0,
    lastLoginIso: u.lastLogin ? u.lastLogin.toISOString() : null,
    isActive: u.isActive,
  }));

  const totalLogins = rows.reduce((sum, r) => sum + r.loginCount, 0);
  const neverLoggedIn = rows.filter((r) => r.lastLoginMs === 0).length;

  return (
    <>
      <PageHeader
        title="Login Activity"
        description="Sign-in count and last login per user."
      />

      {rows.length === 0 ? (
        <ComingSoon note="No users yet." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold">{rows.length}</div>
              <div className="mt-1 text-sm text-muted">Users</div>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold">{totalLogins}</div>
              <div className="mt-1 text-sm text-muted">Total Logins</div>
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <div className="text-3xl font-semibold">{neverLoggedIn}</div>
              <div className="mt-1 text-sm text-muted">Never Logged In</div>
            </div>
          </div>

          <LoginActivityTable rows={rows} />
        </div>
      )}
    </>
  );
}
