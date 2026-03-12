"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-muted/60 via-background to-background">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <Card className="w-full border-border/70 bg-background/80 backdrop-blur">
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between">
              <Badge variant="destructive">Error</Badge>
              {error.digest ? (
                <span className="text-xs text-muted-foreground">
                  Digest {error.digest}
                </span>
              ) : null}
            </div>
            <CardTitle className="text-2xl">We hit a snag.</CardTitle>
            <CardDescription>
              Something broke while loading this page. Try again or return home.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              If this keeps happening, we can review the logs together.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => reset()}>
                Try again
              </Button>
              <Button asChild>
                <Link href="/">Back to home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="mt-8 text-center text-xs text-muted-foreground">
          Secure Vault keeps your data safe, even when pages fail.
        </div>
      </div>
    </main>
  );
}
