import { NextResponse } from "next/server";

import { listTrashForUser } from "@/app/api/files/service";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const trash = await listTrashForUser(user.id);
    return NextResponse.json(trash);
  } catch (error) {
    console.error("Failed to load trash data", error);
    return NextResponse.json({ message: "Failed to load trash data" }, { status: 500 });
  }
}
