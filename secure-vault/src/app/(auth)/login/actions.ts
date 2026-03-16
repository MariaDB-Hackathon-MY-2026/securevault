"use server";

import { redirect } from "next/navigation";

import { setAuthCookies } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { getRequestMetaData } from "@/lib/auth/request-metadata";
import { safeRedirect } from "@/lib/auth/redirect";
import { createSession } from "@/lib/auth/session";
import { getUserByEmail } from "@/lib/db/crud/user/get-user-by-email";

export type LoginActionState = {
  success?: boolean;
  error?: string;
};

type LoginInput = {
  email: string;
  password: string;
  redirectTo: string;
};

const INVALID_CREDENTIALS_ERROR = "Invalid login email or password";
const MISSING_FIELDS_ERROR = "Missing required fields";
const GENERIC_LOGIN_ERROR = "We couldn't log you in right now. Please try again.";

/**
 * Server action to handle user login.
 * 
 * Flow:
 * - find user by email
 * - verify Argon2id hash
 * - create session
 * - set cookies
 * - redirect
 * 
 * Returns same error message for wrong email AND wrong password.
 */
export async function loginAction(
  prevState: LoginActionState | undefined,
  formData: FormData
): Promise<LoginActionState> {
  const loginInput = getLoginInput(formData);
  if (!loginInput) {
    return { error: MISSING_FIELDS_ERROR };
  }

  const loginResult = await runLogin(loginInput);
  if (loginResult) {
    return loginResult;
  }

  redirect(loginInput.redirectTo);
}

function getLoginInput(formData: FormData): LoginInput | null {
  const email = formData.get("email");
  const password = formData.get("password");
  const redirectTo = formData.get("redirectTo");

  if (
    !email ||
    typeof email !== "string" ||
    !password ||
    typeof password !== "string"
  ) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  return {
    email: normalizedEmail,
    password,
    redirectTo: safeRedirect(
      typeof redirectTo === "string" ? redirectTo : undefined,
      "/activity",
    ),
  };
}

async function runLogin({
  email,
  password,
}: LoginInput): Promise<LoginActionState | undefined> {
  try {
    const userResult = await getUserByEmail(email);
    if (userResult.length <= 0) {
      return { error: INVALID_CREDENTIALS_ERROR };
    }

    const { userId, passwordHash } = userResult[0];
    const passwordMatches = await verifyLoginPassword(password, passwordHash);
    if (!passwordMatches) {
      return { error: INVALID_CREDENTIALS_ERROR };
    }

    const deviceInfo = await getRequestMetaData();
    const { sessionToken, refreshToken } = await createSession(userId, deviceInfo);
    await setAuthCookies(sessionToken, refreshToken);

    return undefined;
  } catch (error) {
    console.error("loginAction failed", error);
    return { error: GENERIC_LOGIN_ERROR };
  }
}

async function verifyLoginPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await verifyPassword(password, passwordHash);
  } catch {
    return false;
  }
}
