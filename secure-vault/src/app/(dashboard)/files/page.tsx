import { FilesPageContent } from "@/components/files/files-page-content";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export default async function FilesPage() {
  const user = await getCurrentUser();

  return <FilesPageContent user={user} />;
}
