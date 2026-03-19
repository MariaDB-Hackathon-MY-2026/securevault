export class UploadInitServiceError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadInitServiceError";
    this.status = status;
  }
}
