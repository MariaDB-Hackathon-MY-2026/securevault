export function safeRedirect(url: string | null | undefined, fallback = "/activity"): string {
  if (!url || !url.startsWith("/") || url.startsWith("//")) {
    return fallback;
  }

  return url;
}
