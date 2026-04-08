import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFilenameSearchQuery } from "@/hooks/use-filename-search-query";
import {
  fetchFilenameSearch,
  filenameSearchQueryKey,
} from "@/lib/search/filename-search-query";

function SearchProbe({
  query,
}: {
  query: string;
}) {
  const result = useFilenameSearchQuery({ query });

  return (
    <output data-testid="search-probe">
      {result.error instanceof Error
        ? result.error.name
        : result.data?.query ?? (result.fetchStatus === "idle" ? "idle" : "loading")}
    </output>
  );
}

describe("filename search query", () => {
  const fetchMock = vi.fn<typeof fetch>();

  function createQueryClient() {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses a normalized query key", () => {
    expect(filenameSearchQueryKey("report")).toEqual(["filename-search", "report"]);
  });

  it("does not issue requests for short filename queries", async () => {
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <>
          <SearchProbe query="" />
          <SearchProbe query="r" />
        </>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("search-probe")).toHaveLength(2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes the query before fetching and exposes the response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ query: "report", results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <SearchProbe query="  Report  " />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("search-probe").textContent).toBe("report");
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/search/files?q=report", {
      credentials: "same-origin",
    });
  });

  it("throws AuthError on 401 responses", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid credentials" }), { status: 401 }),
    );

    await expect(fetchFilenameSearch("report")).rejects.toMatchObject({
      name: "AuthError",
    });
  });
});
