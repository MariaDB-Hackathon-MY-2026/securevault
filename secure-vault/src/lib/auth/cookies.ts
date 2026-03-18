import { cookies } from "next/headers";
import {
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  SESSION_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/constants";
export const AUTH_COOKIE_SECURE =
  process.env.NODE_ENV === "production" || process.env.NODE_ENV === "development";

export function getAuthCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "strict" as const,
    secure: AUTH_COOKIE_SECURE,
    path: "/",
    maxAge,
  };
}

export async function setAuthCookies(sessionToken: string, refreshToken: string): Promise<void> {
  const currentRequestCookieContext = await cookies();

  currentRequestCookieContext.set(
    "__Secure-session",
    sessionToken,
    getAuthCookieOptions(SESSION_TOKEN_MAX_AGE_SECONDS),
  );
  currentRequestCookieContext.set(
    "__Secure-refresh",
    refreshToken,
    getAuthCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS),
  );
}

export async function clearAuthCookies(): Promise<void> {
  const currentRequestCookieContext = await cookies();

  currentRequestCookieContext.set("__Secure-session", "", getAuthCookieOptions(0));
  currentRequestCookieContext.set("__Secure-refresh", "", getAuthCookieOptions(0));
}
