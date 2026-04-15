"use client";

import * as React from "react";
import { EllipsisVertical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALLOWED_IMAGE_TYPES, MAX_PDF_INDEXING_SIZE_BYTES } from "@/lib/constants";
import type { FileListItem } from "@/lib/files/types";

type IndexingJobStatus = "queued" | "processing" | "ready" | "skipped" | "failed";
type IndexingAction = "enqueue" | "retry" | "reindex";
type EmbeddingJobStatusItem = {
  errorCode: string | null;
  errorMessage: string | null;
  modality: "image" | "pdf";
  retryable: boolean;
  status: IndexingJobStatus;
};

type FileActionsMenuProps = {
  file: FileListItem;
  onDelete: (file: FileListItem) => void;
  onMove: (file: FileListItem) => void;
  onRename: (file: FileListItem) => void;
  onShare: (file: FileListItem) => void;
  semanticSearchEnabled: boolean;
};

type IndexingDetails = {
  body: string;
  errorCode: string | null;
  title: string;
};

function getSemanticModality(file: FileListItem) {
  if (file.mimeType === "application/pdf") {
    return file.size <= MAX_PDF_INDEXING_SIZE_BYTES ? "pdf" : null;
  }

  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimeType)) {
    return "image" as const;
  }

  return null;
}

function getIndexingDetails(
  job: EmbeddingJobStatusItem | null,
  statusError: string | null,
): IndexingDetails | null {
  if (statusError) {
    return {
      body: statusError,
      errorCode: null,
      title: "Indexing status unavailable",
    };
  }

  if (!job) {
    return null;
  }

  if (job.status === "failed" && !job.retryable) {
    return {
      body: job.errorMessage ?? "This failure needs a manual re-index instead of a retry.",
      errorCode: job.errorCode,
      title: "Retry unavailable",
    };
  }

  if (job.status === "failed") {
    return {
      body: job.errorMessage ?? "This failure can be retried from here.",
      errorCode: job.errorCode,
      title: "Indexing failed",
    };
  }

  if (job.status === "skipped") {
    return {
      body: job.errorMessage ?? "Indexing was skipped for this file.",
      errorCode: job.errorCode,
      title: "Indexing skipped",
    };
  }

  if (job.status === "processing" || job.status === "queued") {
    return {
      body: job.status === "processing"
        ? "Semantic indexing is running for this file."
        : "Semantic indexing is queued for this file.",
      title: job.status === "processing" ? "Indexing in progress" : "Indexing queued",
    };
  }

  if (job.status === "ready") {
    return {
      body: "Semantic indexing is ready for this file.",
      title: "Indexed",
    };
  }

  return null;
}

function getIndexingSummary(
  job: EmbeddingJobStatusItem | null,
  statusError: string | null,
) {
  if (statusError) {
    return "Status unavailable";
  }

  if (!job) {
    return null;
  }

  if (job.status === "failed" && !job.retryable) {
    return "Retry unavailable";
  }

  if (job.status === "failed") {
    return "Indexing failed";
  }

  if (job.status === "skipped") {
    return "Indexing skipped";
  }

  if (job.status === "processing") {
    return "Indexing in progress";
  }

  if (job.status === "queued") {
    return "Indexing queued";
  }

  if (job.status === "ready") {
    return "Indexed";
  }

  return null;
}

function shouldShowDetailsAction(
  job: EmbeddingJobStatusItem | null,
  statusError: string | null,
) {
  return Boolean(statusError || job?.status === "failed" || job?.status === "skipped");
}

function getActionConfig(
  job: EmbeddingJobStatusItem | null,
  statusError: string | null,
) {
  if (statusError) {
    return null;
  }

  if (!job) {
    return {
      action: "enqueue" as const,
      label: "Index file",
    };
  }

  if (job.status === "failed" && job.retryable) {
    return {
      action: "retry" as const,
      label: "Retry indexing",
    };
  }

  if (job.status === "failed" || job.status === "skipped" || job.status === "ready") {
    return {
      action: "reindex" as const,
      label: "Re-index file",
    };
  }

  return null;
}

export function FileActionsMenu({
  file,
  onDelete,
  onMove,
  onRename,
  onShare,
  semanticSearchEnabled,
}: FileActionsMenuProps) {
  const modality = React.useMemo(() => getSemanticModality(file), [file]);
  const [open, setOpen] = React.useState(false);
  const [isLoadingIndexingStatus, setIsLoadingIndexingStatus] = React.useState(false);
  const [isSubmittingIndexingAction, setIsSubmittingIndexingAction] = React.useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = React.useState(false);
  const [indexingJob, setIndexingJob] = React.useState<EmbeddingJobStatusItem | null>(null);
  const [indexingStatusError, setIndexingStatusError] = React.useState<string | null>(null);

  const indexingDetails = getIndexingDetails(indexingJob, indexingStatusError);
  const indexingSummary = getIndexingSummary(indexingJob, indexingStatusError);
  const indexingAction = getActionConfig(indexingJob, indexingStatusError);
  const showDetailsAction = shouldShowDetailsAction(indexingJob, indexingStatusError);

  const loadIndexingStatus = React.useCallback(async () => {
    if (!semanticSearchEnabled || !modality) {
      setIndexingJob(null);
      setIndexingStatusError(null);
      return;
    }

    setIsLoadingIndexingStatus(true);
    setIndexingStatusError(null);

    try {
      const response = await fetch(`/api/embeddings/${encodeURIComponent(file.id)}`, {
        method: "GET",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message ?? "Failed to load indexing status.");
      }

      const payload = await response.json() as { jobs: EmbeddingJobStatusItem[] };
      setIndexingJob(payload.jobs.find((job) => job.modality === modality) ?? null);
    } catch (error) {
      setIndexingJob(null);
      setIndexingStatusError(error instanceof Error ? error.message : "Failed to load indexing status.");
    } finally {
      setIsLoadingIndexingStatus(false);
    }
  }, [file.id, modality, semanticSearchEnabled]);

  async function triggerIndexing(action: IndexingAction) {
    if (!modality || isSubmittingIndexingAction) {
      return;
    }

    setIsSubmittingIndexingAction(true);

    try {
      const response = await fetch("/api/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          fileId: file.id,
          modality,
        }),
      });

      const payload = await response.json().catch(() => null) as { message?: string; status?: IndexingJobStatus } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Failed to start semantic indexing.");
      }

      toast.success(
        action === "retry"
          ? "Semantic indexing retry queued."
          : action === "reindex"
            ? "Semantic re-index queued."
            : "Semantic indexing queued.",
      );
      setOpen(false);
      await loadIndexingStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start semantic indexing.");
    } finally {
      setIsSubmittingIndexingAction(false);
    }
  }

  function openDetailsDialog() {
    setOpen(false);
    window.setTimeout(() => {
      setIsDetailsDialogOpen(true);
    }, 0);
  }

  return (
    <>
      <DropdownMenu
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);

          if (nextOpen) {
            void loadIndexingStatus();
          }
        }}
        open={open}
      >
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Open actions for ${file.name}`}
            data-testid={`file-actions-${file.id}`}
            data-test-file-name={file.name}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => onShare(file)}>Share</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRename(file)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove(file)}>Move</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              window.location.assign(`/api/files/${file.id}/download`);
            }}
          >
            Download
          </DropdownMenuItem>
          {semanticSearchEnabled && modality ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Semantic indexing</DropdownMenuLabel>
              {isLoadingIndexingStatus ? (
                <DropdownMenuItem disabled>Loading indexing status...</DropdownMenuItem>
              ) : (
                <>
                  {indexingSummary ? (
                    <DropdownMenuItem disabled>{indexingSummary}</DropdownMenuItem>
                  ) : null}
                  {showDetailsAction && indexingDetails ? (
                    <DropdownMenuItem onSelect={() => openDetailsDialog()}>
                      View details
                    </DropdownMenuItem>
                  ) : null}
                  {indexingAction ? (
                    <DropdownMenuItem
                      disabled={isSubmittingIndexingAction}
                      onSelect={() => void triggerIndexing(indexingAction.action)}
                    >
                      {isSubmittingIndexingAction ? "Submitting..." : indexingAction.label}
                    </DropdownMenuItem>
                  ) : null}
                </>
              )}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onDelete(file)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setIsDetailsDialogOpen} open={isDetailsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{indexingDetails?.title ?? "Semantic indexing"}</DialogTitle>
            <DialogDescription>
              Review the latest indexing status for {file.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {indexingDetails?.errorCode ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Error code
                </p>
                <p className="text-sm font-medium text-foreground">{indexingDetails.errorCode}</p>
              </div>
            ) : null}

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Details
              </p>
              <div className="max-h-60 overflow-y-auto border border-border/70 bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">
                <p className="break-words whitespace-pre-wrap">
                  {indexingDetails?.body ?? "No indexing details are available right now."}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setIsDetailsDialogOpen(false)} type="button" variant="outline">
              Close
            </Button>
            {indexingAction ? (
              <Button
                disabled={isSubmittingIndexingAction}
                onClick={() => void triggerIndexing(indexingAction.action)}
                type="button"
              >
                {isSubmittingIndexingAction ? "Submitting..." : indexingAction.label}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
