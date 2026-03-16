import { SettingsPageContent } from "@/components/settings/settings-page-content";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getSessionByToken, listUserSessions } from "@/lib/auth/session";
import { cookies } from "next/headers";

type SettingsPageProps = {
  searchParams?: Promise<{
    status?: string;
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("__Secure-session")?.value;
  const currentSession = sessionToken ? await getSessionByToken(sessionToken) : null;
  const sessions = user ? await listUserSessions(user.id) : [];
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!user) {
    return null;
  }

  return (
    <SettingsPageContent
      user={user}
      currentSessionId={currentSession?.id ?? null}
      sessions={sessions}
      status={resolvedSearchParams?.status}
    />
  );
}
