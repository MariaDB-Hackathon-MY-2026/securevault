import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailVerificationStatus } from "@/components/auth/email-verification-status";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import type { FileListItem, FolderListItem, StorageUsage } from "@/lib/files/types";
import { FilesLibrary } from "@/components/files/files-library";
import { UploadQueueSummary } from "@/components/upload/upload-queue-summary";

type FilesPageContentProps = {
  files: FileListItem[];
  folders: FolderListItem[];
  storageUsage: StorageUsage;
  user: CurrentUser | null;
};

export function FilesPageContent({
  files,
  folders,
  storageUsage,
  user,
}: FilesPageContentProps) {
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
      </div>

      {!user?.email_verified && (
        <EmailVerificationStatus verified={false} variant="notice" />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Active library size</CardTitle>
            <CardDescription>Ready files currently visible in your library</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {storageUsage.totalBytes.toLocaleString()} bytes in active files. Trashed items still count toward the{" "}
            {user?.storage_quota.toLocaleString()} byte account quota until permanently deleted.
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

      <FilesLibrary
        canUpload={Boolean(user?.email_verified)}
        initialFiles={files}
        initialFolders={folders}
      />
    </div>
  );
}
