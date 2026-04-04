import { NextResponse } from "next/server";

import { clearShareAccessSession } from "@/lib/sharing/share-access-session";
import { requireShareLinkByToken, ShareServiceError } from "@/lib/sharing/share-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const link = await requireShareLinkByToken(token);

    await clearShareAccessSession(link.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ShareServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Share logout failed", error);
    return NextResponse.json({ error: "Failed to clear share session" }, { status: 500 });
  }
}
