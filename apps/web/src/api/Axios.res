// Thin, faithful binding to the axios calls the API layer uses. Semantics match
// the JS exactly: a non-2xx status rejects the promise and request/response
// bodies are auto-JSON. A typed `response.data` is an *unchecked* view — exactly
// what axios's own `.post<T>()` gives today; this migration adds no runtime
// validation, it only replaces `any` returns with concrete types.
//
// The shared foundation the ReScript API modules build on (analogous to
// atoms/Jotai.res for the state layer).
//
// axios's HTTP verbs (get/post/delete) live on its *default* export
// (`import axios from "axios"; axios.post(...)`), NOT as named exports — the
// package only names `create`, `Axios`, `AxiosError`, … So we bind the default
// instance and call methods on it with `@send`. Binding them as named module
// exports would compile to `ns.post`, which is `undefined` at runtime.

type headers = Dict.t<string>
type config = {headers: headers}
type response<'data> = {data: 'data}

type t
@module("axios") external axios: t = "default"

@send external getReq: (t, string, config) => promise<response<'data>> = "get"
@send external postReq: (t, string, 'body, config) => promise<response<'data>> = "post"
@send external deleteReq: (t, string, config) => promise<response<'data>> = "delete"

let get = (url, config): promise<response<'data>> => axios->getReq(url, config)
let post = (url, body, config): promise<response<'data>> => axios->postReq(url, body, config)
let delete = (url, config): promise<response<'data>> => axios->deleteReq(url, config)

// `Bearer <token>` from localStorage, matching the JS template
// `Bearer ${localStorage.getItem("token")}` — an absent token renders as the
// literal string "null", just as `${null}` does, so behaviour is identical.
@scope("localStorage") @val
external getItem: string => Null.t<string> = "getItem"

let bearer = () => "Bearer " ++ getItem("token")->Null.toOption->Option.getOr("null")
