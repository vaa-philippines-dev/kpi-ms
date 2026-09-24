"use server";

import { signIn, DEV_AUTH_ENABLED } from "@/auth";

export async function devSignIn(formData: FormData) {
  if (!DEV_AUTH_ENABLED) throw new Error("Dev login is disabled.");
  await signIn("dev-login", {
    email: String(formData.get("email") ?? ""),
    redirectTo: "/dashboard",
  });
}
