// Phase 19 will extend this union with semantic search without changing the
// existing filter-vs-filename UI contract.
export type SearchMode = "filter" | "filename";

export type SearchResultFolderPathItem = {
  id: string;
  name: string;
};

export type FilenameSearchResult = {
  folderId: string | null;
  folderPath: SearchResultFolderPathItem[];
  id: string;
  isInRoot: boolean;
  mimeType: string;
  name: string;
  size: number;
  updatedAt: string;
};

export type FilenameSearchResponse = {
  query: string;
  results: FilenameSearchResult[];
};
