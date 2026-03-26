import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailVerificationStatus } from "@/components/auth/email-verification-status";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import { UploadDialog } from "@/components/upload/upload-dialog";
import { UploadQueueSummary } from "@/components/upload/upload-queue-summary";

type FilesPageContentProps = {
  user: CurrentUser | null;
};

export function FilesPageContent({ user }: FilesPageContentProps) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Files</p>
          <h2 className="mt-2 text-3xl font-semibold">Your encrypted library</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage your secured documents. All files are encrypted client-side before upload.
          </p>
        </div>
        {user?.email_verified && <UploadDialog />}
      </div>

      {!user?.email_verified && (
        <EmailVerificationStatus verified={false} variant="notice" />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Storage quota</CardTitle>
            <CardDescription>Current account storage allocation</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {user?.storage_used.toLocaleString()} / {user?.storage_quota.toLocaleString()} bytes used
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Encryption status</CardTitle>
            <CardDescription>Your user encryption key is available server-side</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ready for later upload and file-encryption flows.
          </CardContent>
        </Card>
        {user?.email_verified ? (
          <UploadQueueSummary />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Upload queue</CardTitle>
              <CardDescription>Uploads are disabled</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Please verify your email to enable file uploads.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
