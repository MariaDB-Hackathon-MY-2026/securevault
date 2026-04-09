"use client";

import Link from "next/link";
import { ArrowRight, FolderOpen, Trash2 } from "lucide-react";

import { StorageBreakdownCard } from "@/components/files/storage-breakdown-card";
import { StorageOverviewCard } from "@/components/files/storage-overview-card";
import { LargestFilesCard } from "@/components/files/largest-files-card";
import { Button } from "@/components/ui/button";
import { useStorageDashboardQuery } from "@/hooks/use-storage-dashboard-query";
import type { FolderListItem, StorageDashboardData } from "@/lib/files/types";

type StorageDashboardPageContentProps = {
  folders: FolderListItem[];
  initialStorageDashboard: StorageDashboardData;
};

type StorageHeroStatProps = {
  label: string;
  value: string;
  detail: string;
};

function StorageHeroStat({ label, value, detail }: StorageHeroStatProps) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export function StorageDashboardPageContent({
  folders,
  initialStorageDashboard,
}: StorageDashboardPageContentProps) {
  const { data: storageDashboard = initialStorageDashboard, isFetching } =
    useStorageDashboardQuery(initialStorageDashboard);

  return (
    <div className="grid gap-6">
      <section className="overflow-hidden border border-border/60 bg-background">
        <div className="grid gap-6 p-6 lg:p-8 min-[1700px]:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.95fr)]">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Storage</p>
            <h2 className="mt-3 text-3xl font-semibold">A clearer view of what your vault is holding</h2>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Review quota usage, spot heavy file categories, and find the biggest cleanup targets
              without mixing those signals into the file explorer itself.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/files">
                  <FolderOpen className="size-4" />
                  Open files
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/trash">
                  <Trash2 className="size-4" />
                  Review trash
                </Link>
              </Button>
            </div>
          </div>

          <div className="border border-border/60 min-[1700px]:hidden">
            <div className="grid divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <StorageHeroStat
                detail={`${storageDashboard.quotaUsedBytes.toLocaleString()} of ${storageDashboard.quotaBytes.toLocaleString()} bytes`}
                label="Quota used"
                value={`${storageDashboard.usagePercent}%`}
              />
              <StorageHeroStat
                detail="Ready files currently in your library"
                label="Active files"
                value={String(storageDashboard.activeFileCount)}
              />
              <StorageHeroStat
                detail="Ready files still counting toward quota"
                label="Trash pressure"
                value={String(storageDashboard.trashedFileCount)}
              />
            </div>
          </div>

          <div className="hidden min-[1700px]:grid min-[1700px]:gap-3">
            <div className="border border-border/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quota used</p>
              <p className="mt-3 text-2xl font-semibold">{storageDashboard.usagePercent}%</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {storageDashboard.quotaUsedBytes.toLocaleString()} of {storageDashboard.quotaBytes.toLocaleString()} bytes
              </p>
            </div>
            <div className="border border-border/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Active files</p>
              <p className="mt-3 text-2xl font-semibold">{storageDashboard.activeFileCount}</p>
              <p className="mt-1 text-sm text-muted-foreground">Ready files currently in your library</p>
            </div>
            <div className="border border-border/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Trash pressure</p>
              <p className="mt-3 text-2xl font-semibold">{storageDashboard.trashedFileCount}</p>
              <p className="mt-1 text-sm text-muted-foreground">Ready files still counting toward quota</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <StorageOverviewCard data={storageDashboard} isFetching={isFetching} />
        <StorageBreakdownCard data={storageDashboard} />
      </div>

      <LargestFilesCard files={storageDashboard.largestFiles} folders={folders} />

      <div className="flex items-center justify-between border border-border/60 bg-muted/20 px-4 py-3 text-sm">
        <div className="text-muted-foreground">
          Need to take action on files directly? Jump back into the library and keep uploads where they belong.
        </div>
        <Button asChild variant="ghost">
          <Link href="/files">
            Go to files
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
