import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { upsertUser } from "@/lib/db";

const githubId = process.env.AUTH_GITHUB_ID;
const githubSecret = process.env.AUTH_GITHUB_SECRET;

const providers =
  githubId && githubSecret
    ? [
        GitHub({
          clientId: githubId,
          clientSecret: githubSecret,
        }),
      ]
    : [
        Credentials({
          name: "Akun lokal",
          credentials: {},
          authorize: async () => ({
            id: "demo-user",
            name: "Akun Lokal",
            email: "demo@potong.local",
            image: null,
          }),
        }),
      ];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  debug: true,
  useSecureCookies: process.env.AUTH_URL?.startsWith("https://") ?? false,
  callbacks: {
    async signIn({ user }) {
      upsertUser({
        id: user.id ?? "demo-user",
        email: user.email ?? "",
        name: user.name ?? "Pengguna",
        image: user.image ?? null,
      });
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const dbUser = upsertUser({
          id: user.id ?? token.sub ?? "demo-user",
          email: user.email ?? "",
          name: user.name ?? "Pengguna",
          image: user.image ?? null,
        });
        token.sub = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.sub ?? "demo-user";
      return session;
    },
  },
});
