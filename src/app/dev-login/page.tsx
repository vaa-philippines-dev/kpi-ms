import { notFound } from "next/navigation";
import { DEV_AUTH_ENABLED } from "@/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { devSignIn } from "./actions";

// Local-only sign-in (see DEV_AUTH_ENABLED in src/auth.ts) — 404s everywhere
// else, including production.
export default function DevLoginPage() {
  if (!DEV_AUTH_ENABLED) notFound();

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <form
        action={devSignIn}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-dashed border-warning/50 bg-surface p-6"
      >
        <div>
          <p className="text-xs font-semibold text-warning uppercase">Dev only</p>
          <h1 className="mt-1 text-lg font-semibold">Sign in as any user</h1>
          <p className="mt-1 text-xs text-muted">
            Any active, provisioned user by email — no Google. Enabled by DEV_AUTH=1 under next dev.
          </p>
        </div>
        <Input name="email" type="email" required placeholder="user@vaaphilippines.com" className="w-full" />
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
    </main>
  );
}
