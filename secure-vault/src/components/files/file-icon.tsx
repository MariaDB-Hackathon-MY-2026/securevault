"use client";

import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  FolderClosed,
} from "lucide-react";

import { cn } from "@/lib/utils";

type FileIconProps = {
  className?: string;
  isFolder?: boolean;
  mimeType?: string;
};

export function FileIcon({
  className,
  isFolder = false,
  mimeType,
}: FileIconProps) {
  if (isFolder) {
    return <FolderClosed className={cn("size-5 text-amber-500", className)} />;
  }

  if (!mimeType) {
    return <File className={cn("size-5 text-muted-foreground", className)} />;
  }

  if (mimeType.startsWith("image/")) {
    return <FileImage className={cn("size-5 text-sky-500", className)} />;
  }

  if (mimeType.startsWith("audio/")) {
    return <FileAudio className={cn("size-5 text-violet-500", className)} />;
  }

  if (mimeType.startsWith("video/")) {
    return <FileVideo className={cn("size-5 text-rose-500", className)} />;
  }

  if (
    mimeType === "application/pdf" ||
    mimeType.includes("text") ||
    mimeType.includes("json")
  ) {
    return <FileText className={cn("size-5 text-emerald-500", className)} />;
  }

  if (
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    mimeType.includes("archive")
  ) {
    return <FileArchive className={cn("size-5 text-orange-500", className)} />;
  }

  return <File className={cn("size-5 text-muted-foreground", className)} />;
}
