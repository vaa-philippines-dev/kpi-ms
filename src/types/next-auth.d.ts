import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      departmentId: string | null;
      serviceId: string | null;
      teamId: string | null;
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
  }
}
