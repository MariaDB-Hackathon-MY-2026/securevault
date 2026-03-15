"use server";

export type SignupActionState = {
  success?: boolean;
  error?: string;
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
 * - redirect to `/dashboard/files`
 */
export async function signupAction(
  prevState: SignupActionState | undefined,
  formData: FormData
): Promise<SignupActionState> {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");

  if (!email || typeof email !== "string" || !password || typeof password !== "string" || !name || typeof name !== "string") {
    return { error: "Missing required fields" };
  }

  // TODO: Let the user implement this
  console.log("Signup action called with:", { name, email, password: "[REDACTED]" });

  // Placeholder return
  return { error: "Not implemented yet" };
}
