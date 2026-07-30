// Thin, faithful binding to the axios calls the API layer uses. Semantics match
// the JS exactly: a non-2xx status rejects the promise and request/response
// bodies are auto-JSON. A typed `response.data` is an *unchecked* view — exactly
// what axios's own `.post<T>()` gives today; this migration adds no runtime
// validation, it only replaces `any` returns with concrete types.
//
// The shared foundation the ReScript API modules build on (analogous to
// atoms/Jotai.res for the state layer).

type headers = Dict.t<string>
type config = {headers: headers}
type response<'data> = {data: 'data}

// axios.post(url, body, { headers })
@module("axios")
external post: (string, 'body, config) => promise<response<'data>> = "post"

// `Bearer <token>` from localStorage, matching the JS template
// `Bearer ${localStorage.getItem("token")}` — an absent token renders as the
// literal string "null", just as `${null}` does, so behaviour is identical.
@scope("localStorage") @val
external getItem: string => Null.t<string> = "getItem"

let bearer = () => "Bearer " ++ getItem("token")->Null.toOption->Option.getOr("null")
