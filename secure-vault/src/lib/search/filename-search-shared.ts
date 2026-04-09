const DEFAULT_FILENAME_SEARCH_LIMIT = 20;
export const MAX_FILENAME_SEARCH_LIMIT = 50;

export function normalizeFilenameSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function getFilenameSearchRank(name: string, normalizedQuery: string) {
  const normalizedName = name.trim().toLowerCase();

  if (normalizedName === normalizedQuery) {
    return 0;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 1;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 2;
  }

  return 3;
}

export function clampFilenameSearchLimit(limit?: number) {
  if (!Number.isFinite(limit) || !limit) {
    return DEFAULT_FILENAME_SEARCH_LIMIT;
  }

  return Math.min(MAX_FILENAME_SEARCH_LIMIT, Math.max(1, Math.trunc(limit)));
}
