// Convert an AT-Protocol record URI to an in-app route path.
//
//   at://did:plc:xyz/app.rocksky.artist/abc  →  /did:plc:xyz/artist/abc
//
// Returns "#" when the URI is missing or malformed, so callers can use the
// result directly as a router `to`/`href` without guarding — a record with a
// null uri renders as a non-navigating link instead of crashing on
// `undefined.split(...)` (which took down the genre page for genres like
// "Ska Punk" that contain an artist/album with no uri).
export function uriToPath(uri?: string | null): string {
  const rest = uri?.split("at://")[1]?.replace("app.rocksky.", "");
  return rest ? `/${rest}` : "#";
}
