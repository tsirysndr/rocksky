@module("../consts") external apiUrl: string = "API_URL"

@genType
type trackRecommendation = {
  title?: string,
  artist?: string,
  album?: string,
  albumArt?: string,
  trackUri?: string,
  artistUri?: string,
  albumUri?: string,
  genres?: array<string>,
  recommendationScore?: float,
  source?: string,
  likesCount?: float,
}

@genType
type artistRecommendation = {
  id?: string,
  uri?: string,
  name?: string,
  picture?: string,
  genres?: array<string>,
  recommendationScore?: float,
  source?: string,
}

@genType
type albumRecommendation = {
  id?: string,
  uri?: string,
  title?: string,
  artist?: string,
  artistUri?: string,
  year?: float,
  albumArt?: string,
  recommendationScore?: float,
  source?: string,
}

type tracksResponse = {recommendations: Nullable.t<array<trackRecommendation>>}
type artistsResponse = {artists: Nullable.t<array<artistRecommendation>>}
type albumsResponse = {albums: Nullable.t<array<albumRecommendation>>}

@genType
let getTrackRecommendations = async (
  did: string,
  ~limit=50,
): array<trackRecommendation> => {
  let res: Axios.response<tracksResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.feed.getRecommendations",
    {headers: Axios.authHeadersIfToken(), params: {"did": did, "limit": limit}},
  )
  res.data.recommendations->Nullable.toOption->Option.getOr([])
}

@genType
let getArtistRecommendations = async (
  did: string,
  ~limit=50,
): array<artistRecommendation> => {
  let res: Axios.response<artistsResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.feed.getArtistRecommendations",
    {headers: Axios.authHeadersIfToken(), params: {"did": did, "limit": limit}},
  )
  res.data.artists->Nullable.toOption->Option.getOr([])
}

@genType
let getAlbumRecommendations = async (
  did: string,
  ~limit=50,
): array<albumRecommendation> => {
  let res: Axios.response<albumsResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.feed.getAlbumRecommendations",
    {headers: Axios.authHeadersIfToken(), params: {"did": did, "limit": limit}},
  )
  res.data.albums->Nullable.toOption->Option.getOr([])
}
