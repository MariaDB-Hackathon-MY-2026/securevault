import { FilesPageContent } from "@/components/files/files-page-content";
import {
  listFoldersForUser,
  listReadyFilesForUser,
} from "@/app/api/files/service";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getSemanticConfig } from "@/lib/ai/config";

export default async function FilesPage() {
  const user = await getCurrentUser();
  let semanticSearchEnabled = false;

  try {
    semanticSearchEnabled = getSemanticConfig().enabled;
  } catch {
    semanticSearchEnabled = false;
  }

  const [readyFiles, folders] = user
    ? await Promise.all([
        listReadyFilesForUser(user.id),
        listFoldersForUser(user.id),
      ])
    : [[], []];

  return (
    <FilesPageContent
      canUpload={Boolean(user?.email_verified)}
      emailVerified={Boolean(user?.email_verified)}
      files={readyFiles}
      folders={folders}
      semanticSearchEnabled={semanticSearchEnabled}
    />
  );
}
