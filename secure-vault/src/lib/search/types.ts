export type SearchMode = "filename" | "semantic";

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

export type SemanticSearchMatchType = "image" | "pdf_full" | "pdf_page" | "pdf_window";

export type SemanticSearchResult = {
  canPreview: boolean;
  fileId: string;
  folderId: string | null;
  folderPath: SearchResultFolderPathItem[];
  isInRoot: boolean;
  matchType: SemanticSearchMatchType;
  mimeType: string;
  name: string;
  pageFrom: number | null;
  pageTo: number | null;
  score: number;
  size: number;
  updatedAt: string;
};

export type SemanticSearchResponse = {
  limit: number;
  query: string;
  results: SemanticSearchResult[];
};
