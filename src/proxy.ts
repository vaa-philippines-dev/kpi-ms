import { auth } from "@/auth";
import { NextResponse } from "next/server";

const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === "true";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Blanket gate, checked before auth so a valid session can't get through
  // any entry point (sign-in, dashboard, submit, API) either — logged-in
  // users included, since this runs ahead of the auth check below.
  if (MAINTENANCE_MODE) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Service temporarily unavailable for maintenance." },
        { status: 503 },
      );
    }
    if (pathname !== "/") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return;
  }

  if (pathname.startsWith("/dashboard") && !req.auth) {
    const signInUrl = new URL("/sign-in", req.nextUrl);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
