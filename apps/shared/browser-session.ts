import { hasSessionHint, isAppHandoff, SESSION_HINT } from "./homepage-routing";

function validToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    !!token.trim() &&
    token !== "undefined" &&
    token !== "null"
  );
}

function writeHint(signedIn: boolean): void {
  document.cookie = `${SESSION_HINT}=${signedIn ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${signedIn ? 2592000 : 0}${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function storeSessionToken(token: unknown): void {
  if (!validToken(token))
    throw new Error("Sign-in did not return a session token");
  localStorage.setItem("token", token);
  writeHint(true);
}

export function clearSessionToken(): void {
  localStorage.removeItem("token");
  writeHint(false);
}

/** Returns true when a full navigation is replacing this page. */
export function syncHomepageSession(surface: "app" | "landing"): boolean {
  try {
    const hadHint = hasSessionHint(document.cookie);
    const signedIn = validToken(localStorage.getItem("token"));
    writeHint(signedIn);
    const url = new URL(location.href);
    if (url.hostname !== "rocksky.app" || url.pathname !== "/") return false;
    if (surface === "landing" && signedIn) {
      // Existing localStorage sessions predate the cookie. The explicit shell
      // bypass also allows these sessions to work when cookies are disabled.
      url.searchParams.set("__rocksky_app", "1");
      location.replace(url.href);
      return true;
    }
    if (surface === "app" && hadHint && !signedIn && !isAppHandoff(url)) {
      // Only reload after clearing a stale hint, so deploying the app before
      // the proxy cannot create a reload loop for signed-out visitors.
      if (!hasSessionHint(document.cookie)) {
        location.replace(url.href);
        return true;
      }
    }
  } catch {
    // Restricted storage must not prevent the public page from rendering.
  }
  return false;
}
