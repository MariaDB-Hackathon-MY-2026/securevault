import { describe, expect, it } from "vitest";

import { UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/constants";
import {
  ChunkWithMetadata,
  InvalidFileChunkerError,
  isBlobArray,
  isChunkWithMetadataArray,
  sliceFile,
  sliceFileWithMetadata,
  sliceFiles,
  sliceFilesWithMetaData,
  validateChunksArray,
  validateChunkSize,
} from "@/lib/storage/chunker";

function createFile(size: number, name = "fixture.bin") {
  const content = new Uint8Array(size);

  for (let index = 0; index < size; index += 1) {
    content[index] = index % 251;
  }

  return new File([content], name, { type: "application/octet-stream" });
}

async function concatenateBlobs(blobs: Blob[]) {
  const buffers = await Promise.all(blobs.map((blob) => blob.arrayBuffer()));
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const buffer of buffers) {
    combined.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return combined;
}

describe("chunker", () => {
  it("rejects empty files before any upload can start", () => {
    const file = createFile(0, "empty.bin");

    expect(() => sliceFile(file)).toThrowError(
      new InvalidFileChunkerError("File size must be greater than 0", "EMPTY_FILE"),
    );
    expect(() => sliceFileWithMetadata(file)).toThrowError(
      new InvalidFileChunkerError("File size must be greater than 0", "EMPTY_FILE"),
    );
  });

  it("rejects invalid chunk sizes", () => {
    expect(() => validateChunkSize(0)).toThrowError(
      new InvalidFileChunkerError("Invalid chunk size", "INVALID_CHUNK_SIZE"),
    );
    expect(() => validateChunkSize(-1)).toThrowError(
      new InvalidFileChunkerError("Invalid chunk size", "INVALID_CHUNK_SIZE"),
    );
    expect(() => validateChunkSize(1.5)).toThrowError(
      new InvalidFileChunkerError("Invalid chunk size", "INVALID_CHUNK_SIZE"),
    );
    expect(() => validateChunkSize(Number.NaN)).toThrowError(
      new InvalidFileChunkerError("Invalid chunk size", "INVALID_CHUNK_SIZE"),
    );
    expect(() => validateChunkSize(Number.POSITIVE_INFINITY)).toThrowError(
      new InvalidFileChunkerError("Invalid chunk size", "INVALID_CHUNK_SIZE"),
    );
  });

  it("splits a one-byte file into a single chunk", () => {
    const chunks = sliceFile(createFile(1));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.size).toBe(1);
    expect(isBlobArray(chunks)).toBe(true);
  });

  it("splits an exact 5 MiB file into a single chunk", () => {
    const chunks = sliceFile(createFile(UPLOAD_CHUNK_SIZE_BYTES));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.size).toBe(UPLOAD_CHUNK_SIZE_BYTES);
  });

  it("splits a 5 MiB + 1 byte file into two chunks with the final byte isolated", () => {
    const chunks = sliceFile(createFile(UPLOAD_CHUNK_SIZE_BYTES + 1));

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.size)).toEqual([UPLOAD_CHUNK_SIZE_BYTES, 1]);
  });

  it("splits a 12 MiB file into three chunks with a smaller final chunk", () => {
    const fileSize = 12 * 1024 * 1024;
    const chunks = sliceFile(createFile(fileSize));

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.size)).toEqual([
      UPLOAD_CHUNK_SIZE_BYTES,
      UPLOAD_CHUNK_SIZE_BYTES,
      fileSize - (2 * UPLOAD_CHUNK_SIZE_BYTES),
    ]);
  });

  it("returns a single chunk when the chunk size is larger than the file", () => {
    const file = createFile(64);
    const chunks = sliceFile(file, 1024);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.size).toBe(file.size);
  });

  it("preserves the original bytes across all generated chunks", async () => {
    const file = createFile((256 * 1024) + 321);
    const chunks = sliceFile(file, 64 * 1024);

    const reconstructed = Buffer.from(await concatenateBlobs(chunks));
    const original = Buffer.from(await file.arrayBuffer());

    expect(reconstructed.equals(original)).toBe(true);
  });

  it("returns metadata chunks with accurate offsets, sizes, and class instances", () => {
    const file = createFile((2 * UPLOAD_CHUNK_SIZE_BYTES) + 1);
    const chunks = sliceFileWithMetadata(file);

    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk instanceof ChunkWithMetadata)).toBe(true);
    expect(isChunkWithMetadataArray(chunks)).toBe(true);

    expect(chunks.map((chunk) => ({
      end: chunk.end,
      index: chunk.index,
      size: chunk.size,
      start: chunk.start,
    }))).toEqual([
      {
        end: UPLOAD_CHUNK_SIZE_BYTES,
        index: 0,
        size: UPLOAD_CHUNK_SIZE_BYTES,
        start: 0,
      },
      {
        end: 2 * UPLOAD_CHUNK_SIZE_BYTES,
        index: 1,
        size: UPLOAD_CHUNK_SIZE_BYTES,
        start: UPLOAD_CHUNK_SIZE_BYTES,
      },
      {
        end: file.size,
        index: 2,
        size: 1,
        start: 2 * UPLOAD_CHUNK_SIZE_BYTES,
      },
    ]);
  });

  it("supports the existing plural export aliases", () => {
    const file = createFile(10);

    expect(sliceFiles(file, 4).map((chunk) => chunk.size)).toEqual([4, 4, 2]);
    expect(sliceFilesWithMetaData(file, 4).map((chunk) => chunk.size)).toEqual([4, 4, 2]);
  });

  it("rejects empty chunk arrays during validation", () => {
    const file = createFile(10);

    expect(() => validateChunksArray([], file, 4)).toThrowError(
      new InvalidFileChunkerError("No chunks generated", "INVALID_CHUNK_ARRAY"),
    );
  });

  it("rejects blob arrays whose non-final chunk is undersized even if totals still match", () => {
    const file = createFile(5);
    const tamperedChunks = [new Blob([new Uint8Array(2)]), new Blob([new Uint8Array(3)])];

    expect(() => validateChunksArray(tamperedChunks, file, 4)).toThrowError(
      new InvalidFileChunkerError(
        "Chunk sizes do not match the original file size",
        "INVALID_CHUNK_ARRAY",
      ),
    );
  });

  it("rejects metadata arrays with incorrect offsets", () => {
    const file = createFile(8);
    const invalidMetadata = [
      new ChunkWithMetadata(0, 0, 4, 4, new Blob([new Uint8Array(4)])),
      new ChunkWithMetadata(1, 4, 9, 4, new Blob([new Uint8Array(4)])),
    ];

    expect(() => validateChunksArray(invalidMetadata, file, 4)).toThrowError(
      new InvalidFileChunkerError(
        "Chunk metadata does not match the original file",
        "INVALID_CHUNK_ARRAY",
      ),
    );
  });

  it("rejects plain-object metadata arrays that are not class instances", () => {
    const file = createFile(4);
    const plainObjectMetadata = [
      {
        blob: new Blob([new Uint8Array(4)]),
        end: 4,
        index: 0,
        size: 4,
        start: 0,
      },
    ] as unknown as ChunkWithMetadata[];

    expect(isChunkWithMetadataArray(plainObjectMetadata)).toBe(false);
    expect(() => validateChunksArray(plainObjectMetadata, file, 4)).toThrowError(
      new InvalidFileChunkerError("Invalid chunk array", "INVALID_CHUNK_ARRAY"),
    );
  });
});


