import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { searchFilesByFilename } from "@/lib/search/filename-search";

const DEFAULT_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;

function parseLimit(rawLimit: string | null) {
  if (!rawLimit) {
    return DEFAULT_LIMIT;
  }

  const parsedLimit = Number.parseInt(rawLimit, 10);
  return Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    if (!query) {
      return NextResponse.json({ message: "Query is required" }, { status: 400 });
    }

    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json(
        { message: "Query must be at least 2 characters" },
        { status: 400 },
      );
    }

    const results = await searchFilesByFilename({
      limit: parseLimit(searchParams.get("limit")),
      query,
      userId: user.id,
    });

    return NextResponse.json({ query, results });
  } catch (error) {
    console.error("Failed to search files by filename", error);
    return NextResponse.json({ message: "Failed to search files" }, { status: 500 });
  }
}
