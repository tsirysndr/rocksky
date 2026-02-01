export type Artist = {
  id: string;
  name: string;
  playCount: number;
  uniqueListeners: number;
  picture: string | null;
  uri: string;
  tags: string[] | null;
};
