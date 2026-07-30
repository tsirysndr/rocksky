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

// Exposed via genType so API modules that return the full axios response (the
// callers read `.data`, e.g. react-query `select: r => r.data`) get a named
// `{ readonly data: T }` shape on the TS side.
@genType
type response<'data> = {data: 'data}

type t
@module("axios") external axios: t = "default"

@send external getReq: (t, string, config) => promise<response<'data>> = "get"
@send external postReq: (t, string, 'body, config) => promise<response<'data>> = "post"
@send external putReq: (t, string, 'body, config) => promise<response<'data>> = "put"
@send external deleteReq: (t, string, config) => promise<response<'data>> = "delete"

let get = (url, config): promise<response<'data>> => axios->getReq(url, config)
let post = (url, body, config): promise<response<'data>> => axios->postReq(url, body, config)
let put = (url, body, config): promise<response<'data>> => axios->putReq(url, body, config)
let delete = (url, config): promise<response<'data>> => axios->deleteReq(url, config)

// Config carrying axios `params`. axios serializes them into the query string
// with its default serializer (arrays -> repeated `key[]=`), and DROPS keys
// whose value is undefined — so callers pass optional params freely, matching
// the old TS `{ params: { at, cursor, ... } }` behaviour exactly.
type configP<'params> = {headers: headers, params: 'params}

@send external getReqP: (t, string, configP<'params>) => promise<response<'data>> = "get"
@send external postReqP: (t, string, 'body, configP<'params>) => promise<response<'data>> = "post"
@send external putReqP: (t, string, 'body, configP<'params>) => promise<response<'data>> = "put"

let getP = (url, config): promise<response<'data>> => axios->getReqP(url, config)
let postP = (url, body, config): promise<response<'data>> => axios->postReqP(url, body, config)
let putP = (url, body, config): promise<response<'data>> => axios->putReqP(url, body, config)

// `Bearer <token>` from localStorage, matching the JS template
// `Bearer ${localStorage.getItem("token")}` — an absent token renders as the
// literal string "null", just as `${null}` does, so behaviour is identical.
@scope("localStorage") @val
external getItem: string => Null.t<string> = "getItem"

// Header dict with Authorization only when a token exists — some endpoints send
// no auth header at all (rather than "Bearer null") for anonymous requests.
let authHeadersIfToken = (): headers =>
  switch getItem("token")->Null.toOption {
  | Some(t) => Dict.fromArray([("Authorization", "Bearer " ++ t)])
  | None => Dict.make()
  }

let bearer = () => "Bearer " ++ getItem("token")->Null.toOption->Option.getOr("null")
