"use client";

import * as React from "react";
import { Eye } from "lucide-react";
import Image from "next/image";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { FileListItem } from "@/lib/files/types";
import { canPreviewMime } from "@/lib/files/preview";

type FilePreviewProps = {
  file: FileListItem;
};

export function FilePreview({ file }: FilePreviewProps) {
  if (!canPreviewMime(file.mimeType)) {
    return (
      <Button disabled size="sm" type="button" variant="ghost">
        <Eye className="mr-1" />
        Preview unavailable
      </Button>
    );
  }

  const previewUrl = `/api/files/${file.id}/preview`;
  const isPdf = file.mimeType === "application/pdf";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="ghost">
          <Eye className="mr-1" />
          Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader className="flex-row items-start justify-between gap-4">
          <div>
            <DialogTitle>{file.name}</DialogTitle>
            <DialogDescription>{file.mimeType}</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button aria-label="Close preview" size="icon" type="button" variant="ghost">
              <X className="size-4" />
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-hidden rounded-lg border border-border bg-muted/20">
          {isPdf ? (
            <iframe
              className="h-[75vh] w-full"
              src={previewUrl}
              title={`Preview of ${file.name}`}
            />
          ) : (
            <div className="relative h-[75vh] w-full">
              <Image
                alt={file.name}
                className="object-contain"
                fill
                sizes="100vw"
                src={previewUrl}
                unoptimized
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
