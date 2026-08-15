"use server";

import { signIn } from "@/auth";

export async function signInWithGoogle(redirectTo: string = "/dashboard") {
  await signIn("google", { redirectTo });
}
