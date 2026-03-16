"use client";

import { useState } from "react";
import { RiCloseLine, RiMenuLine } from "@remixicon/react";
import { usePathname } from "next/navigation";

import { DashboardNavigationPanel } from "@/components/dashboard/dashboard-navigation-panel";
import { getDashboardSectionLabel } from "@/components/dashboard/dashboard-navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CurrentUserClient } from "@/lib/auth/current-user-client";
import { useCurrentUserQuery } from "@/hooks/use-current-user-query";

type DashboardMobileNavProps = {
  initialUser: CurrentUserClient;
};

export function DashboardMobileNav({ initialUser }: DashboardMobileNavProps) {
  const pathname = usePathname();
  const { data: user } = useCurrentUserQuery(initialUser);
  const [open, setOpen] = useState(false);

  if (!user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="sticky top-0 z-30 mb-4 border border-border/60 bg-background/95 p-4 backdrop-blur lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              SecureVault
            </p>
            <h1 className="mt-1 text-lg font-semibold">{getDashboardSectionLabel(pathname)}</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
          </div>

          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Open navigation menu"
            >
              <RiMenuLine className="size-4" />
            </Button>
          </DialogTrigger>
        </div>
      </div>

      <DialogContent className="left-auto right-0 top-0 h-dvh w-[88vw] max-w-sm translate-x-0 translate-y-0 rounded-none border-l border-border p-0">
        <DialogHeader className="flex-row items-center justify-between border-b border-border/60 p-4">
          <div>
            <DialogTitle>Navigation</DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">Move between workspace sections.</p>
          </div>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close navigation menu">
              <RiCloseLine className="size-4" />
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="h-[calc(100dvh-73px)] overflow-y-auto p-4">
          <DashboardNavigationPanel user={user} pathname={pathname} onNavigate={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
