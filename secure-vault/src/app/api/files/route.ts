import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { listReadyFilesForUser } from "@/app/api/files/service";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const files = await listReadyFilesForUser(user.id);
    return NextResponse.json({ files });
  } catch (error) {
    console.error("Failed to list files", error);
    return NextResponse.json({ message: "Failed to load files" }, { status: 500 });
  }
}
