import { NextResponse } from "next/server";

import {
  listFoldersForUser,
  listReadyFilesForUser,
} from "@/app/api/files/service";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const [files, folders] = await Promise.all([
      listReadyFilesForUser(user.id),
      listFoldersForUser(user.id),
    ]);

    return NextResponse.json({ files, folders });
  } catch (error) {
    console.error("Failed to load file explorer data", error);
    return NextResponse.json({ message: "Failed to load file explorer data" }, { status: 500 });
  }
}
