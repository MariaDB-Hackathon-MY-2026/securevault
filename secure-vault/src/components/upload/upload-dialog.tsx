"use client";

import * as React from "react";
import { UploadCloud, FileIcon, Play, Pause, X, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadQueueContext } from "@/components/upload/upload-provider";
import { ALLOWED_FILE_INPUT_ACCEPT, isAllowedFileType } from "@/lib/constants";
import type { UploadJobSnapshot } from "@/lib/upload/upload-job";

export function UploadDialog({ children }: { children?: React.ReactNode }) {
  const context = React.useContext(UploadQueueContext);
  if (!context) throw new Error("UploadDialog must be used within UploadQueueProvider");

  const { uploads, addFiles, pauseUpload, resumeUpload, cancelUpload, removeUpload } = context;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files).filter((file) => isAllowedFileType(file.type)));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files).filter((file) => isAllowedFileType(file.type)));
      e.target.value = "";
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getIndexingLabel = (job: UploadJobSnapshot) => {
    if (job.indexingStatus === "idle" || job.indexingStatus === "skipped") {
      return null;
    }

    if (job.indexingStatus === "pending") {
      return "Semantic indexing queued";
    }

    if (job.indexingStatus === "complete") {
      return "Semantic indexing triggered";
    }

    return job.indexingError ?? "Semantic indexing unavailable";
  };

  const getFriendlyErrorLabel = (job: UploadJobSnapshot) => {
    const errorMessage = job.error?.trim();

    if (!errorMessage) {
      return "Upload failed";
    }

    if (errorMessage.includes("is not allowed")) {
      return "This file type is not supported for upload";
    }

    if (errorMessage.includes("Unsupported or unrecognized file type")) {
      return "We couldn't recognize this file type";
    }

    if (errorMessage.includes("Payload Too Large") || errorMessage.includes("too large")) {
      return "This file is too large to upload";
    }

    if (errorMessage.includes("Too many requests")) {
      return "Uploads are being rate limited right now";
    }

    if (errorMessage.includes("Invalid credentials")) {
      return "Your session expired. Please sign in again";
    }

    return errorMessage;
  };

  const getStatusLabel = (job: UploadJobSnapshot) => {
    if (job.status === "waiting_for_slot") {
      return "Waiting for slot";
    }

    return job.status.replaceAll("_", " ");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (open && !nextOpen) {
      uploads
        .filter((job) => job.status === "success")
        .forEach((job) => {
          removeUpload(job.id);
        });
    }

    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <UploadCloud className="w-4 h-4 mr-2" />
            Upload files
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="h-dvh max-w-none rounded-none p-4 sm:h-auto sm:max-w-2xl sm:rounded-lg sm:p-6">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription className="sr-only">
            Select or drag and drop files to encrypt and upload to your vault.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`mt-4 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
            isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/30 hover:bg-muted/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <UploadCloud className="w-10 h-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium">Click to select files or drag them here</p>
          <p className="text-xs text-muted-foreground mt-1">Files are encrypted entirely on your device before uploading</p>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Supported file types: PDF, JPG, PNG, WebP, GIF, AVIF
          </p>
        </div>
        <input
          type="file"
          multiple
          accept={ALLOWED_FILE_INPUT_ACCEPT}
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileSelect}
        />

        {uploads.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-medium mb-3">Upload Queue ({uploads.length})</h4>
            <div className="max-h-[350px] overflow-y-auto space-y-3 pr-2">
              {uploads.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col gap-2 p-3 border rounded-md text-sm"
                  data-testid={`upload-row-${job.id}`}
                  data-test-file-name={job.file.name}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="truncate font-medium">{job.file.name}</div>
                      <div className="text-xs text-muted-foreground shrink-0">{formatSize(job.file.size)}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-4">
                      {job.status === "uploading" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`Pause upload ${job.file.name}`}
                          title={`Pause upload ${job.file.name}`}
                          onClick={() => pauseUpload(job.id)}
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {(job.status === "paused" || job.status === "failed") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`Resume upload ${job.file.name}`}
                          title={`Resume upload ${job.file.name}`}
                          onClick={() => resumeUpload(job.id)}
                        >
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {(
                        job.status === "queued"
                        || job.status === "uploading"
                        || job.status === "waiting_for_slot"
                        || job.status === "pausing"
                        || job.status === "paused"
                      ) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`Cancel upload ${job.file.name}`}
                          title={`Cancel upload ${job.file.name}`}
                          onClick={() => cancelUpload(job.id)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {(job.status === "success" || job.status === "failed" || job.status === "cancelled") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label={`Remove upload ${job.file.name}`}
                          title={`Remove upload ${job.file.name}`}
                          onClick={() => removeUpload(job.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Progress value={job.progress} className="h-1.5" />
                    </div>
                    <div className="w-24 text-xs text-right truncate text-muted-foreground capitalize">
                      {job.status === "success" && <span className="text-emerald-500 flex items-center justify-end gap-1"><CheckCircle2 className="w-3 h-3"/> Done</span>}
                      {job.status === "failed" && <span className=" text-destructive text-center flex items-center justify-end gap-1" title={job.error || "Failed"}><AlertCircle className="w-3 h-3"/> Error</span>}
                      {job.status !== "success" && job.status !== "failed" && getStatusLabel(job)}
                    </div>
                  </div>
                  {job.status === "waiting_for_slot" ? (
                    <p className="text-xs text-muted-foreground">
                      Waiting for an upload slot
                    </p>
                  ) : null}
                  {job.status === "failed" ? (
                    <p
                      className="text-xs text-destructive"
                      title={job.error || undefined}
                    >
                      {getFriendlyErrorLabel(job)}
                    </p>
                  ) : null}
                  {job.status === "success" && getIndexingLabel(job) ? (
                    <p className="text-xs text-muted-foreground">
                      {getIndexingLabel(job)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
