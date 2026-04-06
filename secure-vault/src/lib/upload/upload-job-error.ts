export type UploadJobStage = "init" | "status" | "start" | "chunk" | "complete" | "unknown";

export type UploadJobErrorCode =
    | "INIT_FAILED"
    | "STATUS_FAILED"
    | "START_FAILED"
    | "CHUNK_FAILED"
    | "COMPLETE_FAILED"
    | "PAUSED"
    | "CANCELLED"
    | "NETWORK_ERROR"
    | "RATE_LIMITED"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "PAYLOAD_TOO_LARGE"
    | "UNSUPPORTED_TYPE"
    | "SERVER_ERROR"
    | "UNKNOWN";

export class UploadJobError extends Error {
    readonly code: UploadJobErrorCode;
    readonly stage: UploadJobStage;
    readonly status: number | null;
    readonly cause?: unknown;

    constructor(options: {
        message: string;
        code: UploadJobErrorCode;
        stage: UploadJobStage;
        status?: number | null;
        cause?: unknown;
    }) {
        super(options.message);
        this.name = "UploadJobError";
        this.code = options.code;
        this.stage = options.stage;
        this.status = options.status ?? null;
        this.cause = options.cause;
    }
}

export function createUploadJobErrorFromHttp(options: {
    stage: UploadJobStage;
    status: number;
    message: string;
    cause?: unknown;
}) {
    const { stage, status, message, cause } = options;

    let code: UploadJobErrorCode = "UNKNOWN";

    if (status === 401) code = "UNAUTHORIZED";
    else if (status === 403) code = "FORBIDDEN";
    else if (status === 404) code = "NOT_FOUND";
    else if (status === 409) code = "CONFLICT";
    else if (status === 413) code = "PAYLOAD_TOO_LARGE";
    else if (status === 415) code = "UNSUPPORTED_TYPE";
    else if (status === 429) code = "RATE_LIMITED";
    else if (status >= 500) code = "SERVER_ERROR";
    else if (stage === "init") code = "INIT_FAILED";
    else if (stage === "status") code = "STATUS_FAILED";
    else if (stage === "start") code = "START_FAILED";
    else if (stage === "chunk") code = "CHUNK_FAILED";
    else if (stage === "complete") code = "COMPLETE_FAILED";

    return new UploadJobError({
        message,
        code,
        stage,
        status,
        cause,
    });
}
