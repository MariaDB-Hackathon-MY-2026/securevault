"use client";

import { formatFileSize } from "@/components/files/file-browser-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StorageBreakdownItem, StorageDashboardData } from "@/lib/files/types";

type StorageBreakdownCardProps = {
  data: StorageDashboardData;
};

function getCategoryLabel(category: StorageBreakdownItem["category"]) {
  switch (category) {
    case "documents":
      return "Documents";
    case "images":
      return "Images";
    case "videos":
      return "Videos";
    case "audio":
      return "Audio";
    case "archives":
      return "Archives";
    default:
      return "Other";
  }
}

export function StorageBreakdownCard({ data }: StorageBreakdownCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Category breakdown</CardTitle>
        <CardDescription>Active ready files grouped by file type.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.breakdown.map((item) => (
            <div
              className="flex items-center justify-between gap-4 rounded-lg border border-border/70 px-3 py-2"
              key={item.category}
            >
              <div>
                <p className="font-medium">{getCategoryLabel(item.category)}</p>
                <p className="text-sm text-muted-foreground">
                  {item.fileCount} file{item.fileCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatFileSize(item.bytes)}</p>
                <p className="text-sm text-muted-foreground">{item.percentOfActiveBytes}% of active bytes</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
