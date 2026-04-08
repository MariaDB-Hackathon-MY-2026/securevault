import { listFoldersForUser } from "@/app/api/files/service";
import { StorageDashboardPageContent } from "@/components/storage/storage-dashboard-page-content";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  createEmptyStorageDashboardData,
  getStorageDashboardData,
} from "@/lib/files/storage-dashboard";

export default async function StoragePage() {
  const user = await getCurrentUser();
  const [folders, storageDashboard] = user
    ? await Promise.all([
        listFoldersForUser(user.id),
        getStorageDashboardData(user),
      ])
    : [[], createEmptyStorageDashboardData()];

  return (
    <StorageDashboardPageContent
      folders={folders}
      initialStorageDashboard={storageDashboard}
    />
  );
}
