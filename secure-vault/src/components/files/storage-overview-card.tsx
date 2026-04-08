"use client";

import { HardDrive } from "lucide-react";

import { formatFileSize } from "@/components/files/file-browser-utils";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StorageDashboardData } from "@/lib/files/types";

type StorageOverviewCardProps = {
  data: StorageDashboardData;
  isFetching: boolean;
};

export function StorageOverviewCard({
  data,
  isFetching,
}: StorageOverviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="size-5" />
          Storage overview
        </CardTitle>
        <CardDescription>
          Quota is based on your account total, including ready files in trash.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Quota used</span>
            <span className="text-muted-foreground">
              {formatFileSize(data.quotaUsedBytes)} of {formatFileSize(data.quotaBytes)}
            </span>
          </div>
          <Progress
            aria-label={`${data.usagePercent}% storage used`}
            className="mt-3"
            value={data.usagePercent}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {data.usagePercent}% used{isFetching ? " - refreshing" : ""}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Active library</p>
            <p className="mt-2 text-lg font-semibold">{formatFileSize(data.activeBytes)}</p>
            <p className="text-sm text-muted-foreground">
              {data.activeFileCount} ready file{data.activeFileCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Trash</p>
            <p className="mt-2 text-lg font-semibold">{formatFileSize(data.trashedBytes)}</p>
            <p className="text-sm text-muted-foreground">
              {data.trashedFileCount} ready file{data.trashedFileCount === 1 ? "" : "s"} still count toward quota
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

