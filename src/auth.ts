import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const workspaceDomain = process.env.GOOGLE_WORKSPACE_DOMAIN ?? "";
const initialAdminEmails = (process.env.INITIAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email || !email.endsWith(`@${workspaceDomain}`)) {
        return false;
      }
      return true;
    },
    async jwt({ token, user }) {
      // `user` is only present on the sign-in request; look up (or
      // provision) the app-level User row once and cache role/id on the
      // token so we don't hit the DB on every request.
      if (user?.email) {
        const email = user.email.toLowerCase();
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            name: user.name,
            role: initialAdminEmails.includes(email) ? "ADMIN" : "SERVICE_MANAGER",
          },
        });
        token.userId = dbUser.id;
        token.role = dbUser.role;
        token.departmentId = dbUser.departmentId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.departmentId = token.departmentId as string | null;
      }
      return session;
    },
  },
});
