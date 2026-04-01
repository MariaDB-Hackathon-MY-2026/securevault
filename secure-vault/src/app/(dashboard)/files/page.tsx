import { FilesPageContent } from "@/components/files/files-page-content";
import {
  getStorageUsage,
  listFoldersForUser,
  listReadyFilesForUser,
} from "@/app/api/files/service";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export default async function FilesPage() {
  const user = await getCurrentUser();
  const [readyFiles, folders, storageUsage] = user
    ? await Promise.all([
        listReadyFilesForUser(user.id),
        listFoldersForUser(user.id),
        getStorageUsage(user.id),
      ])
    : [[], [], { fileCount: 0, totalBytes: 0 }];

  return (
    <FilesPageContent
      files={readyFiles}
      folders={folders}
      storageUsage={storageUsage}
      user={user}
    />
  );
}
