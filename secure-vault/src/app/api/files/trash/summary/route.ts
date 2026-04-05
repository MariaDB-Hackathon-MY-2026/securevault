import { NextResponse } from "next/server";

import { getTrashSummary } from "@/app/api/files/service";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const summary = await getTrashSummary(user.id);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Failed to load trash summary", error);
    return NextResponse.json({ message: "Failed to load trash summary" }, { status: 500 });
  }
}
