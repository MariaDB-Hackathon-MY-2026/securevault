"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusNotice } from "@/components/ui/status-notice";
import {
  validatePasswordStrength,
  type PasswordStrengthValidation,
} from "@/lib/auth/password-strength";

type ApiResponse = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  success?: boolean;
};

const strengthLabels = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;

function getStrengthAppearance(strength: PasswordStrengthValidation | null) {
  if (!strength) {
    return {
      barClassName: "bg-muted",
      label: "Enter a password",
      textClassName: "text-muted-foreground",
    };
  }

  if (strength.valid) {
    return {
      barClassName: "bg-emerald-500",
      label: strengthLabels[strength.strength],
      textClassName: "text-emerald-600",
    };
  }

  if (strength.strength <= 1) {
    return {
      barClassName: "bg-red-500",
      label: strengthLabels[strength.strength],
      textClassName: "text-red-600",
    };
  }

  return {
    barClassName: "bg-amber-500",
    label: strengthLabels[strength.strength],
    textClassName: "text-amber-600",
  };
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isResending, setIsResending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const strength = useMemo(
    () => (newPassword ? validatePasswordStrength(newPassword) : null),
    [newPassword],
  );
  const strengthAppearance = getStrengthAppearance(strength);
  const strengthPercent = strength ? ((strength.strength + 1) / 5) * 100 : 0;

  const shouldSuggestResend =
    errorCode === "OTP_EXPIRED" || errorCode === "OTP_LOCKED" || errorCode === "OTP_USED";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setErrorMessage(null);
    setFieldErrors({});
    setResendMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/reset", {
        body: JSON.stringify({ code, email, newPassword }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as ApiResponse;

      if (!response.ok) {
        setErrorCode(payload.error ?? null);
        setErrorMessage(payload.message ?? "Failed to reset password.");
        setFieldErrors(payload.fieldErrors ?? {});
        return;
      }

      setSuccessMessage(payload.message ?? "Password reset successful. Please log in again.");
      setCode("");
      setNewPassword("");
    } catch {
      setErrorMessage("Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setIsResending(true);
    setResendMessage(null);

    try {
      const response = await fetch("/api/auth/password-reset/request-otp", {
        body: JSON.stringify({ email }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as ApiResponse;

      if (!response.ok) {
        setErrorMessage(payload.message ?? "Failed to resend verification code.");
        setFieldErrors(payload.fieldErrors ?? {});
        return;
      }

      setResendMessage(
        payload.message ?? "If an account exists for that email, a verification code has been sent.",
      );
      setErrorCode(null);
    } catch {
      setErrorMessage("Failed to resend verification code.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-sm border-border/70 bg-background/88 shadow-xl shadow-slate-950/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl">Reset Password</CardTitle>
          <CardDescription>
            Enter your email, the 6-digit verification code, and a new password.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                aria-invalid={fieldErrors.email ? "true" : "false"}
                id="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="m@example.com"
                required
                type="email"
                value={email}
              />
              {fieldErrors.email?.[0] ? (
                <p className="text-xs text-destructive">{fieldErrors.email[0]}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="code">Verification Code</Label>
              <Input
                aria-invalid={fieldErrors.code ? "true" : "false"}
                id="code"
                inputMode="numeric"
                maxLength={6}
                name="code"
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                required
                value={code}
              />
              {fieldErrors.code?.[0] ? (
                <p className="text-xs text-destructive">{fieldErrors.code[0]}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                aria-describedby="password-strength"
                aria-invalid={fieldErrors.newPassword ? "true" : "false"}
                id="newPassword"
                name="newPassword"
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
              <div id="password-strength" className="grid gap-2" aria-live="polite">
                <div className="flex items-center justify-between text-xs">
                  <span className={strengthAppearance.textClassName}>
                    Strength: {strengthAppearance.label}
                  </span>
                  <span className="text-muted-foreground">{Math.round(strengthPercent)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={"h-full transition-all " + strengthAppearance.barClassName}
                    style={{ width: `${strengthPercent}%` }}
                  />
                </div>
                {fieldErrors.newPassword?.[0] ? (
                  <p className="text-xs text-destructive">{fieldErrors.newPassword[0]}</p>
                ) : !strength?.valid && newPassword ? (
                  <p className="text-xs text-muted-foreground">{strength?.feedback}</p>
                ) : strength?.valid ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Password strength looks good.
                  </p>
                ) : null}
              </div>
            </div>

            {successMessage ? (
              <StatusNotice
                tone="success"
                title="Password reset successful"
                description={successMessage}
              />
            ) : null}

            {resendMessage ? (
              <StatusNotice
                tone="info"
                title="Verification code sent"
                description={resendMessage}
              />
            ) : null}

            {errorMessage ? (
              <StatusNotice
                tone={shouldSuggestResend ? "warning" : "error"}
                title="Unable to reset password"
                description={errorMessage}
              />
            ) : null}

            {shouldSuggestResend ? (
              <StatusNotice
                tone="info"
                title="Need a new code?"
                description="Request a new verification code if your previous code expired, was used, or is locked after too many attempts."
              />
            ) : null}
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button className="w-full" disabled={isSubmitting || !strength?.valid} type="submit">
              {isSubmitting ? "Resetting password..." : "Reset password"}
            </Button>
            <Button
              className="w-full"
              disabled={isResending || !email.trim()}
              onClick={handleResend}
              type="button"
              variant="outline"
            >
              {isResending ? "Sending new code..." : "Resend code"}
            </Button>
            <div className="text-center text-sm">
              Back to{" "}
              <Button asChild className="h-auto px-0 text-sm" variant="link">
                <Link href="/login">login</Link>
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
