export type Artist = {
  id: string;
  name: string;
  picture: string;
  playCount: number;
  sha256: string;
  tags: string[] | null;
  uniqueListeners: number;
  uri: string;
};
