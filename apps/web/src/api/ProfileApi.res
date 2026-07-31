// NOTE: named ProfileApi (not Profile) to avoid a flat-namespace collision with
// types/Profile.res — ReScript modules are global by filename.
@module("../consts") external apiUrl: string = "API_URL"

// Per-actor stats (fields taken from every consumer read; matches atoms/stats).
@genType
type profileStats = {
  scrobbles: float,
  artists: float,
  lovedTracks: float,
  albums: float,
  tracks: float,
}

// Site-wide stats — note `users` instead of `lovedTracks`.
@genType
type globalStats = {
  scrobbles: float,
  users: float,
  artists: float,
  albums: float,
  tracks: float,
}

@genType
type neighboursResponse = {neighbours: array<Neighbour.t>}

@genType
type compatibilityResponse = {compatibility: Null.t<Compatibility.t>}

type scrobblesResponse = {scrobbles: Nullable.t<array<Scrobble.t>>}

let authHeaders = (): Axios.headers => Dict.fromArray([("Authorization", Axios.bearer())])

@genType
let getProfileByDid = async (did: string): Profile.t => {
  let res: Axios.response<Profile.t> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.actor.getProfile",
    {headers: Dict.make(), params: {"did": did}},
  )
  res.data
}

@genType
let getProfileStatsByDid = async (did: string): profileStats => {
  let res: Axios.response<profileStats> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.stats.getStats",
    {headers: Dict.make(), params: {"did": did}},
  )
  res.data
}

@genType
let getGlobalStats = async (): globalStats => {
  let res: Axios.response<globalStats> = await Axios.get(
    apiUrl ++ "/xrpc/app.rocksky.stats.getGlobalStats",
    {headers: Dict.make()},
  )
  res.data
}

@genType
let getRecentTracksByDid = async (
  did: string,
  ~offset=0,
  ~limit=10,
): array<Scrobble.t> => {
  let res: Axios.response<scrobblesResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.actor.getActorScrobbles",
    {headers: Dict.make(), params: {"did": did, "offset": offset, "limit": limit}},
  )
  res.data.scrobbles->Nullable.toOption->Option.getOr([])
}

@genType
let getActorNeighbours = async (did: string): neighboursResponse => {
  let res: Axios.response<neighboursResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.actor.getActorNeighbours",
    {headers: Dict.make(), params: {"did": did}},
  )
  res.data
}

@genType
let getActorCompatibility = async (did: string): compatibilityResponse => {
  let res: Axios.response<compatibilityResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.actor.getActorCompatibility",
    {headers: authHeaders(), params: {"did": did}},
  )
  res.data
}
