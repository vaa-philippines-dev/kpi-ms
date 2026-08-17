import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

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
      if (!email) {
        return false;
      }
      // Any Google account can sign in (not just workspace domains), but
      // only if an admin has already pre-provisioned the User row via
      // Users management. Deactivated users are also rejected.
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing || !existing.isActive) {
        return false;
      }
      return true;
    },
    async jwt({ token, user }) {
      // `user` is only present on the sign-in request. The signIn callback
      // already guarantees a matching, active User row exists, so just bump
      // login stats and cache role/id on the token so we don't hit the DB
      // on every request.
      if (user?.email) {
        const email = user.email.toLowerCase();
        const dbUser = await prisma.user.update({
          where: { email },
          // Mirrors the legacy Users sheet's LoginCount/LastLogin columns,
          // surfaced in the Login Activity report.
          data: { lastLogin: new Date(), loginCount: { increment: 1 } },
        });
        token.userId = dbUser.id;
        token.role = dbUser.role;
        token.departmentId = dbUser.departmentId;
        token.serviceId = dbUser.serviceId;
        token.teamId = dbUser.teamId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.departmentId = token.departmentId as string | null;
        session.user.serviceId = token.serviceId as string | null;
        session.user.teamId = token.teamId as string | null;
      }
      return session;
    },
  },
});
