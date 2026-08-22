@module("../consts") external apiUrl: string = "API_URL"

@genType
type provider = [#lastfm | #listenbrainz | #tealfm]

@genType
type mirrorSourceView = {
  provider: provider,
  enabled: bool,
  externalUsername?: string,
  hasCredentials: bool,
  lastPolledAt?: string,
  lastScrobbleSeenAt?: string,
}

@genType
type putMirrorSourceInput = {
  provider: provider,
  enabled?: bool,
  externalUsername?: string,
  // Omit to leave existing key unchanged. Empty string to clear.
  apiKey?: string,
}

// Auth header, computed per call (matches mirror.ts's `authHeader()`).
let authHeader = (): Axios.config => {
  headers: Dict.fromArray([("Authorization", Axios.bearer())]),
}

type sourcesResponse = {sources: Nullable.t<array<mirrorSourceView>>}

@genType
let getMirrorSources = async (): array<mirrorSourceView> => {
  let res: Axios.response<sourcesResponse> = await Axios.get(
    apiUrl ++ "/xrpc/app.rocksky.mirror.getMirrorSources",
    authHeader(),
  )
  res.data.sources->Nullable.toOption->Option.getOr([])
}

@genType
let putMirrorSource = async (input: putMirrorSourceInput): mirrorSourceView => {
  let res: Axios.response<mirrorSourceView> = await Axios.post(
    apiUrl ++ "/xrpc/app.rocksky.mirror.putMirrorSource",
    input,
    authHeader(),
  )
  res.data
}
