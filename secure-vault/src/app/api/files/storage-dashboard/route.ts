import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getStorageDashboardData } from "@/lib/files/storage-dashboard";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const dashboard = await getStorageDashboardData(user);
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("Failed to load storage dashboard", error);
    return NextResponse.json({ message: "Failed to load storage dashboard" }, { status: 500 });
  }
}
