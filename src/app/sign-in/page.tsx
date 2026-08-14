import { signIn } from "@/auth";
import { Card } from "@/components/ui/card";
import { GoogleIcon } from "@/components/icons/google-icon";

export default function SignInPage() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl"
        aria-hidden
      />
      <Card className="relative w-full max-w-sm p-8 text-center">
        <p className="text-xs tracking-wide text-muted uppercase">
          VAA Philippines
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          KPI Dashboard
        </h1>
        <p className="mt-2 text-sm text-muted">
          Sign in with your @vaaphilippines.com Google account to continue.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-background px-5 py-2.5 text-sm font-medium transition hover:bg-surface-hover"
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        </form>
      </Card>
    </main>
  );
}
