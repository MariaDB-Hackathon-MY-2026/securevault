import { NextResponse } from "next/server";

export class ApiError extends Error {
    protected errorMessage: string;
    protected status: number;
    protected args?: Record<string, unknown>;

    constructor(message: string, status: number, args?: Record<string, unknown>) {
        super(message);
        this.errorMessage = message;
        this.status = status;
        this.args = args;
    }

    public getErrorResponse() {
        return NextResponse.json(
            { message: this.errorMessage, ...this.args },
            { status: this.status }
        );
    }
}

export class TransactionFailureErrorResponse extends ApiError {
    constructor(message: string, status: number, args?: Record<string, unknown>) {
        super(message, status, args);
    }
}

export class BodyRequestErrorResponse extends ApiError {
    constructor(message: string, status: number, args?: Record<string, unknown>) {
        super(message, status, args);
    }
}
