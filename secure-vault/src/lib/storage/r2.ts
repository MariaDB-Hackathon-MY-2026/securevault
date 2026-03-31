import {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand, PutObjectCommandInput, DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const BUCKET_NAME = process.env.R2_BUCKET_NAME

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !BUCKET_NAME) throw new Error('Missing S3 credentials')

const S3 = new S3Client({
    region: "auto", // Required by SDK but not used by R2
    // Provide your Cloudflare account ID
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    // Retrieve your S3 API credentials for your R2 bucket via API tokens (see: https://developers.cloudflare.com/r2/api/tokens)
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});


type R2Body = PutObjectCommandInput['Body'] | Readable | ReadableStream<unknown>
function normalizeBody(body: R2Body) {
    //S3 only accepts readable stream and putobjectCommandInput body
    if (body instanceof Readable) return body

    //we dont use instanceof ReadableStream because it only compares the constructor created not the actual characteristics
    // duck typing instead of object comparison, walk like a duck, quack like a duck then its a duck without comparing wether the duck
    //is created by a creator or the other
    if (body && typeof body === 'object' && 'getReader' in body) {
        return Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream)
    }

    return body as PutObjectCommandInput['Body']
}

export async function putObject(key: string, body: PutObjectCommandInput['Body'], contentType?: string) {
    return S3.send(
        new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Body: normalizeBody(body),
            Key: key,
            ContentType: contentType
        })
    )
}

export async function putObjectStream(key: string, body: Readable | ReadableStream<unknown>, contentType?: string) {
    // Use @aws-sdk/lib-storage Upload for streaming bodies where
    // content-length is unknown. This avoids the
    // "x-amz-decoded-content-length: undefined" error from PutObjectCommand.
    const { Upload } = await import("@aws-sdk/lib-storage");

    const upload = new Upload({
        client: S3,
        params: {
            Bucket: BUCKET_NAME,
            Body: normalizeBody(body),
            Key: key,
            ContentType: contentType,
        },
    });

    await upload.done();
}

export async function getObject(key: string) {
    // returns an object belong to a certain path (key)
    return S3.send(
        new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        })
    )
}

export async function getObjectStream(key: string, abortSignal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const response = await S3.send(
        new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        }),
        abortSignal ? { abortSignal } : undefined,
    )

    const body = response.Body

    if (!body) {
        throw new Error(`R2 object ${key} has no body`)
    }

    if (typeof body === "object" && "transformToWebStream" in body && typeof body.transformToWebStream === "function") {
        return await body.transformToWebStream() as unknown as ReadableStream<Uint8Array>
    }

    if (body instanceof Readable) {
        return Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>
    }

    if (body && typeof body === "object" && "getReader" in body) {
        return body as unknown as ReadableStream<Uint8Array>
    }

    throw new Error(`Unsupported R2 body type for ${key}`)
}

export async function deleteObject(key: string) {
    return S3.send(
        new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        })
    )
}


export async function listObjects(prefix: string) {
    //return objects belong under certain prefix
    return S3.send(
        new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        })
    )
}

/**
 * Constructs the target R2 object key/path for a file or a specific chunk.
 * Base format: `{userId}/files/{fileId}`
 * Chunk format: `{userId}/files/{fileId}/chunk_{index}`
 */
export function buildR2Key(userId: string, fileId: string, chunkIndex?: number): string {
    const basePath = `${userId}/files/${fileId}`;
    return chunkIndex !== undefined ? `${basePath}/chunk_${chunkIndex}` : basePath;
}


