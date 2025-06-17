export interface XataHighlight {
  name?: string[];
  title?: string[];
}

export interface BaseRecord {
  sha256: string;
  uri: string;
  xata_createdat: string;
  xata_highlight: XataHighlight;
  xata_id: string;
  xata_score: number;
  xata_table: string;
  xata_updatedat: string;
  xata_version: number;
  apple_music_link: string | null;
  spotify_link: string | null;
  tidal_link: string | null;
  youtube_link: string | null;
}

export interface ArtistRecord extends BaseRecord {
  name: string;
  picture: string;
  biography: string | null;
  born: string | null;
  born_in: string | null;
  died: string | null;
}

export interface TrackRecord extends BaseRecord {
  album: string;
  album_art: string;
  album_artist: string;
  album_uri: string;
  artist: string;
  artist_uri: string;
  disc_number: number;
  duration: number;
  title: string;
  track_number: number;
  composer: string | null;
  copyright_message: string | null;
  genre: string | null;
  label: string | null;
  lyrics: string | null;
  mb_id: string | null;
}

export interface AlbumRecord extends BaseRecord {
  title: string;
  album_art: string;
  artist: string;
  artist_uri: string;
  release_date: string;
  year: number;
}

export type RecordItem =
  | { table: "artists"; record: ArtistRecord }
  | { table: "tracks"; record: TrackRecord }
  | { table: "albums"; record: AlbumRecord };

export interface SearchResponse {
  totalCount: number;
  records: RecordItem[];
}
