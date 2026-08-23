export class RockskyError extends Error {
  /** The XRPC error code (e.g. "InvalidRequest", "AuthMissing"), when the
   * server sent one. */
  readonly kind?: string;
  /** The HTTP status of the failed response, when known. */
  readonly status?: number;

  constructor(payload: unknown, status?: number) {
    const p = payload as { error?: string; message?: string } | undefined;
    super(p?.message || p?.error || "rocksky request failed");
    this.name = "RockskyError";
    this.kind = p?.error;
    this.status = status;
  }
}
