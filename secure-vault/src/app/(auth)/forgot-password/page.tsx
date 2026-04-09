"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

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

type RequestOtpResponse = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  success?: boolean;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFieldError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/request-otp", {
        body: JSON.stringify({ email }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as RequestOtpResponse;

      if (!response.ok) {
        setFieldError(payload.fieldErrors?.email?.[0] ?? null);
        setErrorMessage(payload.message ?? "Failed to send verification code.");
        return;
      }

      setSuccessMessage(
        payload.message ?? "If an account exists for that email, a verification code has been sent.",
      );
    } catch {
      setErrorMessage("Failed to send verification code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-sm border-border/70 bg-background/88 shadow-xl shadow-slate-950/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl">Forgot Password</CardTitle>
          <CardDescription>
            Enter your account email and we&apos;ll send a verification code.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                aria-invalid={fieldError ? "true" : "false"}
                id="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="m@example.com"
                required
                type="email"
                value={email}
              />
              {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
            </div>

            {successMessage ? (
              <StatusNotice
                tone="success"
                title="Verification code requested"
                description={successMessage}
              />
            ) : null}

            {errorMessage ? (
              <StatusNotice
                tone="error"
                title="Unable to send code"
                description={errorMessage}
              />
            ) : null}
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Sending code..." : "Send verification code"}
            </Button>
            {successMessage ? (
              <Button asChild className="w-full" variant="outline">
                <Link href={`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`}>
                  Continue to reset password
                </Link>
              </Button>
            ) : null}
            <div className="text-center text-sm">
              Remembered your password?{" "}
              <Button asChild className="h-auto px-0 text-sm" variant="link">
                <Link href="/login">Back to login</Link>
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
