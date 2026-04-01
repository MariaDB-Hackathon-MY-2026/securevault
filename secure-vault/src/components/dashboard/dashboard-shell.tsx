"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { DashboardMobileNav } from "@/components/dashboard/dashboard-mobile-nav";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { Button } from "@/components/ui/button";
import type { CurrentUserClient } from "@/lib/auth/current-user-client";

type DashboardShellProps = {
  children: React.ReactNode;
  initialUser: CurrentUserClient;
};

const SIDEBAR_PREFERENCE_KEY = "securevault.dashboard.sidebar.hidden";

export function DashboardShell({ children, initialUser }: DashboardShellProps) {
  const [isSidebarHidden, setIsSidebarHidden] = React.useState(false);

  React.useEffect(() => {
    const storedValue = window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY);
    setIsSidebarHidden(storedValue === "true");
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(isSidebarHidden));
  }, [isSidebarHidden]);

  return (
    <>
      <DashboardMobileNav initialUser={initialUser} />

      <div className="flex min-h-[calc(100vh-2rem)] flex-col gap-6 lg:h-full lg:min-h-0 lg:flex-row">
        {!isSidebarHidden ? <DashboardSidebar initialUser={initialUser} /> : null}

        <main className="min-w-0 flex-1 border border-border/60 bg-background/95 backdrop-blur lg:h-full lg:overflow-y-auto">
          <div className="sticky top-0 z-20 hidden border-b border-border/60 bg-background/95 px-4 py-4 backdrop-blur lg:flex lg:px-6">
            <Button
              aria-label={isSidebarHidden ? "Show sidebar" : "Hide sidebar"}
              onClick={() => setIsSidebarHidden((currentValue) => !currentValue)}
              type="button"
              variant="outline"
            >
              {isSidebarHidden ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
              {isSidebarHidden ? "Show sidebar" : "Hide sidebar"}
            </Button>
          </div>

          <div className="p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
