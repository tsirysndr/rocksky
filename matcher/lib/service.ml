open Lwt.Infix
open Domain

type t = {
  providers : Provider.t list;
  cache : Cache.t option;
  deadline : float;
  capacity : int;
  mutable active : int;
}

let create ?cache ?(deadline = 8.) ?(capacity = 32) providers =
  if deadline <= 0. || capacity <= 0 then invalid_arg "invalid service limits";
  { providers; cache; deadline; capacity; active = 0 }

let error message = `Assoc [ ("error", Json.s message) ]

let resolve_validated t request =
  let names = List.map (fun p -> p.Provider.name) t.providers in
  let key = Option.map (fun c -> Cache.key c names request) t.cache in
  (match (t.cache, key) with
    | Some cache, Some key -> Cache.get cache key
    | _ -> Lwt.return_none)
  >>= function
  | Some json -> Lwt.return (200, "HIT", json)
  | None when t.active >= t.capacity ->
      Lwt.return (429, "BYPASS", error "matching service busy")
  | None ->
      t.active <- t.active + 1;
      Lwt.finalize
        (fun () ->
          Lwt_list.map_p
            (fun p ->
              Lwt.catch
                (fun () ->
                  Lwt_unix.with_timeout t.deadline (fun () ->
                      p.Provider.candidates request)
                  >>= fun cs ->
                  if List.length cs > 2000 then
                    Lwt.fail_with "provider candidate limit exceeded"
                  else Lwt.return (Ok cs))
                (function
                  | Lwt.Canceled -> Lwt.fail Lwt.Canceled
                  | _ -> Lwt.return (Error p.Provider.name)))
            t.providers
          >>= fun results ->
          let candidates =
            List.concat_map (function Ok cs -> cs | Error _ -> []) results
          in
          let failed =
            List.filter_map
              (function Error p -> Some p | Ok _ -> None)
              results
            |> List.sort_uniq String.compare
          in
          match Policy.resolve request candidates with
          | Error e ->
              Lwt.return (400, "BYPASS", error (Request.error_message e))
          | Ok response
            when t.providers = [] || (failed <> [] && response.candidates = [])
            ->
              Lwt.return
                ( 503,
                  "BYPASS",
                  `Assoc
                    [
                      ("error", Json.s "candidate retrieval incomplete");
                      ("failedProviders", Json.strings failed);
                    ] )
          | Ok response ->
              let response =
                {
                  response with
                  warnings = List.map (fun p -> p ^ "_unavailable") failed;
                }
              in
              (match response.decision with
                | Matched track -> (
                    match
                      List.find_opt
                        (fun p -> p.Provider.name = track.source)
                        t.providers
                    with
                    | None -> Lwt.return response
                    | Some p ->
                        Lwt.catch
                          (fun () ->
                            Lwt_unix.with_timeout 1. (fun () -> p.enrich track)
                            >|= fun enriched ->
                            (* Only presentation fields may be enriched after selection. *)
                            {
                              response with
                              decision =
                                Matched
                                  {
                                    track with
                                    label = enriched.label;
                                    genres = enriched.genres;
                                    artist_picture = enriched.artist_picture;
                                  };
                            })
                          (function
                            | Lwt.Canceled -> Lwt.fail Lwt.Canceled
                            | _ -> Lwt.return response))
                | _ -> Lwt.return response)
              >>= fun response ->
              (match (t.cache, key) with
                | Some cache, Some key -> Cache.put cache key response
                | _ -> Lwt.return_unit)
              >|= fun () ->
              ( 200,
                (if t.cache = None then "BYPASS" else "MISS"),
                Json.response_to_json response ))
        (fun () ->
          t.active <- t.active - 1;
          Lwt.return_unit)

let resolve t request =
  match Request.validate request with
  | Error e -> Lwt.return (400, "BYPASS", error (Request.error_message e))
  | Ok () -> resolve_validated t request

let respond ?(cache = "BYPASS") status body =
  let headers =
    Cohttp.Header.of_list
      [
        ("content-type", "application/json");
        ("x-matching-cache", cache);
        ("connection", "close");
      ]
  in
  Cohttp_lwt_unix.Server.respond_string ~headers
    ~status:(Cohttp.Code.status_of_code status)
    ~body:(Yojson.Safe.to_string body)
    ()

let callback t _conn req body =
  let path = Uri.path (Cohttp.Request.uri req) in
  match (Cohttp.Request.meth req, path) with
  | `GET, "/health" -> respond 200 (`Assoc [ ("status", Json.s "ok") ])
  | `POST, "/v1/match" ->
      Lwt.catch
        (fun () ->
          let headers = Cohttp.Request.headers req in
          let content_type =
            Cohttp.Header.get headers "content-type" |> Option.value ~default:""
          in
          let media =
            String.lowercase_ascii
              (String.trim (List.hd (String.split_on_char ';' content_type)))
          in
          if media <> "application/json" then
            respond 415 (error "content-type must be application/json")
          else
            let length =
              Option.bind
                (Cohttp.Header.get headers "content-length")
                Int64.of_string_opt
            in
            if Option.fold ~none:false ~some:(fun n -> n > 16384L) length then
              respond 413 (error "request body too large")
            else
              Lwt_unix.with_timeout 8. (fun () ->
                  Http_io.read_bounded ~limit:16384 body)
              >>= fun text ->
              match Json.decode_request text with
              | Error message -> respond 400 (error message)
              | Ok request ->
                  resolve t request >>= fun (status, cache, json) ->
                  respond ~cache status json)
        (function
          | Http_io.Too_large -> respond 413 (error "request body too large")
          | Lwt_unix.Timeout -> respond 408 (error "request body timeout")
          | Lwt.Canceled -> Lwt.fail Lwt.Canceled
          | _ -> respond 500 (error "internal matching error"))
  | _, ("/health" | "/v1/match") -> respond 405 (error "method not allowed")
  | _ -> respond 404 (error "not found")

let serve ?stop ~bind t =
  let uri = Uri.of_string ("http://" ^ bind) in
  let host = Option.value ~default:"127.0.0.1" (Uri.host uri) in
  let port = Option.value ~default:8097 (Uri.port uri) in
  Lwt_unix.getaddrinfo host (string_of_int port)
    [ Unix.AI_SOCKTYPE Unix.SOCK_STREAM ]
  >>= function
  | [] -> Lwt.fail_with "unable to resolve bind address"
  | addr :: _ ->
      let socket = Lwt_unix.socket addr.Unix.ai_family Unix.SOCK_STREAM 0 in
      Lwt_unix.setsockopt socket Unix.SO_REUSEADDR true;
      Lwt.finalize
        (fun () ->
          Lwt_unix.bind socket addr.Unix.ai_addr >>= fun () ->
          Lwt_unix.listen socket 128;
          Cohttp_lwt_unix.Server.create ?stop ~timeout:15
            ~mode:(`TCP (`Socket socket))
            ~on_exn:(fun _ -> prerr_endline "matching: HTTP connection failed")
            (Cohttp_lwt_unix.Server.make ~callback:(callback t) ()))
        (fun () ->
          Lwt.catch (fun () -> Lwt_unix.close socket) (fun _ -> Lwt.return_unit))
