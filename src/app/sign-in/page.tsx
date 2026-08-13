import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        VAA KPI Dashboard
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
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
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
