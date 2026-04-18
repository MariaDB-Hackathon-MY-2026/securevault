"use client";

export const FILENAME_SEARCH_PREFERENCE_KEY = "securevault.files.search.filename-enabled";
export const DEFAULT_FILENAME_SEARCH_ENABLED = false;

export function readFilenameSearchPreference() {
  if (typeof window === "undefined") {
    return DEFAULT_FILENAME_SEARCH_ENABLED;
  }

  return window.localStorage.getItem(FILENAME_SEARCH_PREFERENCE_KEY) === "true";
}

export function writeFilenameSearchPreference(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(FILENAME_SEARCH_PREFERENCE_KEY, String(enabled));
}
