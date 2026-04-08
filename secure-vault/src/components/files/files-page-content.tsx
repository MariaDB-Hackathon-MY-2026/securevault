"use client";

import { EmailVerificationStatus } from "@/components/auth/email-verification-status";
import { FilesLibrary } from "@/components/files/files-library";
import { LargestFilesCard } from "@/components/files/largest-files-card";
import { StorageBreakdownCard } from "@/components/files/storage-breakdown-card";
import { StorageOverviewCard } from "@/components/files/storage-overview-card";
import { UploadQueueSummary } from "@/components/upload/upload-queue-summary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStorageDashboardQuery } from "@/hooks/use-storage-dashboard-query";
import type {
  FileListItem,
  FolderListItem,
  StorageDashboardData,
} from "@/lib/files/types";

type FilesPageContentProps = {
  canUpload: boolean;
  emailVerified: boolean;
  files: FileListItem[];
  folders: FolderListItem[];
  initialStorageDashboard: StorageDashboardData;
};

export function FilesPageContent({
  canUpload,
  emailVerified,
  files,
  folders,
  initialStorageDashboard,
}: FilesPageContentProps) {
  const { data: storageDashboard = initialStorageDashboard, isFetching: isStorageDashboardFetching } =
    useStorageDashboardQuery(initialStorageDashboard);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Files</p>
          <h2 className="mt-2 text-3xl font-semibold">Your storage dashboard</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Track quota usage, review cleanup candidates, and manage files across your library without leaving the page.
          </p>
        </div>
      </div>

      {!emailVerified && (
        <EmailVerificationStatus verified={false} variant="notice" />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StorageOverviewCard
          data={storageDashboard}
          isFetching={isStorageDashboardFetching}
        />
        <StorageBreakdownCard data={storageDashboard} />
        {emailVerified ? (
          <UploadQueueSummary />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Upload queue</CardTitle>
              <CardDescription>Uploads are disabled</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Please verify your email to enable new uploads.
            </CardContent>
          </Card>
        )}
      </div>

      <LargestFilesCard files={storageDashboard.largestFiles} folders={folders} />

      <FilesLibrary
        canUpload={canUpload}
        initialFiles={files}
        initialFolders={folders}
      />
    </div>
  );
}
