export type Album = {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  year: number | null;
  uri: string;
  artistUri: string;
  playCount: number;
  uniqueListeners: number;
};
