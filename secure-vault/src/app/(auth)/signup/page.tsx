"use client";

import { useActionState, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { signupAction } from "./actions";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  validatePasswordStrength,
  type PasswordStrengthValidation,
} from "@/lib/auth/password-strength";

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

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState(signupAction, undefined);
  const [password, setPassword] = useState("");

  useActionToast(isPending, state, {
    loadingMessage: "Signing up...",
    successMessage: "Account created successfully.",
    id: "signup-toast",
  });

  const strength = password ? validatePasswordStrength(password) : null;
  const strengthAppearance = getStrengthAppearance(strength);
  const strengthPercent = strength ? ((strength.strength + 1) / 5) * 100 : 0;

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };


  return (
    <div className="flex w-full flex-col items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-sm border-border/70 bg-background/88 shadow-xl shadow-slate-950/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl">Sign Up</CardTitle>
          <CardDescription>
            Enter your information to create an account
          </CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="John Doe"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="m@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                aria-describedby="password-strength"
                aria-invalid={password.length > 0 && !strength?.valid}
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={handlePasswordChange}
              />
              {password && (
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
                  {!strength?.valid && (
                    <p className="text-xs text-muted-foreground">{strength?.feedback}</p>
                  )}
                  {strength?.valid && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Password strength looks good.
                    </p>
                  )}
                </div>
              )}
            </div>

            {state?.error && (
              <StatusNotice
                tone="error"
                title="Unable to create account"
                description={state.error}
              />
            )}
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isPending || !strength?.valid}>
              {isPending ? "Signing up..." : "Create an account"}
            </Button>
            <div className="text-center text-sm">
              Already have an account?{" "}
              <Button asChild variant="link" className="h-auto px-0 text-sm">
                <Link href="/login">Login</Link>
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
