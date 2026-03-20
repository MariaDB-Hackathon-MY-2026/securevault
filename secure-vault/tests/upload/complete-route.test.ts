import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  validateBody: vi.fn(),
  completeUploadTransaction: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/api/upload/complete/service", () => ({
  validateBody: mocks.validateBody,
  completeUploadTransaction: mocks.completeUploadTransaction,
}));

// Error classes must be re-declared in the mock so instanceof checks inside
// the route still hold true after module isolation.
vi.mock("@/app/api/upload/complete/Error", () => {
  class ApiError extends Error {
    protected status: number;
    protected errorMessage: string;

    constructor(message: string, status: number) {
      super(message);
      this.errorMessage = message;
      this.status = status;
    }

    getErrorResponse() {
      return new Response(JSON.stringify({ message: this.errorMessage }), {
        status: this.status,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  class TransactionFailureErrorResponse extends ApiError {}
  class BodyRequestErrorResponse extends ApiError {}

  return { ApiError, TransactionFailureErrorResponse, BodyRequestErrorResponse };
});

// Must be imported AFTER mocks are registered
import { POST } from "@/app/api/upload/complete/route";
import {
  BodyRequestErrorResponse,
  TransactionFailureErrorResponse,
} from "@/app/api/upload/complete/Error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createUser() {
  return {
    id: "user-abc1234567890123456",
    email: "alice@example.com",
    name: "Alice",
    email_verified: true,
    storage_used: 0,
    storage_quota: 1_073_741_824,
    created_at: new Date("2026-03-19T00:00:00.000Z"),
    uek: Buffer.alloc(32, 1),
  };
}

function createRequest(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as never;
}

function createMalformedRequest() {
  return {
    json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
  } as never;
}

const VALID_UPLOAD_ID = "a".repeat(21);
const VALID_BODY = { uploadId: VALID_UPLOAD_ID };
const VALID_VALIDATED_BODY = { uploadId: VALID_UPLOAD_ID };
const SUCCESS_RESULT = { fileId: "file-xyz1234567890123456", status: "ready" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("upload complete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    // Default happy-path wiring
    mocks.getCurrentUser.mockResolvedValue(createUser());
    mocks.validateBody.mockReturnValue(VALID_VALIDATED_BODY);
    mocks.completeUploadTransaction.mockResolvedValue(SUCCESS_RESULT);
  });

  // =========================================================================
  // Authentication
  // =========================================================================
  describe("authentication", () => {
    it("returns 403 when no session is present", async () => {
      mocks.getCurrentUser.mockResolvedValueOnce(null);

      const response = await POST(createRequest(VALID_BODY));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ message: "Invalid Credentials" });
      expect(mocks.validateBody).not.toHaveBeenCalled();
      expect(mocks.completeUploadTransaction).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Request validation
  // =========================================================================
  describe("request validation", () => {
    it("returns 400 when the body is not valid JSON", async () => {
      // req.json() must be inside try/catch — this confirms the security-gap fix
      const response = await POST(createMalformedRequest());

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ message: expect.any(String) });
      expect(mocks.validateBody).not.toHaveBeenCalled();
    });

    it("returns 400 and the error message when validateBody throws BodyRequestErrorResponse", async () => {
      mocks.validateBody.mockImplementationOnce(() => {
        throw new BodyRequestErrorResponse("Invalid Body Request Form", 400);
      });

      const response = await POST(createRequest({ uploadId: 123 }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        message: "Invalid Body Request Form",
      });
      expect(mocks.completeUploadTransaction).not.toHaveBeenCalled();
    });

    it("passes parsed body to validateBody", async () => {
      await POST(createRequest(VALID_BODY));

      expect(mocks.validateBody).toHaveBeenCalledWith(VALID_BODY);
    });
  });

  // =========================================================================
  // Success path
  // =========================================================================
  describe("success", () => {
    it("returns 200 with fileId and status on a fully uploaded session", async () => {
      const response = await POST(createRequest(VALID_BODY));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        fileId: SUCCESS_RESULT.fileId,
        status: "ready",
      });
    });

    it("calls completeUploadTransaction with the authenticated user and validated body", async () => {
      const user = createUser();
      mocks.getCurrentUser.mockResolvedValueOnce(user);

      await POST(createRequest(VALID_BODY));

      expect(mocks.completeUploadTransaction).toHaveBeenCalledWith(
        user,
        VALID_VALIDATED_BODY,
      );
    });

    it("spreads the full transaction result into the response body", async () => {
      // Ensures no field is silently dropped from the service response
      mocks.completeUploadTransaction.mockResolvedValueOnce({
        fileId: "file-xyz",
        status: "ready",
      });

      const response = await POST(createRequest(VALID_BODY));

      await expect(response.json()).resolves.toMatchObject({
        fileId: "file-xyz",
        status: "ready",
      });
    });
  });

  // =========================================================================
  // Transaction / service error mapping
  // =========================================================================
  describe("service error mapping", () => {
    it("returns 404 when the upload session does not exist", async () => {
      mocks.completeUploadTransaction.mockRejectedValueOnce(
        new TransactionFailureErrorResponse("Upload session not found", 404),
      );

      const response = await POST(createRequest(VALID_BODY));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        message: "Upload session not found",
      });
    });

    it("returns 409 when the session is already completed or failed", async () => {
      mocks.completeUploadTransaction.mockRejectedValueOnce(
        new TransactionFailureErrorResponse(
          "Upload session is already completed or has failed",
          409,
        ),
      );

      const response = await POST(createRequest(VALID_BODY));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        message: "Upload session is already completed or has failed",
      });
    });

    it("returns 409 when not all chunks have been uploaded", async () => {
      mocks.completeUploadTransaction.mockRejectedValueOnce(
        new TransactionFailureErrorResponse("Not all chunks have been uploaded", 409),
      );

      const response = await POST(createRequest(VALID_BODY));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        message: "Not all chunks have been uploaded",
      });
    });

    it("returns 410 when the upload session has expired", async () => {
      mocks.completeUploadTransaction.mockRejectedValueOnce(
        new TransactionFailureErrorResponse("Upload session has expired", 410),
      );

      const response = await POST(createRequest(VALID_BODY));

      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toEqual({
        message: "Upload session has expired",
      });
    });
  });

  // =========================================================================
  // Catch-all / unknown errors
  // =========================================================================
  describe("catch-all error handling", () => {
    it("returns 500 and a safe message for unexpected errors", async () => {
      mocks.completeUploadTransaction.mockRejectedValueOnce(new Error("db connection lost"));

      const response = await POST(createRequest(VALID_BODY));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        message: "Internal server error",
      });
    });

    it("does not leak internal error details in the 500 body", async () => {
      mocks.completeUploadTransaction.mockRejectedValueOnce(
        new Error("ER_ACCESS_DENIED_ERROR: passwords don't match"),
      );

      const response = await POST(createRequest(VALID_BODY));
      const body = await response.json();

      expect(JSON.stringify(body)).not.toContain("ER_ACCESS_DENIED_ERROR");
      expect(JSON.stringify(body)).not.toContain("password");
    });

    it("logs unexpected errors to console.error", async () => {
      const boom = new Error("something exploded");
      mocks.completeUploadTransaction.mockRejectedValueOnce(boom);

      await POST(createRequest(VALID_BODY));

      expect(console.error).toHaveBeenCalledWith(
        "[upload/complete] Unhandled error:",
        boom,
      );
    });
  });
});
