// Errors carry `did`/`retryAfter` so callers can recover the typed guard
// failure after it crossed an Aff boundary.
export const mkError = (name) => (message) => (did) => (retryAfter) => {
  const e = new Error(message);
  e.name = name;
  e.did = did;
  e.retryAfter = retryAfter;
  return e;
};
