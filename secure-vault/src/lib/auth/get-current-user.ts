"use server";

import { cookies } from "next/headers";

import { decryptUEK } from "@/lib/crypto";
import { getUserById } from "@/lib/db/crud/user";
import { type SanitizedUser, validateSession } from "@/lib/auth/session";

export type CurrentUser = SanitizedUser & {
  uek: Buffer;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const requestCookieContext = await cookies();
  const sessionToken = requestCookieContext.get("__Secure-session")?.value;

  if (!sessionToken) {
    return null;
  }

  const sessionUser = await validateSession(sessionToken);
  if (!sessionUser) {
    return null;
  }

  const user = await getUserById(sessionUser.id);
  if (!user) {
    return null;
  }

  return {
    ...sessionUser,
    uek: decryptUEK(user.encrypted_uek),
  };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireVerifiedUser(): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (!user.email_verified) {
    throw new Error("Please verify your email");
  }

  return user;
}
