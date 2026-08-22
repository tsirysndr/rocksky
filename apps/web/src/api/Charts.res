@module("../consts") external apiUrl: string = "API_URL"

// One point on a scrobbles-over-time chart. Shape inferred from the sole
// consumer (ScrobblesAreaChart: recharts dataKeys "date" and "count") — the
// endpoint response was untyped `any` before.
@genType
type chartPoint = {
  date: string,
  count: float,
}

// The endpoint returns `{ scrobbles: [...] }`; the query hooks read `.scrobbles`.
@genType
type chartData = {scrobbles: array<chartPoint>}

let publicGet: Axios.config = {headers: Dict.make()}

// Placeholder kept for parity — the TS module returned [] here too (the real
// scrobbles chart lives on the inline useChart hook via SWR).
@genType
let getScrobblesChart = (): array<chartPoint> => []

// NOTE: the old `if (response.status !== 200) return []` guard was dead code —
// axios rejects the promise on any non-2xx before that line runs — so these
// just return the parsed body. Behaviour is unchanged.
@genType
let getSongChart = async (uri: string): chartData => {
  let res: Axios.response<chartData> = await Axios.get(
    apiUrl ++ "/xrpc/app.rocksky.charts.getScrobblesChart?songuri=" ++ uri,
    publicGet,
  )
  res.data
}

@genType
let getArtistChart = async (uri: string): chartData => {
  let res: Axios.response<chartData> = await Axios.get(
    apiUrl ++ "/xrpc/app.rocksky.charts.getScrobblesChart?artisturi=" ++ uri,
    publicGet,
  )
  res.data
}

@genType
let getAlbumChart = async (uri: string): chartData => {
  let res: Axios.response<chartData> = await Axios.get(
    apiUrl ++ "/xrpc/app.rocksky.charts.getScrobblesChart?albumuri=" ++ uri,
    publicGet,
  )
  res.data
}

@genType
let getProfileChart = async (did: string): chartData => {
  let res: Axios.response<chartData> = await Axios.get(
    apiUrl ++ "/xrpc/app.rocksky.charts.getScrobblesChart?did=" ++ did,
    publicGet,
  )
  res.data
}

@genType
let getGenreChart = async (genre: string): chartData => {
  let res: Axios.response<chartData> = await Axios.get(
    apiUrl ++ "/xrpc/app.rocksky.charts.getScrobblesChart?genre=" ++ genre,
    publicGet,
  )
  res.data
}
