import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { auth, signOut } from "@/auth";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-1">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-surface-border px-8 py-3 text-sm">
          <span className="text-muted">{session?.user?.email}</span>
          <span className="rounded-full border border-surface-border px-2 py-0.5 text-xs text-muted">
            {session?.user?.role}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="text-muted hover:text-foreground">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
