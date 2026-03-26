import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusNotice } from "@/components/ui/status-notice";
import { formatDisplayDateTime } from "@/lib/format/date";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import type { SessionSummary } from "@/lib/auth/session";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/app/(dashboard)/actions";

import { PasswordSettingsForm, ProfileSettingsForm } from "@/components/settings/settings-forms";

const statusMessages: Record<
  string,
  { tone: "success" | "error"; title: string; description: string }
> = {
  "session-revoked": {
    tone: "success",
    title: "Device revoked",
    description: "Selected device session revoked.",
  },
  "other-sessions-revoked": {
    tone: "success",
    title: "Other devices signed out",
    description: "All other devices were signed out.",
  },
  "invalid-session": {
    tone: "error",
    title: "Session unavailable",
    description: "That session could not be revoked.",
  },
};

type SettingsPageContentProps = {
  user: CurrentUser;
  currentSessionId: string | null;
  sessions: SessionSummary[];
  status?: string;
};

export function SettingsPageContent({
  user,
  currentSessionId,
  sessions,
  status,
}: SettingsPageContentProps) {
  const statusMessage = status ? statusMessages[status] ?? null : null;

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Settings</p>
        <h2 className="mt-2 text-3xl font-semibold">Account and device security</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Manage your profile, rotate your password, and review the active sessions tied to your account.
        </p>
      </div>

      {statusMessage && (
        <StatusNotice
          tone={statusMessage.tone}
          title={statusMessage.title}
          description={statusMessage.description}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update the name shown across your workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileSettingsForm currentName={user.name} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Change your password after verifying the current one.</CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordSettingsForm />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active devices</CardTitle>
            <CardDescription>
              Review where your account is signed in and revoke access when needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form action={revokeOtherSessionsAction}>
              <Button type="submit" variant="outline">Revoke all other devices</Button>
            </form>

            <div className="grid gap-3">
              {sessions.map((session) => {
                const isCurrent = currentSessionId === session.id;

                return (
                  <div key={session.id} className="border border-border/60 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1 text-sm">
                        <p className="font-medium">{session.device_name}{isCurrent ? " (Current device)" : ""}</p>
                        <p className="text-muted-foreground">IP: {session.ip_address}</p>
                        <div className="text-muted-foreground">
                          <p>Signed in</p>
                          <p>{formatDisplayDateTime(session.created_at)}</p>
                        </div>
                        <div className="text-muted-foreground">
                          <p>Session expires</p>
                          <p>{formatDisplayDateTime(session.session_expires_at)}</p>
                        </div>
                      </div>
                      <form action={revokeSessionAction}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <Button type="submit" variant="outline">
                          {isCurrent ? "Logout this device" : "Revoke"}
                        </Button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
