import Link from "next/link";

export default function SubmitPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        KPI submission form
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        The public, no-login VA submission form (Connection ID lookup + KPI
        values) is built in Phase 3.
      </p>
      <Link href="/" className="mt-6 text-sm text-accent hover:underline">
        Back home
      </Link>
    </main>
  );
}
