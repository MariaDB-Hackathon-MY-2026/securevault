"use client";

import * as React from "react";
import { UploadQueueContext } from "@/components/upload/upload-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/upload/upload-dialog";
import { ArrowUpRight } from "lucide-react";

export function UploadQueueSummary() {
  const context = React.useContext(UploadQueueContext);
  
  if (!context) {
    return null;
  }

  const { uploads } = context;
  const activeCount = uploads.filter(
    (u) => u.status === "uploading" || u.status === "queued" || u.status === "pausing"
  ).length;
  const failedCount = uploads.filter((u) => u.status === "failed").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Upload queue</CardTitle>
          <CardDescription>
            {uploads.length === 0
              ? "No active uploads"
              : `${activeCount} uploading, ${failedCount} failed`}
          </CardDescription>
        </div>
        <UploadDialog>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </UploadDialog>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground mt-2">
        {uploads.length > 0 ? (
          <div>Track progress of your file uploads here.</div>
        ) : (
          <div>Upload documents to encrypt and secure them in your vault.</div>
        )}
      </CardContent>
    </Card>
  );
}
