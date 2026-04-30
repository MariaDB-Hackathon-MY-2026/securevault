"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileIcon, FolderIcon } from "lucide-react";

import { formatExplorerDate, formatFileSize } from "@/components/files/file-browser-utils";
import { Button } from "@/components/ui/button";
import { SharedInspectionDeterrent } from "@/components/share/shared-inspection-deterrent";
import { SharedDownloadButton } from "@/components/share/shared-download-button";
import { SharedFileView } from "@/components/share/shared-file-view";
import { ShareLogoutButton } from "@/components/share/share-logout-button";

type SharedFolderResponse = {
  breadcrumb: Array<{ id: string; name: string }>;
  currentFolder: { id: string; name: string };
  files: Array<{
    id: string;
    mimeType: string;
    name: string;
    size: number;
    updatedAt: string;
  }>;
  folders: Array<{
    id: string;
    name: string;
    updatedAt: string;
  }>;
};

export function SharedFolderView({
  email,
  rootFolderId,
  token,
}: {
  email: string | null;
  rootFolderId: string;
  token: string;
}) {
  const [currentFolderId, setCurrentFolderId] = React.useState(rootFolderId);
  const [viewingFile, setViewingFile] = React.useState<SharedFolderResponse["files"][number] | null>(null);

  const { data, isLoading } = useQuery<SharedFolderResponse>({
    queryKey: ["shared-folder", token, currentFolderId],
    queryFn: async () => {
      const response = await fetch(
        `/api/share/${token}/folder?folderId=${encodeURIComponent(currentFolderId)}`,
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load folder");
      }

      return await response.json() as SharedFolderResponse;
    },
  });

  if (viewingFile) {
    return (
      <div className="flex h-screen min-h-0 w-full flex-col">
        <div className="border-b p-2">
          <Button onClick={() => setViewingFile(null)} variant="ghost">
            Back to directory
          </Button>
        </div>
        <SharedFileView
          embedded
          email={email}
          fileId={viewingFile.id}
          fileName={viewingFile.name}
          mimeType={viewingFile.mimeType}
          token={token}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-muted/20">
      <SharedInspectionDeterrent />
      <header className="flex h-14 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-2 font-medium">
          <FolderIcon className="size-5 text-muted-foreground" />
          Secure Shared Folder
        </div>
        <div className="hidden items-center gap-2 border-l pl-4 opacity-75 sm:flex">
          {email ? <span className="text-sm">Verified as {email}</span> : null}
        </div>
        {email ? <ShareLogoutButton token={token} /> : null}
      </header>

      <main className="flex-1 overflow-auto p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {data?.breadcrumb.map((item, index) => (
            <React.Fragment key={item.id}>
              <button
                className="transition-colors hover:text-foreground"
                data-testid={`shared-breadcrumb-${item.id}`}
                onClick={() => setCurrentFolderId(item.id)}
                type="button"
              >
                {item.name}
              </button>
              {index < data.breadcrumb.length - 1 ? <ChevronRight className="size-4" /> : null}
            </React.Fragment>
          ))}
        </div>

        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="relative h-full w-full overflow-hidden rounded-lg border bg-background">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Size</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Modified</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.folders.map((folder) => (
                  <tr
                    className="cursor-pointer border-b hover:bg-muted/20"
                    data-testid={`shared-folder-row-${folder.id}`}
                    key={folder.id}
                    onClick={() => setCurrentFolderId(folder.id)}
                  >
                    <td className="flex items-center gap-2 px-4 py-3">
                      <FolderIcon className="size-4 text-amber-500/70" />
                      {folder.name}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">-</td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {formatExplorerDate(folder.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right" />
                  </tr>
                ))}

                {data?.files.map((file) => (
                  <tr className="border-b hover:bg-muted/20" key={file.id}>
                    <td
                      className="cursor-pointer px-4 py-3"
                      data-testid={`shared-file-row-${file.id}`}
                      onClick={() => setViewingFile(file)}
                    >
                      <div className="flex items-center gap-2">
                        <FileIcon className="size-4 text-muted-foreground" />
                        {file.name}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{formatFileSize(file.size)}</td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {formatExplorerDate(file.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end">
                        <SharedDownloadButton
                          fileName={file.name}
                          href={`/api/share/${token}/download?fileId=${file.id}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}

                {data && data.folders.length === 0 && data.files.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                      This folder is empty
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
