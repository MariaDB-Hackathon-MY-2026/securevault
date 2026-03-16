"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { clearAuthCookies } from "@/lib/auth/cookies";
import { requireCurrentUser } from "@/lib/auth/get-current-user";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { validatePasswordStrength } from "@/lib/auth/password-strength";
import {
  deleteAllSessions,
  deleteOtherSessions,
  deleteSession,
  deleteSessionByToken,
  getSessionByToken,
  listUserSessions,
} from "@/lib/auth/session";
import { getUserById, updateUserName, updateUserPassword } from "@/lib/db/crud/user";

const SETTINGS_PATH = "/settings";
const GENERIC_PROFILE_ERROR = "We couldn't update your profile right now. Please try again.";
const GENERIC_PASSWORD_ERROR = "We couldn't update your password right now. Please try again.";

export type SettingsActionState = {
  success?: boolean;
  error?: string;
  updatedName?: string;
};

export async function logoutAction(): Promise<never> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("__Secure-session")?.value;

  if (sessionToken) {
    await deleteSessionByToken(sessionToken);
  }

  await clearAuthCookies();
  redirect("/login");
}

export async function updateProfileAction(
  prevState: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const user = await requireCurrentUser();
    const name = formData.get("name");

    if (!name || typeof name !== "string" || !name.trim()) {
      return { error: "Please enter a valid display name." };
    }

    await updateUserName(user.id, name.trim());
    revalidatePath(SETTINGS_PATH);

    return { success: true, updatedName: name.trim() };
  } catch (error) {
    console.error("updateProfileAction failed", error);
    return { error: GENERIC_PROFILE_ERROR };
  }
}

export async function changePasswordAction(
  prevState: SettingsActionState | undefined,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const user = await requireCurrentUser();
    const currentPassword = formData.get("currentPassword");
    const newPassword = formData.get("newPassword");

    if (
      !currentPassword ||
      typeof currentPassword !== "string" ||
      !newPassword ||
      typeof newPassword !== "string"
    ) {
      return { error: "Please provide both your current and new password." };
    }

    const userRecord = await getUserById(user.id);
    if (!userRecord) {
      return { error: "Please provide both your current and new password." };
    }

    const currentPasswordMatches = await verifyCurrentPassword(
      currentPassword,
      userRecord.password_hash,
    );
    if (!currentPasswordMatches) {
      return { error: "Your current password was incorrect." };
    }

    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return { error: passwordValidation.feedback || "Your new password is too weak." };
    }

    await updateUserPassword(user.id, await hashPassword(newPassword));
    revalidatePath(SETTINGS_PATH);

    return { success: true };
  } catch (error) {
    console.error("changePasswordAction failed", error);
    return { error: GENERIC_PASSWORD_ERROR };
  }
}

export async function revokeSessionAction(formData: FormData): Promise<never> {
  const user = await requireCurrentUser();
  const currentSession = await getAuthenticatedSession();
  const sessionId = formData.get("sessionId");

  if (!sessionId || typeof sessionId !== "string") {
    redirect(`${SETTINGS_PATH}?status=invalid-session`);
  }

  if (currentSession && sessionId === currentSession.id) {
    await deleteSession(sessionId);
    await clearAuthCookies();
    redirect("/login");
  }

  const userSessions = currentSession
    ? [currentSession, ...(await getOtherSessionsForValidation(user.id, currentSession.id))]
    : [];
  if (!userSessions.some((session) => session.id === sessionId)) {
    redirect(`${SETTINGS_PATH}?status=invalid-session`);
  }

  await deleteSession(sessionId);
  redirect(`${SETTINGS_PATH}?status=session-revoked`);
}

export async function revokeOtherSessionsAction(): Promise<never> {
  const user = await requireCurrentUser();
  const currentSession = await getAuthenticatedSession();

  if (!currentSession) {
    await deleteAllSessions(user.id);
    await clearAuthCookies();
    redirect("/login");
  }

  await deleteOtherSessions(user.id, currentSession.id);
  redirect(`${SETTINGS_PATH}?status=other-sessions-revoked`);
}

async function getAuthenticatedSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("__Secure-session")?.value;

  if (!sessionToken) {
    return null;
  }

  return getSessionByToken(sessionToken);
}

async function getOtherSessionsForValidation(userId: string, currentSessionId: string) {
  const sessions = await listUserSessions(userId);
  return sessions.filter((session) => session.id !== currentSessionId);
}

async function verifyCurrentPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await verifyPassword(password, passwordHash);
  } catch {
    return false;
  }
}
