export type Scrobble = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumArt?: string;
  albumArtist: string;
  handle: string;
  trackUri: string;
  albumUri: string;
  artistUri: string;
  uri: string;
  createdAt: string;
};
