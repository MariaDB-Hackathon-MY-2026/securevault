const INVALID_FILENAME_CHARS = /[\/\\:*?"<>|]/g;
const CONTROL_AND_HIDDEN_CHARS = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g;

export function sanitizeFilename(name: string): string {
  let sanitized = name.trim();

  sanitized = sanitized.replace(CONTROL_AND_HIDDEN_CHARS, "");
  sanitized = sanitized.replace(INVALID_FILENAME_CHARS, "");
  sanitized = sanitized.replace(/\.\./g, "");
  sanitized = sanitized.replace(/^\.+/, "");
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  if (sanitized.length > 255) {
    sanitized = sanitized.slice(0, 255);
  }

  // Keep a safe fallback so uploads never end up with an empty filename.
  return sanitized || "file";
}
