import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { listShareLinksForOwner } from "@/lib/sharing/share-service";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.email_verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("fileId") || undefined;
  const folderId = searchParams.get("folderId") || undefined;

  if (fileId && folderId) {
    return NextResponse.json({ error: "Cannot query both a file and a folder" }, { status: 400 });
  }
  if (!fileId && !folderId) {
    return NextResponse.json({ error: "Must specify either a fileId or folderId" }, { status: 400 });
  }

  try {
    const links = await listShareLinksForOwner({
      ownerId: user.id,
      fileId,
      folderId,
    });

    return NextResponse.json(links);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
