import { Resend } from "resend";
import { otpEmailHtml, passwordResetOtpEmailHtml } from "./templates";

const resend = new Resend(process.env.RESEND_API_KEY!);
const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev"; // Fallback to resend default sandbox

export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Email Suppressed in dev] To: ${to}, Subject: ${subject}`);
      return;
    }
    throw new Error("RESEND_API_KEY is not configured");
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
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Password Reset OTP][dev-only] To: ${to}, Code: ${code}`);
    return;
  }

  const html = passwordResetOtpEmailHtml(code);
  await sendEmail(to, "Your SecureVault password reset code", html);
}
