import { FilesPageContent } from "@/components/files/files-page-content";
import { listReadyFilesForUser } from "@/app/api/files/service";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export default async function FilesPage() {
  const user = await getCurrentUser();
  const readyFiles = user ? await listReadyFilesForUser(user.id) : [];

  return <FilesPageContent files={readyFiles} user={user} />;
}
