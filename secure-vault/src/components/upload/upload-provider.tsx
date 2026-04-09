"use client";

import * as React from "react";
import { QueryClientContext } from "@tanstack/react-query";

import type { UploadJobSnapshot } from "@/lib/upload/upload-job";
import {
  UploadManager,
  type UploadManagerSnapshot,
} from "@/lib/upload/upload-manager";
import { currentUserQueryKey } from "@/lib/auth/current-user-client";
import { filesExplorerQueryKey } from "@/lib/files/files-explorer-query";
import { storageDashboardQueryKey } from "@/lib/files/storage-dashboard-query";

export type UploadQueueContextValue = {
  uploads: UploadJobSnapshot[];
  addFiles: (files: File[]) => void;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  removeUpload: (id: string) => void;
};

export const UploadQueueContext = React.createContext<UploadQueueContextValue | null>(null);

export function UploadQueueProvider({ children }: React.PropsWithChildren) {
  const [manager] = React.useState(() => UploadManager.getInstance());
  const queryClient = React.useContext(QueryClientContext);
  const snapshotRef = React.useRef<UploadManagerSnapshot>(manager.getSnapshot());
  const successfulUploadIdsRef = React.useRef<Set<string>>(new Set());

  const subscribe = React.useCallback((onStoreChange: () => void) => {
    // Refresh once on subscribe so React does not miss mutations that land
    // between the render phase snapshot read and subscription setup.
    snapshotRef.current = manager.getSnapshot();

    return manager.subscribe((nextSnapshot) => {
      snapshotRef.current = nextSnapshot;
      onStoreChange();
    });
  }, [manager]);

  const getSnapshot = React.useCallback(() => snapshotRef.current, []);
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  React.useEffect(() => {
    const nextSuccessfulIds = new Set(
      snapshot.uploads
        .filter((upload) => upload.status === "success")
        .map((upload) => upload.id),
    );

    let shouldInvalidateFiles = false;

    for (const uploadId of nextSuccessfulIds) {
      if (!successfulUploadIdsRef.current.has(uploadId)) {
        shouldInvalidateFiles = true;
        break;
      }
    }

    successfulUploadIdsRef.current = nextSuccessfulIds;

    if (shouldInvalidateFiles && queryClient) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: filesExplorerQueryKey }),
        queryClient.invalidateQueries({ queryKey: storageDashboardQueryKey }),
        queryClient.invalidateQueries({ queryKey: currentUserQueryKey }),
      ]);
    }
  }, [queryClient, snapshot.uploads]);

  const addFiles = React.useCallback((files: File[]) => {
    manager.addFiles(files);
  }, [manager]);

  const pauseUpload = React.useCallback((id: string) => {
    manager.pauseUpload(id);
  }, [manager]);

  const resumeUpload = React.useCallback((id: string) => {
    manager.resumeUpload(id);
  }, [manager]);

  const cancelUpload = React.useCallback((id: string) => {
    manager.cancelUpload(id);
  }, [manager]);

  const removeUpload = React.useCallback((id: string) => {
    manager.removeUpload(id);
  }, [manager]);

  const value = React.useMemo<UploadQueueContextValue>(() => ({
    uploads: snapshot.uploads,
    addFiles,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    removeUpload,
  }), [addFiles, cancelUpload, pauseUpload, removeUpload, resumeUpload, snapshot.uploads]);

  return (
    <UploadQueueContext.Provider value={value}>
      {children}
    </UploadQueueContext.Provider>
  );
}
