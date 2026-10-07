export function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Identification cancelled");
}

export function waitForMetadata(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  checkCancelled(signal);
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(new Error("Identification cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/** One shared lane for AcoustID and MusicBrainz: no bursts, including retries. */
export function createMetadataRequester({
  userAgent,
  fetchRequest = (url: string, init: RequestInit) => fetch(url, init),
  now = Date.now,
  wait = waitForMetadata,
}: {
  userAgent: () => string;
  fetchRequest?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}) {
  let nextRequestAt = 0;
  let tail: Promise<unknown> = Promise.resolve();

  async function run(url: string, init: RequestInit, signal?: AbortSignal) {
    for (let attempt = 0; attempt < 3; attempt++) {
      checkCancelled(signal);
      // Recheck the clock after waking (including an early timer or resume).
      while (now() < nextRequestAt) await wait(nextRequestAt - now(), signal);
      checkCancelled(signal);
      nextRequestAt = now() + 1100;
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(cancel, 20000);
      try {
        const headers = new Headers(init.headers);
        headers.set("User-Agent", userAgent());
        const response = await fetchRequest(url, {
          ...init,
          headers,
          signal: controller.signal,
        });
        checkCancelled(signal);
        if (response.status === 429 || response.status === 503) {
          const retry = response.headers.get("Retry-After");
          const seconds =
            retry !== null && /^\d+(\.\d+)?$/.test(retry)
              ? Number(retry) * 1000
              : 0;
          const dateDelay = retry && !seconds ? Date.parse(retry) - now() : 0;
          nextRequestAt = Math.max(
            nextRequestAt,
            now() +
              Math.max(
                seconds,
                Number.isFinite(dateDelay) ? dateDelay : 0,
                2000 * 2 ** attempt,
              ),
          );
          if (attempt < 2) continue;
        }
        if (!response.ok)
          throw new Error(
            `Metadata service returned ${response.status}. Try again later.`,
          );
        return await response.json();
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", cancel);
      }
    }
    throw new Error("Metadata lookup failed");
  }

  return (url: string, init: RequestInit = {}, signal?: AbortSignal) => {
    const task = tail.then(() => run(url, init, signal));
    tail = task.catch(() => undefined);
    return task;
  };
}
