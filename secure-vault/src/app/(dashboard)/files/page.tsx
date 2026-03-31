import { FilesPageContent } from "@/components/files/files-page-content";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { listReadyFilesForUser } from "@/lib/files/download-service";

export default async function FilesPage() {
  const user = await getCurrentUser();
  const readyFiles = user ? await listReadyFilesForUser(user.id) : [];

  return <FilesPageContent files={readyFiles} user={user} />;
}
