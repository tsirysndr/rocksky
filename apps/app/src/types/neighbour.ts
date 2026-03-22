export type Neighbour = {
  id: string;
  avatar: string;
  did: string;
  displayName: string;
  handle: string;
  sharedArtistsCount: number;
  similarityScore: number;
  topSharedArtistNames: string[];
  topSharedArtistsDetails: {
    id: string;
    name: string;
    picture: string;
    uri: string;
  }[];
  userId: string;
};
