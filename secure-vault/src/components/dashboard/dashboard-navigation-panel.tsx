"use client";

import Link from "next/link";

import { logoutAction } from "@/app/(dashboard)/actions";
import { EmailVerificationStatus } from "@/components/auth/email-verification-status";
import { Button } from "@/components/ui/button";
import type { CurrentUserClient } from "@/lib/auth/current-user-client";
import { cn } from "@/lib/utils";

import { dashboardNavigationItems } from "@/components/dashboard/dashboard-navigation";

type DashboardNavigationPanelProps = {
  user: CurrentUserClient;
  pathname: string;
  className?: string;
  onNavigate?: () => void;
};

export function DashboardNavigationPanel({
  user,
  pathname,
  className,
  onNavigate,
}: DashboardNavigationPanelProps) {
  const storagePercent = Math.min(
    100,
    Math.round((user.storage_used / Math.max(user.storage_quota, 1)) * 100),
  );

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="border-b border-border/60 pb-4">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">SecureVault</p>
        <h1 className="mt-2 text-2xl font-semibold">Authenticated workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground break-all">Signed in as {user.email}</p>
      </div>

      <div className="mt-4 border-b border-border/60 pb-4">
        <p className="text-sm font-medium">{user.name}</p>
        <EmailVerificationStatus verified={user.email_verified} className="mt-2" />
        <form action={logoutAction} className="mt-3">
          <Button type="submit" variant="outline" className="w-full justify-center">
            Logout
          </Button>
        </form>
      </div>

      <nav className="mt-4 grid gap-2">
        {dashboardNavigationItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 border border-border/60 px-3 py-3 text-sm transition-colors hover:bg-muted",
                isActive && "bg-muted",
              )}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 border border-border/60 p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span>Storage</span>
          <span>{storagePercent}%</span>
        </div>
        <div className="mt-3 h-2 bg-muted">
          <div className="h-full bg-primary" style={{ width: `${storagePercent}%` }} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {user.storage_used.toLocaleString()} of {user.storage_quota.toLocaleString()} bytes used
        </p>
      </div>
    </div>
  );
}
