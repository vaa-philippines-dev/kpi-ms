import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HeroBackground } from "@/components/hero-background";
import { SignInModalShell } from "./sign-in-modal-shell";

export default async function SignInPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
      <HeroBackground />
      <SignInModalShell />
    </main>
  );
}
