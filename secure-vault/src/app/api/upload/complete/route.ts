import {NextRequest, NextResponse} from "next/server";
import { getCurrentUser} from "@/lib/auth/get-current-user";
import {completeUploadTransaction, validateBody} from "@/app/api/upload/complete/service";
import {BodyRequestErrorResponse, TransactionFailureErrorResponse} from "@/app/api/upload/complete/Error";


export async function POST(req:NextRequest){
    const user = await getCurrentUser()
    if(!user) return NextResponse.json({message:"Invalid Credentials"}, {status: 403})


    try {

        const jsonBody = await req.json();
        const validatedBody = validateBody(jsonBody);
        const transactionResult = await completeUploadTransaction(user, validatedBody);
        return NextResponse.json({ ...transactionResult }, { status: 200 });

    } catch (err) {
        if (err instanceof SyntaxError) {
            return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
        }
        if (err instanceof BodyRequestErrorResponse) return err.getErrorResponse();
        if (err instanceof TransactionFailureErrorResponse) return err.getErrorResponse();
        // Catch-all — unknown errors never return undefined or leak stack traces
        console.error("[upload/complete] Unhandled error:", err);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}