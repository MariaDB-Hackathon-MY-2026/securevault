import { toCurrentUserClient } from "@/lib/auth/current-user-client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { DashboardMobileNav } from "@/components/dashboard/dashboard-mobile-nav";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.15),_transparent_35%),linear-gradient(180deg,_rgba(15,23,42,0.04),_transparent_40%)]">
      <div className="mx-auto min-h-screen max-w-7xl p-4 lg:p-6">
        <DashboardMobileNav initialUser={toCurrentUserClient(user)} />

        <div className="flex min-h-[calc(100vh-2rem)] flex-col gap-6 lg:min-h-0 lg:flex-row">
          <DashboardSidebar initialUser={toCurrentUserClient(user)} />

          <main className="min-w-0 flex-1 border border-border/60 bg-background/95 p-4 backdrop-blur lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
