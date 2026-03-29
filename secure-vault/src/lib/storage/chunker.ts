import { UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/constants";

export type InvalidFileChunkerErrorCode =
  | "EMPTY_FILE"
  | "INVALID_CHUNK_ARRAY"
  | "INVALID_CHUNK_SIZE";

export class InvalidFileChunkerError extends Error {
  readonly code: InvalidFileChunkerErrorCode;

  constructor(message: string, code: InvalidFileChunkerErrorCode) {
    super(message);
    this.name = "InvalidFileChunkerError";
    this.code = code;
  }
}

export class ChunkWithMetadata {
  constructor(
    public readonly index: number,
    public readonly start: number,
    public readonly end: number,
    public readonly size: number,
    public readonly blob: Blob,
  ) {}
}

export { ChunkWithMetadata as ChunkWithMetaData };

export function isBlobArray(value: unknown): value is Blob[] {
  return Array.isArray(value) && value.every((item) => item instanceof Blob);
}

export function isChunkWithMetadataArray(value: unknown): value is ChunkWithMetadata[] {
  return Array.isArray(value) && value.every((item) => item instanceof ChunkWithMetadata);
}

export function validateChunkSize(chunkSize: number = UPLOAD_CHUNK_SIZE_BYTES) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new InvalidFileChunkerError("Invalid chunk size", "INVALID_CHUNK_SIZE");
  }
}

function validateFile(file: Blob) {
  if (file.size <= 0) {
    throw new InvalidFileChunkerError("File size must be greater than 0", "EMPTY_FILE");
  }
}

function getExpectedChunkCount(fileSize: number, chunkSize: number) {
  return Math.ceil(fileSize / chunkSize);
}

export function validateChunksArray(
  chunks: Blob[] | ChunkWithMetadata[],
  file: Blob,
  chunkSize: number = UPLOAD_CHUNK_SIZE_BYTES,
) {
  validateChunkSize(chunkSize);
  validateFile(file);

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new InvalidFileChunkerError("No chunks generated", "INVALID_CHUNK_ARRAY");
  }

  const expectedChunkCount = getExpectedChunkCount(file.size, chunkSize);

  if (chunks.length !== expectedChunkCount) {
    throw new InvalidFileChunkerError(
      "Chunk count does not match the original file size",
      "INVALID_CHUNK_ARRAY",
    );
  }

  if (isBlobArray(chunks)) {
    let consumedBytes = 0;

    chunks.forEach((blob, index) => {
      const remainingBytes = file.size - consumedBytes;
      const expectedSize =
        index === chunks.length - 1 ? remainingBytes : Math.min(chunkSize, remainingBytes);

      if (blob.size <= 0 || blob.size !== expectedSize) {
        throw new InvalidFileChunkerError(
          "Chunk sizes do not match the original file size",
          "INVALID_CHUNK_ARRAY",
        );
      }

      consumedBytes += blob.size;
    });

    if (consumedBytes !== file.size) {
      throw new InvalidFileChunkerError(
        "Total chunks size does not match the original file size",
        "INVALID_CHUNK_ARRAY",
      );
    }

    return;
  }

  if (isChunkWithMetadataArray(chunks)) {
    let consumedBytes = 0;

    chunks.forEach((chunk, index) => {
      const remainingBytes = file.size - consumedBytes;
      const expectedSize =
        index === chunks.length - 1 ? remainingBytes : Math.min(chunkSize, remainingBytes);
      const expectedStart = consumedBytes;
      const expectedEnd = expectedStart + expectedSize;

      if (
        chunk.index !== index ||
        chunk.start !== expectedStart ||
        chunk.end !== expectedEnd ||
        chunk.size !== chunk.blob.size ||
        chunk.size !== expectedSize ||
        chunk.size <= 0
      ) {
        throw new InvalidFileChunkerError(
          "Chunk metadata does not match the original file",
          "INVALID_CHUNK_ARRAY",
        );
      }

      consumedBytes += chunk.size;
    });

    if (consumedBytes !== file.size) {
      throw new InvalidFileChunkerError(
        "Total chunks size does not match the original file size",
        "INVALID_CHUNK_ARRAY",
      );
    }

    return;
  }

  throw new InvalidFileChunkerError("Invalid chunk array", "INVALID_CHUNK_ARRAY");
}

export function sliceFile(file: File, chunkSize: number = UPLOAD_CHUNK_SIZE_BYTES): Blob[] {
  validateChunkSize(chunkSize);
  validateFile(file);

  const slicedBlobs: Blob[] = [];

  for (let chunkStart = 0; chunkStart < file.size; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, file.size);
    slicedBlobs.push(file.slice(chunkStart, chunkEnd));
  }

  validateChunksArray(slicedBlobs, file, chunkSize);
  return slicedBlobs;
}

export function sliceFileWithMetadata(
  file: File,
  chunkSize: number = UPLOAD_CHUNK_SIZE_BYTES,
): ChunkWithMetadata[] {
  validateChunkSize(chunkSize);
  validateFile(file);

  const slicedBlobsWithMetadata: ChunkWithMetadata[] = [];

  for (
    let chunkStart = 0, index = 0;
    chunkStart < file.size;
    chunkStart += chunkSize, index += 1
  ) {
    const chunkEnd = Math.min(chunkStart + chunkSize, file.size);
    const blob = file.slice(chunkStart, chunkEnd);

    slicedBlobsWithMetadata.push(
      new ChunkWithMetadata(index, chunkStart, chunkEnd, blob.size, blob),
    );
  }

  validateChunksArray(slicedBlobsWithMetadata, file, chunkSize);
  return slicedBlobsWithMetadata;
}

export const sliceFiles = sliceFile;
export const sliceFilesWithMetaData = sliceFileWithMetadata;
