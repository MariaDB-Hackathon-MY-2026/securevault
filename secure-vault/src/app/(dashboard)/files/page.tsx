import { FilesPageContent } from "@/components/files/files-page-content";
import {
  listFoldersForUser,
  listReadyFilesForUser,
} from "@/app/api/files/service";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  createEmptyStorageDashboardData,
  getStorageDashboardData,
} from "@/lib/files/storage-dashboard";

export default async function FilesPage() {
  const user = await getCurrentUser();
  const [readyFiles, folders, storageDashboard] = user
    ? await Promise.all([
        listReadyFilesForUser(user.id),
        listFoldersForUser(user.id),
        getStorageDashboardData(user),
      ])
    : [[], [], createEmptyStorageDashboardData()];

  return (
    <FilesPageContent
      canUpload={Boolean(user?.email_verified)}
      emailVerified={Boolean(user?.email_verified)}
      files={readyFiles}
      folders={folders}
      initialStorageDashboard={storageDashboard}
    />
  );
}
