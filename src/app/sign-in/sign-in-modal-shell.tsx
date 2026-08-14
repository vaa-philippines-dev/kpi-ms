"use client";

import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/auth-modal";

export function SignInModalShell() {
  const router = useRouter();
  return <AuthModal open onClose={() => router.push("/")} />;
}
