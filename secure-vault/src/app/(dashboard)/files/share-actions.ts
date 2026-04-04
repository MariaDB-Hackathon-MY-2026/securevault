"use server";

import { requireVerifiedUser } from "@/lib/auth/get-current-user";
import {
  createShareLink,
  getShareLinkForOwnerById,
  revokeShareLink,
  updateShareLinkSettings,
} from "@/lib/sharing/share-service";
import { revalidatePath } from "next/cache";

export async function createShareLinkAction(input: {
  fileId?: string;
  folderId?: string;
  expiresAt: Date | null;
  maxDownloads: number | null;
  allowedEmails: string[];
}) {
  const user = await requireVerifiedUser();

  const result = await createShareLink({
    createdBy: user.id,
    ...input,
  });

  revalidatePath("/files");
  return { success: true, link: result };
}

export async function revokeShareLinkAction(linkId: string) {
  const user = await requireVerifiedUser();
  const link = await getShareLinkForOwnerById({ id: linkId, ownerId: user.id });

  await revokeShareLink({
    ownerId: user.id,
    id: linkId,
  });

  revalidatePath("/files");
  revalidatePath(`/s/${link.token}`);
  return { success: true };
}

export async function updateShareLinkSettingsAction(input: {
  allowedEmails: string[];
  linkId: string;
  maxDownloads: number | null;
}) {
  const user = await requireVerifiedUser();

  const link = await updateShareLinkSettings({
    allowedEmails: input.allowedEmails,
    id: input.linkId,
    maxDownloads: input.maxDownloads,
    ownerId: user.id,
  });

  revalidatePath("/files");
  revalidatePath(`/s/${link.token}`);
  return { success: true, link };
}
