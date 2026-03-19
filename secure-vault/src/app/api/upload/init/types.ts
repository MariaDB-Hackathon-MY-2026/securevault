import { MariadbConnection } from "@/lib/db";

export type InitUploadResponse = {
  fileId: string;
  uploadId: string;
  totalChunks: number;
};

type DbConnection = ReturnType<typeof MariadbConnection.getConnection>;

export type DbTransaction = Parameters<Parameters<DbConnection["transaction"]>[0]>[0];
