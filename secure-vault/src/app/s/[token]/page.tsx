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
  let sessionEmail: string | null = null;
  let view:
    | { kind: "auth" }
    | { kind: "expired" }
    | { kind: "file"; fileId: string; fileName: string; mimeType: string }
    | { kind: "folder"; rootFolderId: string };

  try {
    const link = await requireShareLinkByToken(token);
    assertShareLinkAccessible(link);

    if (!link.is_public && link.allowedEmails.length > 0) {
      const session = await requireValidShareAccessSession({ linkId: link.id, token });

      if (!session) {
        view = { kind: "auth" };
      } else {
        sessionEmail = session.email;
      }
    }

    if (!view && link.targetType === "file") {
      const file = await requireSharedFileSummary({
        fileId: link.targetId,
        ownerId: link.created_by,
      });

      view = {
        kind: "file",
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
      };
    } else if (!view) {
      view = { kind: "folder", rootFolderId: link.targetId };
    }
  } catch (error) {
    if (error instanceof ShareServiceError) {
      if (error.code === "NOT_FOUND") {
        notFound();
      }

      if (error.code === "EXPIRED") {
        view = { kind: "expired" };
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  if (!view || view.kind === "auth") {
    return <ShareAuthView token={token} />;
  }

  if (view.kind === "expired") {
    return <ExpiredState />;
  }

  if (view.kind === "file") {
    return (
      <SharedFileView
        email={sessionEmail}
        fileId={view.fileId}
        fileName={view.fileName}
        mimeType={view.mimeType}
        token={token}
      />
    );
  }

  return <SharedFolderView token={token} email={sessionEmail} rootFolderId={view.rootFolderId} />;
}
