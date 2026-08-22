//// Pipe-friendly builder for RSQL filter expressions, accepted by the
//// `filter` parameter of the catalog and scrobble-feed queries
//// (`app.rocksky.song.getSongs`, `app.rocksky.artist.getArtists`,
//// `app.rocksky.album.getAlbums`, `app.rocksky.scrobble.getScrobbles`).
////
//// Fields are typed ([Field](#Field) — `filter.Artist`, `filter.Duration`,
//// dotted scrobble selectors like `filter.TrackArtist`, and a
//// `CustomField("…")` escape hatch), and the filter value is always the
//// first argument of the combinators, so expressions chain with `|>`:
////
////   filter.eq(filter.Artist, "Daft Punk")
////   |> filter.and(filter.gt(filter.Duration, 200_000))
////   |> filter.or(filter.in_list(filter.Genre, ["house", "electro"]))
////   |> filter.build
////   // artist=="Daft Punk";duration=gt=200000,genre=in=(house,electro)
////
//// String values are quoted and escaped automatically when they contain
//// characters RSQL reserves; `*` wildcards pass through unquoted so
//// `filter.eq(filter.Artist, "Daft*")` performs a case-insensitive match.

import gleam/int
import gleam/list
import gleam/string

/// A filterable field — the union of the known fields of the four
/// RSQL-filterable queries (songs, artists, albums, scrobbles). The dotted
/// `Track*` / `User*` / `Artist*` variants are the scrobble feed's joined
/// selectors. Any selector not covered here can be reached with
/// [CustomField](#Field).
pub type Field {
  /// `title`
  Title
  /// `artist`
  Artist
  /// `album`
  Album
  /// `albumArtist`
  AlbumArtist
  /// `genre`
  Genre
  /// `genres` (artists)
  Genres
  /// `composer`
  Composer
  /// `label`
  Label
  /// `duration`
  Duration
  /// `trackNumber`
  TrackNumber
  /// `discNumber`
  DiscNumber
  /// `mbId`
  MbId
  /// `isrc`
  Isrc
  /// `sha256`
  Sha256
  /// `uri`
  Uri
  /// `albumUri`
  AlbumUri
  /// `artistUri`
  ArtistUri
  /// `createdAt`
  CreatedAt
  /// `name` (artists)
  Name
  /// `bornIn` (artists)
  BornIn
  /// `born` (artists)
  Born
  /// `died` (artists)
  Died
  /// `year` (albums)
  Year
  /// `releaseDate` (albums)
  ReleaseDate
  /// `date` (scrobbles)
  Date
  /// `timestamp` (scrobbles)
  Timestamp
  /// `track.title` (scrobbles)
  TrackTitle
  /// `track.artist` (scrobbles)
  TrackArtist
  /// `track.album` (scrobbles)
  TrackAlbum
  /// `track.albumArtist` (scrobbles)
  TrackAlbumArtist
  /// `track.genre` (scrobbles)
  TrackGenre
  /// `track.duration` (scrobbles)
  TrackDuration
  /// `track.isrc` (scrobbles)
  TrackIsrc
  /// `track.mbId` (scrobbles)
  TrackMbId
  /// `user.did` (scrobbles)
  UserDid
  /// `user.handle` (scrobbles)
  UserHandle
  /// `user.displayName` (scrobbles)
  UserDisplayName
  /// `artist.name` (scrobbles)
  ArtistName
  /// `artist.genres` (scrobbles)
  ArtistGenres
  /// Escape hatch: any selector not covered above, passed through verbatim.
  CustomField(String)
}

fn field_to_selector(field: Field) -> String {
  case field {
    Title -> "title"
    Artist -> "artist"
    Album -> "album"
    AlbumArtist -> "albumArtist"
    Genre -> "genre"
    Genres -> "genres"
    Composer -> "composer"
    Label -> "label"
    Duration -> "duration"
    TrackNumber -> "trackNumber"
    DiscNumber -> "discNumber"
    MbId -> "mbId"
    Isrc -> "isrc"
    Sha256 -> "sha256"
    Uri -> "uri"
    AlbumUri -> "albumUri"
    ArtistUri -> "artistUri"
    CreatedAt -> "createdAt"
    Name -> "name"
    BornIn -> "bornIn"
    Born -> "born"
    Died -> "died"
    Year -> "year"
    ReleaseDate -> "releaseDate"
    Date -> "date"
    Timestamp -> "timestamp"
    TrackTitle -> "track.title"
    TrackArtist -> "track.artist"
    TrackAlbum -> "track.album"
    TrackAlbumArtist -> "track.albumArtist"
    TrackGenre -> "track.genre"
    TrackDuration -> "track.duration"
    TrackIsrc -> "track.isrc"
    TrackMbId -> "track.mbId"
    UserDid -> "user.did"
    UserHandle -> "user.handle"
    UserDisplayName -> "user.displayName"
    ArtistName -> "artist.name"
    ArtistGenres -> "artist.genres"
    CustomField(selector) -> selector
  }
}

/// One RSQL expression node. Build leaves with the comparison constructors
/// ([eq](#eq), [gt](#gt), [in_list](#in_list), …), combine them with
/// [and](#and) / [or](#or), and render with [build](#build).
pub opaque type Filter {
  Filter(expr: String, kind: Kind)
}

type Kind {
  Comparison
  AndNode
  OrNode
}

// ---- value rendering -----------------------------------------------------

fn is_safe_codepoint(cp: UtfCodepoint) -> Bool {
  let i = string.utf_codepoint_to_int(cp)
  // [A-Za-z0-9_.:@*+-] — `*` kept bare so wildcards work.
  { i >= 0x30 && i <= 0x39 }
  || { i >= 0x41 && i <= 0x5a }
  || { i >= 0x61 && i <= 0x7a }
  || i == 0x5f
  // _
  || i == 0x2e
  // .
  || i == 0x3a
  // :
  || i == 0x40
  // @
  || i == 0x2a
  // *
  || i == 0x2b
  // +
  || i == 0x2d
  // -
}

/// Bare iff non-empty and every char is in `[A-Za-z0-9_.:@*+-]`; otherwise
/// double-quoted with `\` escaped as `\\` and `"` as `\"`.
fn render_string(value: String) -> String {
  let safe =
    value != "" && list.all(string.to_utf_codepoints(value), is_safe_codepoint)
  case safe {
    True -> value
    False -> {
      let escaped =
        value
        |> string.replace("\\", "\\\\")
        |> string.replace("\"", "\\\"")
      "\"" <> escaped <> "\""
    }
  }
}

fn render_bool(value: Bool) -> String {
  case value {
    True -> "true"
    False -> "false"
  }
}

fn comparison(expr: String) -> Filter {
  Filter(expr, Comparison)
}

// ---- comparisons ---------------------------------------------------------

/// `field==value` — equals; `*` in the value is a wildcard.
pub fn eq(field: Field, value: String) -> Filter {
  comparison(field_to_selector(field) <> "==" <> render_string(value))
}

/// `field==value` — equals, integer value.
pub fn eq_int(field: Field, value: Int) -> Filter {
  comparison(field_to_selector(field) <> "==" <> int.to_string(value))
}

/// `field==true` / `field==false` — equals, boolean value.
pub fn eq_bool(field: Field, value: Bool) -> Filter {
  comparison(field_to_selector(field) <> "==" <> render_bool(value))
}

/// `field!=value` — not equals.
pub fn ne(field: Field, value: String) -> Filter {
  comparison(field_to_selector(field) <> "!=" <> render_string(value))
}

/// `field!=value` — not equals, integer value.
pub fn ne_int(field: Field, value: Int) -> Filter {
  comparison(field_to_selector(field) <> "!=" <> int.to_string(value))
}

/// `field!=true` / `field!=false` — not equals, boolean value.
pub fn ne_bool(field: Field, value: Bool) -> Filter {
  comparison(field_to_selector(field) <> "!=" <> render_bool(value))
}

/// `field=gt=value` — greater than.
pub fn gt(field: Field, value: Int) -> Filter {
  comparison(field_to_selector(field) <> "=gt=" <> int.to_string(value))
}

/// `field=ge=value` — greater than or equal.
pub fn ge(field: Field, value: Int) -> Filter {
  comparison(field_to_selector(field) <> "=ge=" <> int.to_string(value))
}

/// `field=lt=value` — less than.
pub fn lt(field: Field, value: Int) -> Filter {
  comparison(field_to_selector(field) <> "=lt=" <> int.to_string(value))
}

/// `field=le=value` — less than or equal.
pub fn le(field: Field, value: Int) -> Filter {
  comparison(field_to_selector(field) <> "=le=" <> int.to_string(value))
}

/// `field=in=(a,b)` — matches any of the values.
///
/// Panics when `values` is empty — an RSQL `in` needs at least one value.
pub fn in_list(field: Field, values: List(String)) -> Filter {
  case values {
    [] -> panic as "filter.in_list needs at least one value"
    _ -> {
      let rendered = values |> list.map(render_string) |> string.join(",")
      comparison(field_to_selector(field) <> "=in=(" <> rendered <> ")")
    }
  }
}

/// `field=out=(a,b)` — matches none of the values.
///
/// Panics when `values` is empty — an RSQL `out` needs at least one value.
pub fn out_list(field: Field, values: List(String)) -> Filter {
  case values {
    [] -> panic as "filter.out_list needs at least one value"
    _ -> {
      let rendered = values |> list.map(render_string) |> string.join(",")
      comparison(field_to_selector(field) <> "=out=(" <> rendered <> ")")
    }
  }
}

/// `field==null` — the field is NULL.
pub fn is_null(field: Field) -> Filter {
  comparison(field_to_selector(field) <> "==null")
}

/// `field!=null` — the field is not NULL.
pub fn is_not_null(field: Field) -> Filter {
  comparison(field_to_selector(field) <> "!=null")
}

// ---- combinators (pipe-first) --------------------------------------------

/// Both sides must match (`;`). An `or` operand is parenthesized to keep
/// RSQL precedence: `a |> filter.and(b)`.
pub fn and(a: Filter, b: Filter) -> Filter {
  Filter(in_and(a) <> ";" <> in_and(b), AndNode)
}

/// Either side may match (`,`): `a |> filter.or(b)`.
pub fn or(a: Filter, b: Filter) -> Filter {
  Filter(a.expr <> "," <> b.expr, OrNode)
}

fn in_and(f: Filter) -> String {
  case f.kind {
    OrNode -> "(" <> f.expr <> ")"
    _ -> f.expr
  }
}

/// The RSQL expression string to send as the `filter` query param.
pub fn build(f: Filter) -> String {
  f.expr
}
