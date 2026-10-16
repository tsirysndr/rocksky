open Lwt.Infix
open Domain

let max_bytes = 2 * 1024 * 1024
let timeout = 0.2

type t = { uri : Uri.t; scope : string; positive : int; negative : int }

let create ~url ~scope ~positive ~negative =
  let uri = Uri.of_string url in
  if Uri.scheme uri <> Some "redis" || Uri.host uri = None then
    invalid_arg "cache requires redis:// URL";
  if positive < 0 || positive > 604800 || negative < 0 || negative > 3600 then
    invalid_arg "invalid cache TTL";
  { uri; scope; positive; negative }

let key t providers request =
  let content =
    `List
      [
        Json.s policy_version;
        Json.s t.scope;
        `Int t.positive;
        `Int t.negative;
        Json.strings (List.sort String.compare providers);
        Json.request_to_json request;
      ]
    |> Yojson.Safe.to_string
  in
  "rocksky:matching:ocaml:v1:"
  ^ Digestif.SHA256.(to_hex (digest_string content))

let preview_ttl ~now url =
  let expiry =
    Uri.query (Uri.of_string url)
    |> List.concat_map (fun (key, values) ->
        List.concat_map
          (fun value ->
            if key = "exp" || key = "expires" then [ Int64.of_string_opt value ]
            else
              String.split_on_char '~' value
              |> List.filter_map (fun part ->
                  if String.starts_with ~prefix:"exp=" part then
                    Some
                      (Int64.of_string_opt
                         (String.sub part 4 (String.length part - 4)))
                  else None))
          values)
    |> List.filter_map Fun.id
  in
  match expiry with
  | [] -> 300
  | xs ->
      let remaining =
        Int64.to_float (List.fold_left Int64.min Int64.max_int xs) -. now -. 60.
      in
      if remaining <= 0. then 0
      else if remaining > 604800. then 604800
      else int_of_float remaining

let response_ttl t ~now r =
  if r.warnings <> [] then 0
  else
    let ttl =
      match r.decision with Matched _ -> t.positive | _ -> t.negative
    in
    let candidates =
      (match r.decision with Matched c -> [ c ] | _ -> [])
      @ List.map (fun c -> c.track) r.candidates
    in
    List.fold_left
      (fun ttl c ->
        match c.preview with
        | None -> ttl
        | Some url -> min ttl (preview_ttl ~now url))
      ttl candidates

(* Bounded RESP2 subset: GET/SETEX/AUTH/SELECT only. New connections ensure a
   timed-out command cannot leave a stale response for the next request. *)
let line ic =
  let buffer = Buffer.create 32 in
  let rec loop () =
    Lwt_io.read_char ic >>= fun c ->
    if c = '\n' then
      let s = Buffer.contents buffer in
      if not (String.ends_with ~suffix:"\r" s) then
        Lwt.fail_with "invalid RESP line"
      else Lwt.return (String.sub s 0 (String.length s - 1))
    else if Buffer.length buffer >= 1024 then
      Lwt.fail_with "oversized RESP header"
    else (
      Buffer.add_char buffer c;
      loop ())
  in
  loop ()

let command ic oc args =
  let encoded =
    "*"
    ^ string_of_int (List.length args)
    ^ "\r\n"
    ^ String.concat ""
        (List.map
           (fun s ->
             "$" ^ string_of_int (String.length s) ^ "\r\n" ^ s ^ "\r\n")
           args)
  in
  Lwt_io.write oc encoded >>= fun () ->
  Lwt_io.flush oc >>= fun () ->
  line ic >>= fun header ->
  if header = "" then Lwt.fail_with "empty RESP"
  else
    match header.[0] with
    | '+' -> Lwt.return_some (String.sub header 1 (String.length header - 1))
    | '$' ->
        let length =
          int_of_string (String.sub header 1 (String.length header - 1))
        in
        if length = -1 then Lwt.return_none
        else if length < 0 || length > max_bytes then
          Lwt.fail_with "oversized RESP bulk"
        else
          let bytes = Bytes.create (length + 2) in
          Lwt_io.read_into_exactly ic bytes 0 (length + 2) >>= fun () ->
          if Bytes.sub_string bytes length 2 <> "\r\n" then
            Lwt.fail_with "invalid RESP bulk"
          else Lwt.return_some (Bytes.sub_string bytes 0 length)
    | _ -> Lwt.fail_with "Redis command failed"

let execute t args =
  Lwt_unix.with_timeout timeout (fun () ->
      Lwt_unix.getaddrinfo
        (Option.get (Uri.host t.uri))
        (string_of_int (Option.value ~default:6379 (Uri.port t.uri)))
        [ Unix.AI_SOCKTYPE Unix.SOCK_STREAM ]
      >>= function
      | [] -> Lwt.fail_with "Redis host unavailable"
      | address :: _ ->
          Lwt_io.with_connection address.Unix.ai_addr (fun (ic, oc) ->
              let auth =
                match Uri.password t.uri with
                | None -> Lwt.return_unit
                | Some password ->
                    let user = Uri.user t.uri in
                    let args =
                      match user with
                      | Some u when u <> "" -> [ "AUTH"; u; password ]
                      | _ -> [ "AUTH"; password ]
                    in
                    command ic oc args >|= fun _ -> ()
              in
              auth >>= fun () ->
              let database = Uri.path t.uri in
              (if database = "" || database = "/" then Lwt.return_unit
               else
                 let n =
                   int_of_string
                     (String.sub database 1 (String.length database - 1))
                 in
                 if n < 0 then Lwt.fail_with "invalid Redis database"
                 else
                   command ic oc [ "SELECT"; string_of_int n ] >|= fun _ -> ())
              >>= fun () -> command ic oc args))

let valid_response json =
  try
    let response = Json.response_of_json json in
    Json.member "policyVersion" json = Json.s policy_version
    && response.warnings = []
  with Json.Decode_error _ -> false

let get t key =
  Lwt.catch
    (fun () ->
      execute t [ "GET"; key ] >|= function
      | Some body ->
          let json = Yojson.Safe.from_string body in
          if valid_response json then Some json else None
      | None -> None)
    (function Lwt.Canceled -> Lwt.fail Lwt.Canceled | _ -> Lwt.return_none)

let put t key response =
  let ttl = response_ttl t ~now:(Unix.gettimeofday ()) response in
  let body = Yojson.Safe.to_string (Json.response_to_json response) in
  if ttl = 0 || String.length body > max_bytes then Lwt.return_unit
  else
    Lwt.catch
      (fun () ->
        execute t [ "SETEX"; key; string_of_int ttl; body ] >|= fun _ -> ())
      (function Lwt.Canceled -> Lwt.fail Lwt.Canceled | _ -> Lwt.return_unit)
