/** Error thrown when a Rocksky XRPC call returns a non-2xx `{ error, message }`. */
export class RockskyError extends Error {
  readonly kind?: string;
  constructor(payload: unknown) {
    const p = payload as { error?: string; message?: string } | undefined;
    super(p?.message || p?.error || "rocksky request failed");
    this.name = "RockskyError";
    this.kind = p?.error;
  }
}
