@module("../consts") external apiUrl: string = "API_URL"

@genType
type wrappedArtist = {
  id: string,
  name: string,
  picture?: string,
  uri?: string,
  playCount: float,
}

@genType
type wrappedTrack = {
  id: string,
  title: string,
  artist: string,
  albumArt?: string,
  uri?: string,
  artistUri?: string,
  albumUri?: string,
  playCount: float,
}

@genType
type wrappedAlbum = {
  id: string,
  title: string,
  artist: string,
  albumArt?: string,
  uri?: string,
  playCount: float,
}

@genType
type wrappedMilestone = {
  trackTitle: string,
  artistName: string,
  timestamp: string,
  trackUri?: string,
}

@genType
type topGenre = {genre: string, count: float}

@genType
type activeDay = {date: string, count: float}

@genType
type monthCount = {month: float, count: float}

@genType
type wrappedData = {
  year: float,
  totalScrobbles: float,
  totalListeningTimeMinutes: float,
  topArtists: array<wrappedArtist>,
  topTracks: array<wrappedTrack>,
  topAlbums: array<wrappedAlbum>,
  topGenres: array<topGenre>,
  mostActiveDay?: activeDay,
  mostActiveHour?: float,
  newArtistsCount: float,
  firstScrobble?: wrappedMilestone,
  lastScrobble?: wrappedMilestone,
  scrobblesPerMonth: array<monthCount>,
  longestStreak: float,
}

let authHeaders = (): Axios.config => {
  headers: Dict.fromArray([("Authorization", Axios.bearer())]),
}

@genType
let getWrapped = async (did: string, year: float): wrappedData => {
  let res: Axios.response<wrappedData> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.stats.getWrapped",
    {headers: authHeaders().headers, params: {"did": did, "year": year}},
  )
  res.data
}
