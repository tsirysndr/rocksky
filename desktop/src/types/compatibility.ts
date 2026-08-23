export type Compatibility = {
  compatibilityLevel: number;
  compatibilityPercentage: number;
  sharedArtists: number;
  topSharedArtists: string[];
  topSharedDetailedArtists: {
    id: string;
    name: string;
    picture: string;
    uri: string;
    user1Rank: number;
    user2Rank: number;
    weight: number;
  }[];
  user1ArtistCount: number;
  user2ArtistCount: number;
};
