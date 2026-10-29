import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "pantry_auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  const isAuthed =
    request.cookies.get(AUTH_COOKIE)?.value === process.env.APP_SHARED_PASSWORD;

  if (!isAuthed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
