const TRANSIENT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

function isTransient(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: unknown; httpStatus?: number };
  if (e.code && TRANSIENT_CODES.has(e.code)) return true;
  if (typeof e.httpStatus === "number" && e.httpStatus >= 500) return true;
  if (e.cause) return isTransient(e.cause);
  return false;
}

export async function withTypesenseRetry<T>(
  fn: () => Promise<T>,
  {
    attempts = 3,
    baseDelayMs = 200,
  }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1 || !isTransient(e)) throw e;
      const delay = baseDelayMs * 2 ** i + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
