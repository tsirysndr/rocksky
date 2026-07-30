@module("../consts") external apiUrl: string = "API_URL"

// Auth header captured at module load, matching apikeys.ts's module-level const.
let headers: Axios.config = {headers: Dict.fromArray([("authorization", Axios.bearer())])}

// Full axios responses (callers read `.data`), matching the old `axios.<verb><T>`.
@genType
let createApiKey = (
  name: string,
  description: option<string>,
): promise<Axios.response<ApiKey.t>> =>
  Axios.post(apiUrl ++ "/apikeys", {"name": name, "description": description}, headers)

@genType
let getApiKeys = (
  offset: option<int>,
  size: option<int>,
): promise<Axios.response<array<ApiKey.t>>> =>
  Axios.get(
    apiUrl ++
    "/apikeys?offset=" ++
    offset->Option.getOr(0)->Int.toString ++
    "&size=" ++
    size->Option.getOr(20)->Int.toString,
    headers,
  )

@genType
let deleteApiKey = (id: string): promise<Axios.response<unit>> =>
  Axios.delete(apiUrl ++ "/apikeys/" ++ id, headers)

@genType
let updateApiKey = (
  id: string,
  enabled: bool,
  name: option<string>,
  description: option<string>,
): promise<Axios.response<ApiKey.t>> =>
  Axios.put(
    apiUrl ++ "/apikeys/" ++ id,
    {"name": name, "description": description, "enabled": enabled},
    headers,
  )
