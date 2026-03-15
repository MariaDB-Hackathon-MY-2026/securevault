import { cookies } from "next/headers";

export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_TOKEN_MAX_AGE_SECONDS = 15 * 60;

export async function setAuthCookies(sessionToken: string, refreshToken: string): Promise<void> {
  const currentRequestCookieContext = await cookies();

  currentRequestCookieContext.set("__Secure-session", sessionToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: SESSION_TOKEN_MAX_AGE_SECONDS,
  });

  currentRequestCookieContext.set("__Secure-refresh", refreshToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}

export async function clearAuthCookies(): Promise<void> {
  const currentRequestCookieContext = await cookies();

  currentRequestCookieContext.set("__Secure-session", "", {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: 0,
  });

  currentRequestCookieContext.set("__Secure-refresh", "", {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: 0,
  });
}
