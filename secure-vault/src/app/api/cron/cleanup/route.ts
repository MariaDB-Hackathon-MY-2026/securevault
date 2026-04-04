import { NextResponse } from "next/server";

import { cleanupExpiredUploads, purgeExpiredTrash } from "@/app/api/files/service";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || !authorization) {
    return false;
  }

  return authorization === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [trash, uploads] = await Promise.all([
      purgeExpiredTrash(),
      cleanupExpiredUploads(),
    ]);

    return NextResponse.json({ trash, uploads });
  } catch (error) {
    console.error("Cleanup cron failed", error);
    return NextResponse.json({ message: "Cleanup cron failed" }, { status: 500 });
  }
}
