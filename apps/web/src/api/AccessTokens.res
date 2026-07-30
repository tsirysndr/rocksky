@module("../consts") external apiUrl: string = "API_URL"

// Auth header, computed per call (matches access-tokens.ts's `authHeaders()`).
let authHeaders = (): Axios.config => {
  headers: Dict.fromArray([("authorization", Axios.bearer())]),
}

// These return the FULL axios response (callers read `.data`), matching the old
// `axios.post<T>(...)` / `axios.get<T>(...)` returns exactly. offset/size are
// serialized into the query string, identical to axios's `params`.
@genType
let createAccessToken = (name: string): promise<
  Axios.response<AccessToken.created>,
> => Axios.post(apiUrl ++ "/access-tokens", {"name": name}, authHeaders())

@genType
let getAccessTokens = (
  offset: option<int>,
  size: option<int>,
): promise<Axios.response<array<AccessToken.t>>> =>
  Axios.get(
    apiUrl ++
    "/access-tokens?offset=" ++
    offset->Option.getOr(0)->Int.toString ++
    "&size=" ++
    size->Option.getOr(50)->Int.toString,
    authHeaders(),
  )

@genType
let deleteAccessToken = (id: string): promise<Axios.response<unit>> =>
  Axios.delete(apiUrl ++ "/access-tokens/" ++ id, authHeaders())
