import type pg from "pg";

/** Pool error handlers cover idle clients; checked-out transaction clients need their own. */
export function handlePgConnectionErrors(
  pool: pg.Pool,
  label: string,
  report: (message: string) => void,
) {
  pool.on("error", (error: Error) => {
    report(`Idle pg client error on ${label}: ${error.message}`);
  });
  pool.on("connect", (client: pg.PoolClient) => {
    client.on("error", (error: Error) => {
      // pg marks the connection unusable and rejects active/future queries.
      // Let its pool discard it; do not release a client's in-flight transaction.
      report(`Pg connection error on ${label}: ${error.message}`);
    });
  });
}

const connectionCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "57P01",
  "57P02",
  "57P03",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
]);

export function isPgConnectionError(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const cause = error as { code?: string; message?: string; cause?: unknown };
    if (cause.code && connectionCodes.has(cause.code)) return true;
    if (
      /^(?:connection (?:terminated|closed)(?: unexpectedly| due to connection timeout)?|client (?:has encountered a connection error|was closed).*|timeout exceeded when trying to connect)$/i.test(
        cause.message ?? "",
      )
    )
      return true;
    error = cause.cause;
  }
  return false;
}

/** Only use for reads or a whole idempotent operation, never arbitrary writes. */
export async function retryPgConnection<T>(
  run: () => PromiseLike<T>,
  options: {
    attempts?: number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, delayMs: number) => void;
  } = {},
): Promise<T> {
  const attempts = options.attempts ?? 6;
  const sleep =
    options.sleep ??
    ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isPgConnectionError(error)) throw error;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      options.onRetry?.(attempt, delayMs);
      await sleep(delayMs);
    }
  }
}
