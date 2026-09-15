import axios, { type AxiosInstance } from "axios";

/** The AppView's error code for "your Rocksky JWT is still valid, but the OAuth
 * session with your PDS is gone". Mirrors `pdsSessionExpired` in
 * apps/api/src/lib/agent.ts. Nothing can restore that session server-side, so
 * retrying is pointless — the only way out is a fresh sign-in. */
const PDS_SESSION_EXPIRED = "pds_session_expired";

/**
 * Matches either transport the app talks to the AppView over: an axios
 * rejection keeps the body on `response.data`, while the SDK's `RockskyError`
 * flattens it to `kind`.
 */
export function isPdsSessionExpired(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as {
    status?: unknown;
    kind?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  // SDK: `new RockskyError(res.data, res.status)` sets kind = data.error.
  if (e.status === 401 && e.kind === PDS_SESSION_EXPIRED) return true;
  if (e.response?.status !== 401) return false;
  const data = e.response.data as { error?: unknown } | undefined;
  return data?.error === PDS_SESSION_EXPIRED;
}

let signingOut = false;

/**
 * Drop the local session and send the user back to sign in. Idempotent: one
 * screen has many requests in flight and they all 401 together, so without the
 * guard this would fire a redirect per failed request.
 */
export function handleSessionExpired(): void {
  if (signingOut) return;
  signingOut = true;
  localStorage.removeItem("token");
  localStorage.removeItem("did");
  // A full navigation rather than a router push, matching the sign-out menu
  // item: it also drops every jotai atom still holding profile state.
  window.location.href = "/?session=expired";
}

/**
 * Install the guard on the global axios — the `api/*.ts` modules call `axios.*`
 * directly — plus any created instances, which do not inherit interceptors
 * from the global default.
 */
export function installSessionGuard(...instances: AxiosInstance[]): void {
  for (const instance of [axios as unknown as AxiosInstance, ...instances]) {
    instance.interceptors.response.use(undefined, (error: unknown) => {
      if (isPdsSessionExpired(error)) handleSessionExpired();
      return Promise.reject(error);
    });
  }
}
