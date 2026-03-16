"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "./actions";
import { useActionToast } from "@/hooks/use-action-toast";

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

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, undefined);

  useActionToast(isPending, state, {
    loadingMessage: "Logging in...",
    successMessage: "Logged in successfully. Redirecting...",
    id: "login-toast",
  });

  return (
    <div className="flex w-full flex-col items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-sm border-border/70 bg-background/88 shadow-xl shadow-slate-950/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your email below to login to your account.
          </CardDescription>
        </CardHeader>
      <form action={formAction}>
        <CardContent className="grid gap-4">
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
            <div className="flex items-center">
              <Label htmlFor="password">Password</Label>
            </div>
            <Input id="password" name="password" type="password" required />
          </div>

          {state?.error && (
            <div className="text-sm font-medium text-destructive">
              {state.error}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Logging in..." : "Login"}
          </Button>
          <div className="text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Sign up
            </Link>
          </div>
        </CardFooter>
      </form>
      </Card>
    </div>
  );
}
