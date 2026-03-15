import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  SESSION_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/auth/cookies";
import { refreshSession, validateSession } from "@/lib/auth/session";

function redirectToLogin(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}

function setProxyAuthCookies(response: NextResponse, sessionToken: string, refreshToken: string) {
  response.cookies.set("__Secure-session", sessionToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: SESSION_TOKEN_MAX_AGE_SECONDS,
  });

  response.cookies.set("__Secure-refresh", refreshToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
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

  const response = NextResponse.next();
  setProxyAuthCookies(response, refreshedSession.sessionToken, refreshedSession.refreshToken);
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/upload/:path*",
    "/api/files/:path*",
    "/api/share/:path*",
    "/api/chat/:path*",
  ],
};
