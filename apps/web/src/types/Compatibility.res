@genType
type sharedDetailedArtist = {
  id: string,
  name: string,
  picture: string,
  uri: string,
  user1Rank: float,
  user2Rank: float,
  weight: float,
}

@genType
type t = {
  compatibilityLevel: float,
  compatibilityPercentage: float,
  sharedArtists: float,
  topSharedArtists: array<string>,
  topSharedDetailedArtists: array<sharedDetailedArtist>,
  user1ArtistCount: float,
  user2ArtistCount: float,
}
