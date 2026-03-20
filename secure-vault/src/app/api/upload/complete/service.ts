import { BodyRequestErrorResponse, TransactionFailureErrorResponse } from "@/app/api/upload/complete/Error";
import { files, users } from "@/lib/db/schema";
import { uploadSessions } from "@/lib/db/schema/upload-sessions";
import { and, eq, sql } from "drizzle-orm";
import { MariadbConnection } from "@/lib/db";
import { CurrentUser } from "@/lib/auth/get-current-user";
import { z } from "zod";

// P3: enforce exact nanoid length to reject garbage values early
const uploadBodySchema = z.object({
    uploadId: z.string().length(21),
});

export function validateBody(jsonBody: unknown) {
    const { data: validatedBody, error } = uploadBodySchema.safeParse(jsonBody);
    if (error || !validatedBody) throw new BodyRequestErrorResponse("Invalid Body Request Form", 400);
    return { uploadId: validatedBody.uploadId };
}

export async function completeUploadTransaction(
    user: CurrentUser,
    validatedBody: z.infer<typeof uploadBodySchema>,
) {
    const db_conn = MariadbConnection.getConnection();
    return db_conn.transaction(async (tx) => {

        const [session] = await tx.select({
            file_id:         uploadSessions.file_id,
            uploadId:        uploadSessions.id,
            fileSize:        uploadSessions.file_size,
            status:          uploadSessions.status,
            total_chunks:    uploadSessions.total_chunks,
            completed_chunks: uploadSessions.completed_chunks,
            expires_at:      uploadSessions.expires_at,
        })
            .from(uploadSessions)
            .where(and(
                eq(uploadSessions.id,      validatedBody.uploadId),
                eq(uploadSessions.user_id, user.id),
            ));



        if (!session)
            throw new TransactionFailureErrorResponse("Upload session not found", 404);

        if (session.status !== "uploading")
            throw new TransactionFailureErrorResponse(
                "Upload session is already completed or has failed",
                409,
            );

        if (session.expires_at < new Date())
            throw new TransactionFailureErrorResponse("Upload session has expired", 410);

        if (session.total_chunks !== session.completed_chunks)
            throw new TransactionFailureErrorResponse("Not all chunks have been uploaded", 409);


        await tx.update(files)
            .set({ status: "ready" })
            .where(and(
                eq(files.user_id, user.id),
                eq(files.id,      session.file_id),
            ));

        await tx.update(uploadSessions)
            .set({ status: "completed" })
            .where(eq(uploadSessions.id, validatedBody.uploadId));

        await tx.update(users)
            .set({ storage_used: sql`${users.storage_used} + ${session.fileSize}` })
            .where(eq(users.id, user.id));

        // Bug 3 fix: was 'staus' (typo)
        return { fileId: session.file_id, status: "ready" };
    });
}
