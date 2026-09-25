import { ATPASSPORT_CALLBACK_PATH } from "../../shared/homepage-routing";
import { handleError, normalizeHandle } from "./auth";

const STATE_KEY = "rocksky.atpassport.state";
const MAX_AGE = 10 * 60 * 1000;
type StateStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function startAtPassport(
  origin: string,
  storage: StateStorage,
  now = Date.now(),
): string {
  const state = crypto.randomUUID();
  storage.setItem(STATE_KEY, JSON.stringify({ state, createdAt: now }));
  const url = new URL("https://atpassport.net/authentication");
  url.searchParams.set(
    "callback",
    new URL(ATPASSPORT_CALLBACK_PATH, origin).href,
  );
  url.searchParams.set("atpstate", state);
  return url.href;
}

// AtPassport selects a handle; only Rocksky's subsequent OAuth flow authenticates
// it. Never use the returned DID, PDS URL, or token to establish a session.
export function consumeAtPassportCallback(
  url: URL,
  storage: StateStorage,
  now = Date.now(),
): string {
  const saved = storage.getItem(STATE_KEY);
  storage.removeItem(STATE_KEY);
  const invalid = new Error(
    "This AtPassport request expired or couldn’t be verified. Please try again.",
  );
  let request: { state?: unknown; createdAt?: unknown };
  try {
    request = JSON.parse(saved || "null");
  } catch {
    throw invalid;
  }
  if (
    url.pathname !== ATPASSPORT_CALLBACK_PATH ||
    !request ||
    typeof request.state !== "string" ||
    !request.state ||
    typeof request.createdAt !== "number" ||
    !Number.isFinite(request.createdAt) ||
    now < request.createdAt ||
    now - request.createdAt > MAX_AGE ||
    url.searchParams.getAll("atpstate").length !== 1 ||
    url.searchParams.get("atpstate") !== request.state
  )
    throw invalid;
  const handles = url.searchParams.getAll("handle");
  const usernames = url.searchParams.getAll("username");
  const handle = usernames[0] ?? handles[0] ?? "";
  if (
    handles.length > 1 ||
    usernames.length > 1 ||
    handleError(handle) ||
    (handles.length &&
      usernames.length &&
      normalizeHandle(handles[0]) !== normalizeHandle(usernames[0]))
  )
    throw new Error(
      "AtPassport didn’t return a valid handle. Please try again or enter your handle below.",
    );
  return normalizeHandle(handle);
}
