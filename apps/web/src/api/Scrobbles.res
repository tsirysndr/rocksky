// API base URL, reused from the (still-TS) consts module.
@module("../consts") external apiUrl: string = "API_URL"

@genType
type scrobbleInput = {
  title: string,
  artist: string,
  albumArtist: string,
  album?: string,
  duration?: float, // milliseconds
  albumArt?: string,
  timestamp?: float, // unix timestamp in seconds
  trackNumber?: float,
  copyrightMessage?: string,
  genres?: array<string>,
  releaseDate?: string,
  year?: float,
}

// Mirror the TS `Object.fromEntries(Object.entries(input).filter(([, v]) => v != null))`:
// drop null/undefined-valued keys before POSTing (the server rejects nulls).
let stripNullish: scrobbleInput => scrobbleInput = %raw(`
  (input) => Object.fromEntries(Object.entries(input).filter(([, v]) => v != null))
`)

@genType
let submitScrobble = async (input: scrobbleInput): unit => {
  let payload = stripNullish(input)
  let _ = await Axios.post(
    apiUrl ++ "/xrpc/app.rocksky.scrobble.createScrobble",
    payload,
    {headers: Dict.fromArray([("authorization", Axios.bearer())])},
  )
}
