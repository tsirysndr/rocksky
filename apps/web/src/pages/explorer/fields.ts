export type FieldType = "string" | "number" | "date" | "string[]";

export type FieldDef = {
  name: string;
  type: FieldType;
  hint: string;
};

export type EntityKey =
  | "songs"
  | "albums"
  | "artists"
  | "playlists"
  | "scrobbles";

export type Entity = {
  key: EntityKey;
  label: string;
  fields: FieldDef[];
  examples: { label: string; filter: string }[];
};

const s = (name: string, hint: string): FieldDef => ({
  name,
  type: "string",
  hint,
});
const n = (name: string, hint: string): FieldDef => ({
  name,
  type: "number",
  hint,
});
const d = (name: string, hint: string): FieldDef => ({
  name,
  type: "date",
  hint,
});
const arr = (name: string, hint: string): FieldDef => ({
  name,
  type: "string[]",
  hint,
});

export const ENTITIES: Entity[] = [
  {
    key: "songs",
    label: "Songs",
    fields: [
      s("title", "Track title"),
      s("artist", "Track artist"),
      s("album", "Album name"),
      s("albumArtist", "Album artist"),
      s("genre", "Genre"),
      s("composer", "Composer"),
      s("label", "Record label"),
      n("duration", "Length in milliseconds"),
      n("trackNumber", "Position on the disc"),
      n("discNumber", "Disc number"),
      s("mbId", "MusicBrainz ID"),
      s("isrc", "ISRC code"),
      s("sha256", "Content hash"),
      s("uri", "at:// URI"),
      s("albumUri", "Album at:// URI"),
      s("artistUri", "Artist at:// URI"),
      d("createdAt", "First seen on Rocksky"),
    ],
    examples: [
      {
        label: "Long Daft Punk tracks",
        filter: 'artist=="Daft Punk";duration=gt=300000',
      },
      {
        label: "House or techno",
        filter: "genre=in=(House,Techno)",
      },
      {
        label: "Titles starting with Blue",
        filter: 'title=="Blue*"',
      },
    ],
  },
  {
    key: "albums",
    label: "Albums",
    fields: [
      s("title", "Album title"),
      s("artist", "Album artist"),
      n("year", "Release year"),
      s("releaseDate", "Release date"),
      s("sha256", "Content hash"),
      s("uri", "at:// URI"),
      s("artistUri", "Artist at:// URI"),
      d("createdAt", "First seen on Rocksky"),
    ],
    examples: [
      { label: "Nineties albums", filter: "year=ge=1990;year=le=1999" },
      { label: "Radiohead", filter: 'artist=="Radiohead"' },
      {
        label: "Recent additions",
        filter: "createdAt=gt=2026-01-01",
      },
    ],
  },
  {
    key: "artists",
    label: "Artists",
    fields: [
      s("name", "Artist name"),
      arr("genres", "Genre tags — use ==, !=, =in=, =out="),
      s("bornIn", "Place of birth / origin"),
      d("born", "Date of birth / formation"),
      d("died", "Date of death / split"),
      s("sha256", "Content hash"),
      s("uri", "at:// URI"),
      d("createdAt", "First seen on Rocksky"),
    ],
    examples: [
      { label: "Tagged jazz", filter: 'genres=="jazz"' },
      { label: "From France", filter: 'bornIn=="*France*"' },
      {
        label: "Electronic or ambient",
        filter: "genres=in=(electronic,ambient)",
      },
    ],
  },
  {
    key: "playlists",
    label: "Playlists",
    fields: [
      s("name", "Playlist name"),
      s("title", "Alias of name"),
      s("description", "Playlist description"),
      s("uri", "at:// URI"),
      s("spotifyLink", "Spotify URL"),
      s("tidalLink", "Tidal URL"),
      s("appleMusicLink", "Apple Music URL"),
      d("createdAt", "Created at"),
      d("updatedAt", "Last updated"),
      s("curatorDid", "Curator DID"),
      s("curatorHandle", "Curator handle"),
      s("curatorName", "Curator display name"),
      s("track.title", "Contains a track titled…"),
      s("track.artist", "Contains a track by…"),
      s("track.album", "Contains a track from album…"),
      s("track.albumArtist", "Contains a track whose album artist is…"),
    ],
    examples: [
      {
        label: "Contains Daft Punk",
        filter: 'track.artist=="Daft Punk"',
      },
      { label: "Named summer", filter: 'name=="*summer*"' },
      {
        label: "By one curator",
        filter: 'curatorHandle=="tsiry-sandratraina.com"',
      },
    ],
  },
  {
    key: "scrobbles",
    label: "Scrobbles",
    fields: [
      s("uri", "Scrobble at:// URI"),
      d("date", "When it was scrobbled"),
      d("timestamp", "Alias of date"),
      s("title", "Track title"),
      s("artist", "Track artist"),
      s("album", "Album name"),
      s("track.title", "Track title"),
      s("track.artist", "Track artist"),
      s("track.album", "Album name"),
      s("track.albumArtist", "Album artist"),
      s("track.genre", "Track genre"),
      n("track.duration", "Length in milliseconds"),
      s("track.isrc", "ISRC code"),
      s("track.mbId", "MusicBrainz ID"),
      s("user.did", "Listener DID"),
      s("user.handle", "Listener handle"),
      s("user.displayName", "Listener display name"),
      s("artist.name", "Artist name"),
      arr("artist.genres", "Artist genre tags"),
    ],
    examples: [
      {
        label: "This year, one artist",
        filter: 'artist=="Aphex Twin";date=gt=2026-01-01',
      },
      {
        label: "One listener's jazz",
        filter: 'user.handle=="tsiry-sandratraina.com";artist.genres=="jazz"',
      },
      {
        label: "Tracks over 8 minutes",
        filter: "track.duration=gt=480000",
      },
    ],
  },
];

export const entityOf = (key: EntityKey): Entity =>
  ENTITIES.find((e) => e.key === key) ?? ENTITIES[0];

export const fieldNames = (entity: Entity): Set<string> =>
  new Set(entity.fields.map((f) => f.name));

/** Operators that make sense for a field's type. */
export function opsFor(type: FieldType): { op: string; hint: string }[] {
  if (type === "string[]") {
    return [
      { op: "==", hint: "contains the tag" },
      { op: "!=", hint: "does not contain the tag" },
      { op: "=in=", hint: "overlaps any of" },
      { op: "=out=", hint: "overlaps none of" },
    ];
  }
  if (type === "number" || type === "date") {
    return [
      { op: "==", hint: "equals" },
      { op: "!=", hint: "not equal" },
      { op: "=gt=", hint: "greater than" },
      { op: "=ge=", hint: "greater or equal" },
      { op: "=lt=", hint: "less than" },
      { op: "=le=", hint: "less or equal" },
      { op: "=in=", hint: "one of" },
      { op: "=out=", hint: "none of" },
    ];
  }
  return [
    { op: "==", hint: "equals — * is a wildcard" },
    { op: "!=", hint: "not equal" },
    { op: "=in=", hint: "one of" },
    { op: "=out=", hint: "none of" },
  ];
}

/** Value suggestions we can offer without hitting the network. */
export function valuesFor(field: FieldDef | undefined): string[] {
  if (!field) return [];
  if (field.type === "date") {
    return ["2026-01-01", "2025-01-01", "2024-01-01"];
  }
  if (field.name === "duration" || field.name === "track.duration") {
    return ["180000", "300000", "480000"];
  }
  return ["null"];
}
