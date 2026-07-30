@module("../consts") external apiUrl: string = "API_URL"

let jsonAuthHeaders = (): Axios.headers =>
  Dict.fromArray([
    ("Content-Type", "application/json"),
    ("Authorization", Axios.bearer()),
  ])

let jsonAuth = (): Axios.config => {headers: jsonAuthHeaders()}

// Transport controls; the axios response was never consumed (the callers are
// react-query mutations whose data is ignored), so these return unit. Body is
// the empty object `{}`, matching the old `axios.put(url, {}, ...)`.
@genType
let play = async (): unit =>
  (await Axios.put(apiUrl ++ "/spotify/play", Dict.make(), jsonAuth()))->ignore

@genType
let pause = async (): unit =>
  (await Axios.put(apiUrl ++ "/spotify/pause", Dict.make(), jsonAuth()))->ignore

@genType
let next = async (): unit =>
  (await Axios.post(apiUrl ++ "/spotify/next", Dict.make(), jsonAuth()))->ignore

@genType
let previous = async (): unit =>
  (await Axios.post(apiUrl ++ "/spotify/previous", Dict.make(), jsonAuth()))->ignore

@genType
let seek = async (position_ms: float): unit =>
  (
    await Axios.putP(apiUrl ++ "/spotify/seek", Dict.make(), {
      headers: jsonAuthHeaders(),
      params: {"position_ms": position_ms},
    })
  )->ignore
