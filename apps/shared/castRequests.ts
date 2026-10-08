export function castCancelled() {
  const error = new Error("Chromecast queue changed.");
  error.name = "AbortError";
  return error;
}

export function abortableDelay(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(castCancelled());
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      },
      Math.max(0, ms),
    );
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

/** One request at a time, at most one start per second, shared by token and MIME requests. */
export class CastRequests {
  private pending: Promise<unknown> = Promise.resolve();
  private nextAt = 0;
  constructor(
    private request: (
      url: string,
      init: RequestInit,
    ) => Promise<Response> = fetch,
    private now = Date.now,
    private wait = abortableDelay,
  ) {}
  fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const signal = init.signal ?? undefined;
    const result = this.pending.then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        await this.wait(Math.max(0, this.nextAt - this.now()), signal);
        if (signal?.aborted) throw castCancelled();
        this.nextAt = this.now() + 1000;
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, 15000);
        let response: Response;
        try {
          response = await this.request(url, {
            ...init,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
        }
        if (response.status !== 429) return response;
        const retry = response.headers.get("retry-after");
        const reset = response.headers.get("x-ratelimit-reset");
        const seconds =
          retry && /^\d+(\.\d+)?$/.test(retry)
            ? Number(retry)
            : retry
              ? (Date.parse(retry) - this.now()) / 1000
              : Number(reset);
        const delay =
          Number.isFinite(seconds) && seconds > 0
            ? seconds * 1000
            : 30000 * (attempt + 1);
        this.nextAt = Math.max(this.nextAt, this.now() + delay);
        await response.body?.cancel();
      }
      throw new Error(
        "Chromecast preparation is rate limited. Please try again later.",
      );
    });
    this.pending = result.catch(() => {});
    return result;
  }
}
export const castRequests = new CastRequests((url, init) => fetch(url, init));
