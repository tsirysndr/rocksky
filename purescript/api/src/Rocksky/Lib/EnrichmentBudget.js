export const anySignalImpl = (signals) => () => AbortSignal.any(signals);
export const abortedSignal = () => AbortSignal.abort();
export const isAborted = (signal) => () => signal.aborted;

const reason = (signal) =>
  signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? "aborted"));

export const abortReason = (signal) => () => reason(signal);

// Calls back once with the abort reason; returns the listener's remover.
export const onAbortImpl = (signal) => (cb) => () => {
  if (signal.aborted) {
    cb(reason(signal))();
    return () => {};
  }
  const handler = () => cb(reason(signal))();
  signal.addEventListener("abort", handler, { once: true });
  return () => signal.removeEventListener("abort", handler);
};

export const newAbortController = () => new AbortController();
export const controllerSignal = (c) => c.signal;
export const abortController = (c) => () => c.abort();

export const isAbortError = (e) =>
  e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
