"use client";

import { usePathname } from "next/navigation";

import { DashboardNavigationPanel } from "@/components/dashboard/dashboard-navigation-panel";
import type { CurrentUserClient } from "@/lib/auth/current-user-client";
import { useCurrentUserQuery } from "@/hooks/use-current-user-query";

type DashboardSidebarProps = {
  initialUser: CurrentUserClient;
};

export function DashboardSidebar({ initialUser }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { data: user } = useCurrentUserQuery(initialUser);
  const resolvedUser = user ?? initialUser;

  return (
    <aside className="hidden shrink-0 lg:block lg:h-full lg:w-64 xl:w-68">
      <DashboardNavigationPanel
        user={resolvedUser}
        pathname={pathname}
        className="border border-border/60 bg-background/95 p-4 backdrop-blur lg:sticky lg:top-0 lg:h-full lg:overflow-y-auto"
      />
    </aside>
  );
}
