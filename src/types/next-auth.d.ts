import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      departmentId: string | null;
      serviceId: string | null;
      teamId: string | null;
      // Bumped server-side only on an actual sign-in (see auth.ts's jwt
      // callback) — a stable per-login marker the client can compare
      // against to show something once per login, not once per page load.
      loginCount: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: string;
    departmentId?: string | null;
    serviceId?: string | null;
    teamId?: string | null;
    loginCount?: number;
  }
}
