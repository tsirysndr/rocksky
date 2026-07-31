// Convert an AT-Protocol record URI to an in-app route path.
//
//   at://did:plc:xyz/app.rocksky.artist/abc  →  /did:plc:xyz/artist/abc
//
// Returns "#" when the URI is missing or malformed, so callers can use the
// result directly as a router `to`/`href` without guarding — a record with a
// null uri renders as a non-navigating link instead of crashing on
// `undefined.split(...)` (which took down the genre page for genres like
// "Ska Punk" that contain an artist/album with no uri).
//
// `Nullable.t<string>` maps, via genType, to `string | null | undefined` on the
// TS side — so existing callers passing a plain `string` keep type-checking,
// and a runtime null/undefined still routes through the "#" branch.
@genType
let uriToPath = (uri: Nullable.t<string>): string =>
  switch uri->Nullable.toOption {
  | None => "#"
  | Some(u) =>
    switch u->String.split("at://")->Array.get(1) {
    | None => "#"
    | Some(afterScheme) =>
      let rest = afterScheme->String.replace("app.rocksky.", "")
      rest === "" ? "#" : `/${rest}`
    }
  }
