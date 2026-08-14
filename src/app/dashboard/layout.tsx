import { LogOut } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { Badge } from "@/components/ui/badge";
import { auth, signOut } from "@/auth";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const session = await auth();
  const initial = session?.user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex min-h-screen flex-1">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-surface-border px-8 py-3 text-sm">
          <div className="flex size-7 items-center justify-center rounded-full bg-accent/15 text-xs font-medium text-accent">
            {initial}
          </div>
          <span className="text-muted">{session?.user?.email}</span>
          <Badge>{session?.user?.role}</Badge>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-1.5 text-muted transition hover:text-foreground"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
