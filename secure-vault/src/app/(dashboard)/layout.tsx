import { toCurrentUserClient } from "@/lib/auth/current-user-client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
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
      <div className="mx-auto min-h-screen max-w-7xl p-4 lg:h-screen lg:overflow-hidden lg:p-6">
        <DashboardShell initialUser={toCurrentUserClient(user)}>
          {children}
        </DashboardShell>
      </div>
    </div>
  );
}
