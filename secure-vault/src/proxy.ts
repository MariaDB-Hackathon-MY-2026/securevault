import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  SESSION_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/constants";
import {
  getAuthCookieOptions,
} from "@/lib/auth/cookies";
import { refreshSession, validateSession } from "@/lib/auth/session";

function redirectToLogin(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}

function setProxyAuthCookies(response: NextResponse, sessionToken: string, refreshToken: string) {
  response.cookies.set(
    "__Secure-session",
    sessionToken,
    getAuthCookieOptions(SESSION_TOKEN_MAX_AGE_SECONDS),
  );
  response.cookies.set(
    "__Secure-refresh",
    refreshToken,
    getAuthCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS),
  );
}

export async function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get("__Secure-session")?.value;
  const refreshToken = request.cookies.get("__Secure-refresh")?.value;

  if (sessionToken) {
    const user = await validateSession(sessionToken);
    if (user) {
      return NextResponse.next();
    }
  }

  if (!refreshToken) {
    return redirectToLogin(request);
  }

  const refreshedSession = await refreshSession(refreshToken);
  if (!refreshedSession) {
    return redirectToLogin(request);
  }

  request.cookies.set("__Secure-session", refreshedSession.sessionToken);
  request.cookies.set("__Secure-refresh", refreshedSession.refreshToken);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  setProxyAuthCookies(response, refreshedSession.sessionToken, refreshedSession.refreshToken);
  return response;
}

export const config = {
  matcher: [
    "/activity/:path*",
    "/files/:path*",
    "/settings/:path*",
    "/trash/:path*",
    "/chat/:path*",

    "/api/upload/:path*",
    "/api/files/:path*",

    "/api/chat/:path*",
  ],
};

