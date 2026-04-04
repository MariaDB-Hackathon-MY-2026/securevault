"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LockIcon } from "lucide-react";

export function ShareAuthView({ token }: { token: string }) {
  const [step, setStep] = React.useState<"email" | "otp">("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsPending(true);
    try {
      const res = await fetch(`/api/share/${token}/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to request OTP");
      }
      toast.success(
        process.env.NODE_ENV !== "production"
          ? "Verification code logged in the server terminal. Resend is implemented but bypassed locally because it requires a verified domain."
          : (data.message || "OTP sent if email is allowed"),
      );
      setStep("otp");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Failed to request OTP";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsPending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsPending(true);
    try {
      const res = await fetch(`/api/share/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to verify OTP");
      }
      toast.success("Access granted");
      window.location.assign(`/s/${token}`);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Failed to verify OTP";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <LockIcon className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">Secure Share Link</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This link is restricted. Please verify your identity.
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) {
                    setErrorMessage(null);
                  }
                }}
                placeholder="Enter your email"
              />
            </div>
            {errorMessage ? (
              <p className="text-sm text-destructive" data-testid="share-auth-error" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Sending..." : "Send Verification Code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                type="text"
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (errorMessage) {
                    setErrorMessage(null);
                  }
                }}
                placeholder="Enter 6-digit code"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </div>
            {errorMessage ? (
              <p className="text-sm text-destructive" data-testid="share-auth-error" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Verifying..." : "Verify and Access"}
            </Button>
            <div className="text-center mt-2">
              <button 
                type="button" 
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setErrorMessage(null);
                }} 
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Use a different email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
