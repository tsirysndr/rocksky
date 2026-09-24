// This cookie selects a public HTML shell. It is never an authentication credential.
export const SESSION_HINT = "rocksky_session_hint";

export function hasSessionHint(cookie: string): boolean {
  return cookie.split(";").some((part) => part.trim() === `${SESSION_HINT}=1`);
}

export function isAppHandoff(url: URL): boolean {
  return (
    url.searchParams.has("did") ||
    url.searchParams.has("cli") ||
    url.searchParams.get("session") === "expired" ||
    url.searchParams.get("__rocksky_app") === "1"
  );
}
