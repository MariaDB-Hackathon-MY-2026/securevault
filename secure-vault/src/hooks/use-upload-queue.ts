"use client";

import * as React from "react";

import {
  UploadQueueContext,
  type UploadQueueContextValue,
} from "@/components/upload/upload-provider";

export function useUploadQueue(): UploadQueueContextValue {
  const context = React.useContext(UploadQueueContext);

  if (!context) {
    throw new Error("useUploadQueue must be used within an UploadQueueProvider");
  }

  return context;
}
