@genType
type sharedArtistDetail = {
  id: string,
  name: string,
  picture: string,
  uri: string,
}

@genType
type t = {
  id: string,
  avatar: string,
  did: string,
  displayName: string,
  handle: string,
  sharedArtistsCount: float,
  similarityScore: float,
  topSharedArtistNames: array<string>,
  topSharedArtistsDetails: array<sharedArtistDetail>,
  userId: string,
}
