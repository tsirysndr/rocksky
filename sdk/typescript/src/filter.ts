/**
 * Fluent builder for RSQL filter expressions, accepted by the `filter`
 * parameter of the catalog and scrobble-feed queries
 * (app.rocksky.song.getSongs, app.rocksky.artist.getArtists,
 * app.rocksky.album.getAlbums, app.rocksky.scrobble.getScrobbles).
 *
 * ```ts
 * import { Filter } from "@rocksky/sdk";
 *
 * const filter = Filter.eq("artist", "Daft Punk")
 *   .and(Filter.gt("duration", 200_000))
 *   .or(Filter.in("genre", ["house", "electro"]));
 *
 * await client.catalogSongs(50, 0, undefined, filter);
 * // artist=="Daft Punk";duration=gt=200000,genre=in=(house,electro)
 * ```
 *
 * String values are quoted and escaped automatically when they contain
 * characters RSQL reserves; `*` wildcards pass through unquoted so
 * `Filter.eq("artist", "Daft*")` performs a case-insensitive match.
 */
export type FilterValue = string | number | boolean;

/** Characters that never need quoting in an RSQL value (`*` kept bare so wildcards work). */
const SAFE_VALUE = /^[A-Za-z0-9_.:@*+-]+$/;

const renderValue = (value: FilterValue): string => {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value.length > 0 && SAFE_VALUE.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

type NodeKind = "comparison" | "and" | "or";

export class Filter {
  private constructor(
    private readonly expr: string,
    private readonly kind: NodeKind,
  ) {}

  private static comparison(field: string, op: string, value: FilterValue): Filter {
    return new Filter(`${field}${op}${renderValue(value)}`, "comparison");
  }

  private static list(field: string, op: string, values: FilterValue[]): Filter {
    if (values.length === 0) {
      throw new Error(`Filter.${op === "=in=" ? "in" : "out"}("${field}", ...) needs at least one value`);
    }
    return new Filter(`${field}${op}(${values.map(renderValue).join(",")})`, "comparison");
  }

  /** `field==value` — equals; `*` in string values is a wildcard. */
  static eq(field: string, value: FilterValue): Filter {
    return Filter.comparison(field, "==", value);
  }

  /** `field!=value` — not equals. */
  static ne(field: string, value: FilterValue): Filter {
    return Filter.comparison(field, "!=", value);
  }

  /** `field=gt=value` — greater than. */
  static gt(field: string, value: FilterValue): Filter {
    return Filter.comparison(field, "=gt=", value);
  }

  /** `field=ge=value` — greater than or equal. */
  static ge(field: string, value: FilterValue): Filter {
    return Filter.comparison(field, "=ge=", value);
  }

  /** `field=lt=value` — less than. */
  static lt(field: string, value: FilterValue): Filter {
    return Filter.comparison(field, "=lt=", value);
  }

  /** `field=le=value` — less than or equal. */
  static le(field: string, value: FilterValue): Filter {
    return Filter.comparison(field, "=le=", value);
  }

  /** `field=in=(a,b)` — matches any of the values. */
  static in(field: string, values: FilterValue[]): Filter {
    return Filter.list(field, "=in=", values);
  }

  /** `field=out=(a,b)` — matches none of the values. */
  static out(field: string, values: FilterValue[]): Filter {
    return Filter.list(field, "=out=", values);
  }

  /** `field==null` — the field is NULL. */
  static isNull(field: string): Filter {
    return new Filter(`${field}==null`, "comparison");
  }

  /** `field!=null` — the field is not NULL. */
  static isNotNull(field: string): Filter {
    return new Filter(`${field}!=null`, "comparison");
  }

  /** Both sides must match (`;`). An `or` operand is parenthesized to keep RSQL precedence. */
  and(other: Filter): Filter {
    return new Filter(`${this.renderIn("and")};${other.renderIn("and")}`, "and");
  }

  /** Either side may match (`,`). */
  or(other: Filter): Filter {
    return new Filter(`${this.expr},${other.expr}`, "or");
  }

  private renderIn(parent: "and"): string {
    return this.kind === "or" ? `(${this.expr})` : this.expr;
  }

  /** The RSQL expression string to send as the `filter` query param. */
  build(): string {
    return this.expr;
  }

  toString(): string {
    return this.expr;
  }
}

/** Filterable fields of app.rocksky.song.getSongs. */
export const SongFields = {
  title: "title",
  artist: "artist",
  album: "album",
  albumArtist: "albumArtist",
  genre: "genre",
  composer: "composer",
  label: "label",
  duration: "duration",
  trackNumber: "trackNumber",
  discNumber: "discNumber",
  mbId: "mbId",
  isrc: "isrc",
  sha256: "sha256",
  uri: "uri",
  albumUri: "albumUri",
  artistUri: "artistUri",
  createdAt: "createdAt",
} as const;

/** Filterable fields of app.rocksky.album.getAlbums. */
export const AlbumFields = {
  title: "title",
  artist: "artist",
  year: "year",
  releaseDate: "releaseDate",
  sha256: "sha256",
  uri: "uri",
  artistUri: "artistUri",
  createdAt: "createdAt",
} as const;

/** Filterable fields of app.rocksky.artist.getArtists. */
export const ArtistFields = {
  name: "name",
  genres: "genres",
  bornIn: "bornIn",
  born: "born",
  died: "died",
  sha256: "sha256",
  uri: "uri",
  createdAt: "createdAt",
} as const;

/** Filterable fields of app.rocksky.playlist.getPlaylists (`track.*` selectors match the playlist's contents). */
export const PlaylistFields = {
  name: "name",
  title: "title",
  description: "description",
  uri: "uri",
  spotifyLink: "spotifyLink",
  tidalLink: "tidalLink",
  appleMusicLink: "appleMusicLink",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  curatorDid: "curatorDid",
  curatorHandle: "curatorHandle",
  curatorName: "curatorName",
  trackTitle: "track.title",
  trackArtist: "track.artist",
  trackAlbum: "track.album",
  trackAlbumArtist: "track.albumArtist",
} as const;

/** Filterable fields of app.rocksky.scrobble.getScrobbles (dotted selectors reach the joined track/user/artist). */
export const ScrobbleFields = {
  uri: "uri",
  date: "date",
  timestamp: "timestamp",
  title: "title",
  artist: "artist",
  album: "album",
  trackTitle: "track.title",
  trackArtist: "track.artist",
  trackAlbum: "track.album",
  trackAlbumArtist: "track.albumArtist",
  trackGenre: "track.genre",
  trackDuration: "track.duration",
  trackIsrc: "track.isrc",
  trackMbId: "track.mbId",
  userDid: "user.did",
  userHandle: "user.handle",
  userDisplayName: "user.displayName",
  artistName: "artist.name",
  artistGenres: "artist.genres",
} as const;
