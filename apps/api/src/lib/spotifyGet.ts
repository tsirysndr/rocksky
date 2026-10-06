import { setTimeout as delay } from "node:timers/promises";
import { consola } from "consola";

const MAX_SPOTIFY_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// The whole matchSong pipeline runs under Effect.timeout("10 seconds"), so a
// single Spotify call has to give up well before that — otherwise the timeout
// never fires here and the pipeline is torn down with requests still in flight.
export const SPOTIFY_TIMEOUT_MS = 5000;

// Longest Retry-After we are willing to wait out inline. Anything longer means
// the app is properly rate limited: give up on Spotify and let Deezer answer.
const MAX_RETRY_AFTER_MS = 3000;

const sleep = async (ms: number, signal?: AbortSignal): Promise<void> => {
  await delay(ms, undefined, { signal });
};

// SpotifyRequestError carries the upstream status so callers can tell a rate
// limit apart from a bad token or a genuine miss.
export class SpotifyRequestError extends Error {
  constructor(
    readonly status: number,
    readonly operation: string,
    message?: string,
  ) {
    super(message ?? `Spotify ${operation} failed: ${status}`);
    this.name = "SpotifyRequestError";
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

const isAbort = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "AbortError" || error.name === "TimeoutError");

// spotifyGet performs one authenticated GET against the Spotify proxy, with a
// real request timeout and status-aware retries.
//
// The timeout is handed to fetch as a signal rather than raced against the
// promise: abandoning a promise leaves the socket open, so the request keeps
// occupying a slot in the proxy's rate limiter until Node's 300s socket
// timeout fires. That is what turned every retry into a wasted queue slot and
// filled the proxy's log with 502s.
export const spotifyGet = async <T>(
  url: string,
  accessToken: string,
  operation: string,
  signal?: AbortSignal,
): Promise<T> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_SPOTIFY_RETRIES; attempt++) {
    const backoffMs = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
    signal?.throwIfAborted();
    const isLastAttempt = attempt === MAX_SPOTIFY_RETRIES - 1;
    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(SPOTIFY_TIMEOUT_MS)])
          : AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
      });
    } catch (error) {
      // Repeating a timed-out catalog search compounds overload. Let the
      // caller use its alternate metadata provider instead.
      if (isAbort(error) || signal?.aborted) throw error;
      lastError =
        error instanceof Error
          ? error
          : new Error(`Spotify ${operation} failed: ${String(error)}`);
      if (isLastAttempt) throw lastError;
      consola.warn(
        `Spotify ${operation} network error, retrying attempt=${attempt + 1}/${MAX_SPOTIFY_RETRIES} delay_ms=${backoffMs}`,
      );
      await sleep(backoffMs, signal);
      continue;
    }

    if (response.ok) {
      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new SpotifyRequestError(
          response.status,
          operation,
          `Spotify ${operation} returned a malformed body: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // 429 from Spotify itself or from the proxy's own queue: both send a
    // Retry-After telling us exactly how long to hold off.
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "");
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffMs;

      if (isLastAttempt || waitMs > MAX_RETRY_AFTER_MS) {
        throw new SpotifyRequestError(
          429,
          operation,
          `Spotify ${operation} rate limited (retry-after: ${retryAfter || "unset"}s)`,
        );
      }
      consola.warn(
        `Spotify ${operation} rate limited, waiting ${waitMs}ms (attempt=${attempt + 1}/${MAX_SPOTIFY_RETRIES})`,
      );
      await sleep(waitMs, signal);
      continue;
    }

    if (response.status >= 500) {
      lastError = new SpotifyRequestError(response.status, operation);
      if (isLastAttempt) throw lastError;
      consola.warn(
        `Spotify ${operation} returned ${response.status}, retrying attempt=${attempt + 1}/${MAX_SPOTIFY_RETRIES} delay_ms=${backoffMs}`,
      );
      await sleep(backoffMs, signal);
      continue;
    }

    // 400/401/403/404 — retrying with the same token and query cannot help.
    throw new SpotifyRequestError(response.status, operation);
  }

  throw lastError ?? new Error(`Spotify ${operation} exhausted its retries`);
};
