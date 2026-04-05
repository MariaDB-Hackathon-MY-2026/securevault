import { listTrashForUser } from "@/app/api/files/service";
import { TrashPageContent } from "@/components/trash/trash-page-content";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export default async function TrashPage() {
  const user = await getCurrentUser();
  const initialData = user
    ? await listTrashForUser(user.id)
    : {
        items: [],
        summary: {
          rootFileCount: 0,
          rootFolderCount: 0,
          totalRootItemCount: 0,
        },
      };

  return <TrashPageContent initialData={initialData} />;
}
