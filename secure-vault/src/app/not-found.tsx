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

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-muted/60 via-background to-background">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <Card className="w-full border-border/70 bg-background/80 backdrop-blur">
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline">404</Badge>
              <span className="text-xs text-muted-foreground">Not found</span>
            </div>
            <CardTitle className="text-2xl">We couldn&apos;t find that page.</CardTitle>
            <CardDescription>
              The link might be outdated or the page was moved. Let&apos;s get you
              back on track.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Try the homepage or use the navigation once you&apos;re back in.
            </div>
            <Button asChild>
              <Link href="/">Go to home</Link>
            </Button>
          </CardContent>
        </Card>
        <div className="mt-8 text-center text-xs text-muted-foreground">
          Tip: check for typos or bookmark the page you need.
        </div>
      </div>
    </main>
  );
}
