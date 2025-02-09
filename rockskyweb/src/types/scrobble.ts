export type Scrobble = {
  track_id: {
    xata_id: string;
    title: string;
    artist: string;
    album: string;
    album_art?: string;
    album_artist: string;
    uri: string;
    duration: number;
  };
  album_id: {
    uri: string;
    album_art?: string;
    artist: string;
    release_date: string;
    title: string;
    xata_id: string;
    year: number;
  };
  uri: string;
  xata_createdat: string;
  xata_id: string;
};
