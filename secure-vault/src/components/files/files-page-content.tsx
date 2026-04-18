"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { EmailVerificationStatus } from "@/components/auth/email-verification-status";
import { FilesLibrary } from "@/components/files/files-library";
import { UploadQueueSummary } from "@/components/upload/upload-queue-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  FileListItem,
  FolderListItem
} from "@/lib/files/types";

type FilesPageContentProps = {
  canUpload: boolean;
  emailVerified: boolean;
  files: FileListItem[];
  folders: FolderListItem[];
  semanticSearchEnabled: boolean;
};

export function FilesPageContent({
  canUpload,
  emailVerified,
  files,
  folders,
  semanticSearchEnabled,
}: FilesPageContentProps) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Files</p>
          <h2 className="mt-2 text-3xl font-semibold">Your encrypted file library</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Browse folders, search semantically across your library, and manage encrypted files without crowding the workspace.
          </p>
        </div>
        <Button asChild className="sm:self-start" variant="outline">
          <Link href="/storage">
            Open storage dashboard
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      {!emailVerified && (
        <EmailVerificationStatus verified={false} variant="notice" />
      )}

      <div>
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

      <FilesLibrary
        canUpload={canUpload}
        initialFiles={files}
        initialFolders={folders}
        semanticSearchEnabled={semanticSearchEnabled}
      />
    </div>
  );
}
