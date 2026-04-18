import path from "node:path";
import { mkdir, stat, writeFile } from "node:fs/promises";

const SAMPLE_DIR = path.resolve(process.cwd(), "sample_upload_test_file");
const GENERATED_DIR = path.resolve(process.cwd(), ".playwright-fixtures");

const LIGHTWEIGHT_FIXTURES = {
  "photo.png": Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nWQ0AAAAASUVORK5CYII=",
    "base64",
  ),
} as const satisfies Record<string, Buffer>;

export function getSampleUploadFixturePath(fileName: string) {
  return path.join(SAMPLE_DIR, fileName);
}

async function ensureLightweightFixture(fileName: keyof typeof LIGHTWEIGHT_FIXTURES) {
  const fixturePath = path.join(GENERATED_DIR, fileName);
  const fixtureBytes = LIGHTWEIGHT_FIXTURES[fileName];

  try {
    const existingFixture = await stat(fixturePath);

    if (existingFixture.size === fixtureBytes.byteLength) {
      return fixturePath;
    }
  } catch {
    // Recreate the lightweight fixture when it does not exist yet.
  }

  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(fixturePath, fixtureBytes);
  return fixturePath;
}

export async function resolveUploadFixturePath(fileName: string) {
  if (fileName in LIGHTWEIGHT_FIXTURES) {
    return ensureLightweightFixture(fileName as keyof typeof LIGHTWEIGHT_FIXTURES);
  }

  return getSampleUploadFixturePath(fileName);
}

export async function resolveUploadFixturePaths(fileNames: readonly string[]) {
  return Promise.all(fileNames.map((fileName) => resolveUploadFixturePath(fileName)));
}
