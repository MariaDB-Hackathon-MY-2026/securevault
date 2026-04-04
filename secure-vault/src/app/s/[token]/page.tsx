import { notFound } from "next/navigation";

import { ShareAuthView } from "@/components/share/share-auth-view";
import { SharedFileView } from "@/components/share/shared-file-view";
import { SharedFolderView } from "@/components/share/shared-folder-view";
import { requireValidShareAccessSession } from "@/lib/sharing/share-access-session";
import {
  assertShareLinkAccessible,
  requireSharedFileSummary,
  requireShareLinkByToken,
  ShareServiceError,
} from "@/lib/sharing/share-service";

export const dynamic = "force-dynamic";

function ExpiredState() {
  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-2xl font-bold">Link Expired</h1>
        <p className="text-muted-foreground">
          This share link has expired and is no longer accessible.
        </p>
      </div>
    </div>
  );
}

export default async function SharedLinkPage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const link = await requireShareLinkByToken(token);
    assertShareLinkAccessible(link);

    let sessionEmail: string | null = null;

    if (!link.is_public && link.allowedEmails.length > 0) {
      const session = await requireValidShareAccessSession({ linkId: link.id, token });

      if (!session) {
        return <ShareAuthView token={token} />;
      }

      sessionEmail = session.email;
    }

    if (link.targetType === "file") {
      const file = await requireSharedFileSummary({
        fileId: link.targetId,
        ownerId: link.created_by,
      });

      return (
        <SharedFileView
          email={sessionEmail}
          fileId={file.id}
          fileName={file.name}
          mimeType={file.mimeType}
          token={token}
        />
      );
    }

    return <SharedFolderView token={token} email={sessionEmail} rootFolderId={link.targetId} />;
  } catch (error) {
    if (error instanceof ShareServiceError) {
      if (error.code === "NOT_FOUND") {
        notFound();
      }

      if (error.code === "EXPIRED") {
        return <ExpiredState />;
      }
    }

    throw error;
  }
}
