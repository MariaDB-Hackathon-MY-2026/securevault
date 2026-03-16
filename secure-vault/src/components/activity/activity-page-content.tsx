import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ActivityPageContent() {
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Activity</p>
        <h2 className="mt-2 text-3xl font-semibold">Account activity timeline</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This placeholder keeps the authenticated navigation complete until the activity log phase lands.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>No activity feed yet</CardTitle>
          <CardDescription>
            Authentication is ready; file and security events will populate this area in later phases.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Expect recent logins, uploads, shares, and device changes here once those features are implemented.
        </CardContent>
      </Card>
    </div>
  );
}
