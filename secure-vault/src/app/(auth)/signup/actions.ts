"use server";

import { redirect } from "next/navigation";

import { getRequestMetaData } from "@/lib/auth/request-metadata";
import { setAuthCookies } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { safeRedirect } from "@/lib/auth/redirect";
import { createSession } from "@/lib/auth/session";
import { encryptUEK, generateUEK } from "@/lib/crypto";
import { createUser, deleteUserById } from "@/lib/db/crud/user";

export type SignupActionState = {
  success?: boolean;
  error?: string;
};

const GENERIC_SIGNUP_ERROR = "We couldn't create your account right now. Please try again.";

type SignupInput = {
  email: string;
  name: string;
  password: string;
  redirectTo: string;
};

/**
 * Server action to handle user signup.
 * 
 * Flow:
 * - validate email/password
 * - hash password
 * - generate UEK
 * - encrypt UEK with MK
 * - insert user
 * - create session
 * - set cookies
 * - redirect to `/activity`
 */
export async function signupAction(
  prevState: SignupActionState | undefined,
  formData: FormData
): Promise<SignupActionState> {
  const signupInput = getSignupInput(formData);

  if (!signupInput) {
    return { error: "Missing required fields" };
  }

  const signupResult = await runSignup(signupInput);
  if (signupResult) {
    return signupResult;
  }

  redirect(signupInput.redirectTo);
}

function isDuplicateEmailError(error: unknown): error is { code: string } {
  return hasDatabaseErrorCode(error, "ER_DUP_ENTRY");
}

function getSignupInput(formData: FormData): SignupInput | null {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const redirectTo = formData.get("redirectTo");

  if (
    !email ||
    typeof email !== "string" ||
    !password ||
    typeof password !== "string" ||
    !name ||
    typeof name !== "string"
  ) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();

  if (!normalizedEmail || !normalizedName) {
    return null;
  }

  return {
    email: normalizedEmail,
    name: normalizedName,
    password,
    redirectTo: safeRedirect(
      typeof redirectTo === "string" ? redirectTo : undefined,
      "/activity",
    ),
  };
}

async function runSignup({
  email,
  name,
  password,
}: SignupInput): Promise<SignupActionState | undefined> {
  let createdUserId: string | null = null;

  try {
    const hashedPassword = await hashPassword(password);
    const encryptedUek = encryptUEK(generateUEK());
    createdUserId = await createUser({
      email,
      name,
      password_hash: hashedPassword,
      encrypted_uek: encryptedUek,
    });

    const deviceInfo = await getRequestMetaData();
    const { sessionToken, refreshToken } = await createSession(createdUserId, deviceInfo);

    await setAuthCookies(sessionToken, refreshToken);
    return undefined;
  } catch (error) {
    if (createdUserId && !isDuplicateEmailError(error)) {
      await tryDeleteCreatedUser(createdUserId);
    }

    return getSignupErrorState(error);
  }
}

function getSignupErrorState(error: unknown): SignupActionState {
  if (isDuplicateEmailError(error)) {
    return { error: "An account with this email already exists" };
  }

  console.error("signupAction failed", error);
  return { error: GENERIC_SIGNUP_ERROR };
}

async function tryDeleteCreatedUser(userId: string): Promise<void> {
  try {
    await deleteUserById(userId);
  } catch (cleanupError) {
    console.error("signupAction cleanup failed", cleanupError);
  }
}

function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === code) {
    return true;
  }

  if ("cause" in error) {
    return hasDatabaseErrorCode(error.cause, code);
  }

  return false;
}
