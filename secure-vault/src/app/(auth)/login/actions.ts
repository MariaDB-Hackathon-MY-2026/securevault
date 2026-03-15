"use server";

export type LoginActionState = {
  success?: boolean;
  error?: string;
};

/**
 * Server action to handle user login.
 * 
 * Flow:
 * - find user by email
 * - verify Argon2id hash
 * - create session
 * - record device
 * - set cookies
 * - redirect
 * 
 * Returns same error message for wrong email AND wrong password.
 */
export async function loginAction(
  prevState: LoginActionState | undefined,
  formData: FormData
): Promise<LoginActionState> {
  // TODO: Let the user implement this
  console.log("Login action called with:", Object.fromEntries(formData));

  // Placeholder return
  // return { error: "Not implemented yet" };
  // or return { success: true };
  
  return { error: "Not implemented yet" };
}
