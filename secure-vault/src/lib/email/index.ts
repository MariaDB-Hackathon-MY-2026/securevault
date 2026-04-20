import { Resend } from "resend";
import { otpEmailHtml, passwordResetOtpEmailHtml } from "./templates";

const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev"; // Fallback to resend default sandbox

function getResendApiKey() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  return apiKey ? apiKey : null;
}

function isResendConfigured() {
  return getResendApiKey() !== null;
}

function getResendClient() {
  const apiKey = getResendApiKey();

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

export async function sendEmail(to: string, subject: string, html: string) {
  const resend = getResendClient();

  if (!resend) {
    console.log(
      `[Email][terminal-only] To: ${to}, Subject: ${subject}. RESEND_API_KEY is not configured, so outbound email was logged to the server terminal instead.`,
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}

export async function sendOTPEmail(to: string, code: string) {
  if (!isResendConfigured()) {
    console.log(
      `[Share OTP][terminal-only] To: ${to}, Code: ${code}. RESEND_API_KEY is not configured, so the verification code was logged to the server terminal instead of being emailed.`,
    );
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[Share OTP][dev-only] To: ${to}, Code: ${code}. Resend is implemented but bypassed locally because it requires a verified sending domain.`,
    );
    return;
  }

  const html = otpEmailHtml(code);
  await sendEmail(to, "Your secure access code", html);
}

export async function sendPasswordResetOtpEmail(to: string, code: string) {
  if (!isResendConfigured()) {
    console.log(
      `[Password Reset OTP][terminal-only] To: ${to}, Code: ${code}. RESEND_API_KEY is not configured, so the verification code was logged to the server terminal instead of being emailed.`,
    );
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[Password Reset OTP][dev-only] To: ${to}, Code: ${code}`);
    return;
  }

  const html = passwordResetOtpEmailHtml(code);
  await sendEmail(to, "Your SecureVault password reset code", html);
}
