open Matcher
open Lwt.Infix

let count = ref 0

let check name condition =
  incr count;
  if not condition then failwith name

let request =
  Json.request_of_json
    (Yojson.Safe.from_string
       {|{"title":"Beat It","artists":["Michael Jackson"]}|})

let track =
  Domain.candidate ~source:"fixture" ~id:"a" ~title:request.title
    ~artists:request.artists ()

let good = Provider.make "fixture" (fun _ -> Lwt.return [ track ])
let bad = Provider.make "bad" (fun _ -> Lwt.fail_with "offline")
let status json = Json.member "status" json

let with_server callback f =
  let socket = Lwt_unix.socket Unix.PF_INET Unix.SOCK_STREAM 0 in
  Lwt_unix.setsockopt socket Unix.SO_REUSEADDR true;
  Lwt_unix.bind socket (Unix.ADDR_INET (Unix.inet_addr_loopback, 0))
  >>= fun () ->
  Lwt_unix.listen socket 32;
  let port =
    match Lwt_unix.getsockname socket with
    | Unix.ADDR_INET (_, p) -> p
    | _ -> assert false
  in
  let stop, wake = Lwt.wait () in
  let server =
    Cohttp_lwt_unix.Server.create ~stop
      ~mode:(`TCP (`Socket socket))
      (Cohttp_lwt_unix.Server.make ~callback ())
  in
  Lwt.finalize
    (fun () -> f ("http://127.0.0.1:" ^ string_of_int port))
    (fun () ->
      Lwt.wakeup_later wake ();
      server)

let fetch base ?(content_type = "application/json") body =
  Http_io.call
    ~headers:(Cohttp.Header.init_with "content-type" content_type)
    ~body `POST
    (Uri.of_string (base ^ "/v1/match"))

let runtime () =
  Service.resolve (Service.create [ good ]) { request with title = "" }
  >>= fun (code, _, _) ->
  check "invalid request rejected before retrieval" (code = 400);
  Service.resolve (Service.create [ good; bad ]) request
  >>= fun (code, _, json) ->
  check "partial retrieval valid match"
    (code = 200
    && status json = `String "matched"
    && Json.member "warnings" json = `List [ `String "bad_unavailable" ]);
  Service.resolve (Service.create [ bad ]) request >>= fun (code, _, _) ->
  check "all retrieval failed is 503" (code = 503);
  Service.resolve (Service.create []) request >>= fun (code, _, _) ->
  check "no providers is 503" (code = 503);
  let empty = Provider.make "empty" (fun _ -> Lwt.return []) in
  Service.resolve (Service.create [ empty ]) request >>= fun (code, _, json) ->
  check "healthy empty retrieval"
    (code = 200 && status json = `String "unmatched");
  Service.resolve (Service.create [ empty; bad ]) request
  >>= fun (code, _, _) ->
  check "partial empty is 503" (code = 503);
  let canceled = ref false in
  let slow =
    Provider.make "slow" (fun _ ->
        Lwt.finalize
          (fun () -> Lwt_unix.sleep 1. >|= fun () -> [ track ])
          (fun () ->
            canceled := true;
            Lwt.return_unit))
  in
  let service = Service.create ~deadline:0.02 [ slow ] in
  Service.resolve service request >>= fun (code, _, _) ->
  check "deadline cancellation" (code = 503 && !canceled && service.active = 0);
  let gate, wake = Lwt.wait () in
  let blocked =
    Provider.make "blocked" (fun _ -> gate >|= fun () -> [ track ])
  in
  let service = Service.create ~capacity:1 [ blocked ] in
  let pending = Service.resolve service request in
  Service.resolve service request >>= fun (code, _, _) ->
  check "capacity exhausted" (code = 429 && service.active = 1);
  Lwt.wakeup_later wake ();
  pending >>= fun _ ->
  check "capacity released" (service.active = 0);
  let started = ref 0 in
  let parallel name =
    Provider.make name (fun _ ->
        incr started;
        Lwt_unix.sleep 0.01 >|= fun () -> [])
  in
  let pending =
    Service.resolve (Service.create [ parallel "one"; parallel "two" ]) request
  in
  check "providers start concurrently" (!started = 2);
  pending >>= fun _ ->
  with_server
    (Service.callback (Service.create [ good ]))
    (fun base ->
      Http_io.call `GET (Uri.of_string (base ^ "/health")) >>= fun (code, _) ->
      check "health" (code = 200);
      Client.match_track ~base_url:base request >>= fun matched ->
      check "typed client"
        (match matched with
        | Ok { Domain.decision = Domain.Matched _; _ } -> true
        | _ -> false);
      fetch base {|{"title":"Beat It","artists":["Michael Jackson"]}|}
      >>= fun (code, body) ->
      check "HTTP matched"
        (code = 200 && status (Yojson.Safe.from_string body) = `String "matched");
      fetch base
        {|{"title":"Beat It","artists":["Michael Jackson"],"album":"Wrong"}|}
      >>= fun (code, body) ->
      check "HTTP strict album"
        (code = 200
        && status (Yojson.Safe.from_string body) = `String "unmatched");
      Lwt_list.iter_s
        (fun body ->
          fetch base body >|= fun (code, _) ->
          check "HTTP bad input" (code = 400))
        [ "{"; "{}"; {|{"title":"A","artists":["B"],"albm":"C"}|} ]
      >>= fun () ->
      fetch base (String.make 16385 'x') >>= fun (code, _) ->
      check "HTTP body limit" (code = 413);
      fetch base ~content_type:"text/plain" "{}" >>= fun (code, _) ->
      check "HTTP content type" (code = 415);
      Http_io.call `GET (Uri.of_string (base ^ "/v1/match"))
      >>= fun (code, _) ->
      check "HTTP method" (code = 405);
      Http_io.call `GET (Uri.of_string (base ^ "/missing")) >|= fun (code, _) ->
      check "HTTP not found" (code = 404))
  >>= fun () ->
  let token_calls = ref 0 and gets = ref 0 in
  let callback _ req body =
    Cohttp_lwt.Body.to_string body >>= fun body ->
    match Uri.path (Cohttp.Request.uri req) with
    | "/token" ->
        incr token_calls;
        check "OAuth form" (body = "grant_type=client_credentials");
        check "OAuth basic auth"
          (Cohttp.Header.get (Cohttp.Request.headers req) "authorization"
          = Some ("Basic " ^ Base64.encode_exn "id:secret"));
        Service.respond 200
          (`Assoc
             [
               ("access_token", Json.s ("token" ^ string_of_int !token_calls));
               ("token_type", Json.s "Bearer");
               ("expires_in", `Int 3600);
             ])
    | "/tracks/abc" ->
        incr gets;
        if
          Cohttp.Header.get (Cohttp.Request.headers req) "authorization"
          = Some "Bearer token1"
        then Service.respond 401 (`Assoc [])
        else
          Service.respond 200
            (Yojson.Safe.from_string
               {|{"id":"abc","name":"Beat It","artists":[{"id":"artist","name":"Michael Jackson"}],"album":{"id":"album","name":"Thriller"}}|})
    | "/albums/album" ->
        Service.respond 200
          (Yojson.Safe.from_string {|{"id":"album","label":"Epic"}|})
    | "/artists/artist" ->
        Service.respond 200
          (Yojson.Safe.from_string
             {|{"id":"artist","genres":["pop"],"images":[{"url":"picture"}]}|})
    | "/search" ->
        check "Spotify search query"
          (Uri.get_query_param (Cohttp.Request.uri req) "q"
          = Some {|track:"Beat It" artist:"Michael Jackson"|});
        Service.respond 200
          (Yojson.Safe.from_string {|{"tracks":{"items":[]}}|})
    | _ -> Service.respond 404 (`Assoc [])
  in
  with_server callback (fun base ->
      let auth =
        Spotify_auth.credentials ~client_id:"id" ~secret:"secret"
          ~endpoint:(base ^ "/token")
      in
      Lwt_list.map_p (fun _ -> Spotify_auth.token auth) (List.init 10 Fun.id)
      >>= fun tokens ->
      check "OAuth shared renewal"
        (!token_calls = 1 && List.for_all (( = ) "token1") tokens);
      let provider = Providers.http ~auth "spotify" base in
      provider.candidates
        {
          request with
          identifiers =
            { Domain.empty_identifiers with spotify_track_id = Some "abc" };
        }
      >>= fun cs ->
      check "Spotify 401 renews once"
        (!token_calls = 2 && !gets = 2 && (List.hd cs).id = "abc");
      Spotify_auth.invalidate auth "token1" >>= fun () ->
      Spotify_auth.token auth >>= fun token ->
      check "old invalidation preserves newer token"
        (token = "token2" && !token_calls = 2);
      provider.enrich (List.hd cs) >>= fun c ->
      check "Spotify selected identity enrichment"
        (c.label = Some "Epic"
        && c.artist_picture = Some "picture"
        && c.genres = Some [ "pop" ]);
      provider.candidates request >|= fun cs ->
      check "Spotify search empty" (cs = []))
  >>= fun () ->
  with_server
    (fun _ req body ->
      Cohttp_lwt.Body.to_string body >>= fun body ->
      match Uri.path (Cohttp.Request.uri req) with
      | "/enrich" ->
          check "Deezer request body"
            (Json.member "artist" (Yojson.Safe.from_string body)
            = Json.s "Michael Jackson");
          Service.respond 200
            (Yojson.Safe.from_string
               {|{"track":{"id":42,"title":"Beat It","artist":"Michael Jackson","album":"Thriller"},"matches":[{"id":42,"title":"Beat It","artist":"Michael Jackson","album":"Thriller","score":0.9,"preview":"preview"}]}|})
      | "/track/42" ->
          Service.respond 200
            (Yojson.Safe.from_string
               {|{"id":42,"title":"Beat It","artist":{"name":"Michael Jackson"},"duration":240}|})
      | "/search" ->
          check "MusicBrainz raw search request"
            (Json.member "Track" (Yojson.Safe.from_string body)
            = Json.s "Beat It");
          Service.respond 200
            (Yojson.Safe.from_string
               {|[{"id":"mb","title":"Wrong","artist-credit":[{"name":"Michael Jackson"}]}]|})
      | "/recording/mb" ->
          Service.respond 200
            (Yojson.Safe.from_string
               {|{"trackMBID":"mb","name":"Beat It","artist":[{"name":"Michael Jackson"}]}|})
      | _ -> Service.respond 404 (`Assoc []))
    (fun base ->
      let deezer = Providers.http "deezer" base
      and mb = Providers.http "musicbrainz" base in
      deezer.candidates request >>= fun cs ->
      check "Deezer selected preserves search evidence"
        ((List.hd cs).provider_score = Some 90.
        && (List.hd cs).preview = Some "preview");
      deezer.candidates
        {
          request with
          identifiers =
            { Domain.empty_identifiers with deezer_track_id = Some "42" };
        }
      >>= fun cs ->
      check "Deezer direct route" ((List.hd cs).duration_ms = Some 240000L);
      mb.candidates request >>= fun cs ->
      check "MusicBrainz returned title independent"
        ((Result.get_ok (Policy.resolve request cs)).decision = Domain.Unmatched);
      mb.candidates
        {
          request with
          identifiers =
            {
              Domain.empty_identifiers with
              musicbrainz_recording_id = Some "mb";
            };
        }
      >|= fun cs ->
      check "MusicBrainz direct route"
        ((List.hd cs).identifiers.musicbrainz_recording_id = Some "mb"))

let transport_edges () =
  with_server
    (Service.callback (Service.create [ good ]))
    (fun base ->
      let body =
        Cohttp_lwt.Body.of_stream
          (Lwt_stream.of_list [ String.make 9000 'x'; String.make 9000 'y' ])
      in
      Cohttp_lwt_unix.Client.call ~chunked:true
        ~headers:(Cohttp.Header.init_with "content-type" "application/json")
        ~body `POST
        (Uri.of_string (base ^ "/v1/match"))
      >>= fun (response, body) ->
      Cohttp_lwt.Body.drain_body body >|= fun () ->
      check "chunked body limit"
        (Cohttp.Response.status response = `Request_entity_too_large))
  >>= fun () ->
  with_server
    (fun _ req _ ->
      match Uri.path (Cohttp.Request.uri req) with
      | "/slow" ->
          Lwt_unix.sleep 0.1 >>= fun () -> Service.respond 200 (`Assoc [])
      | "/large" ->
          Cohttp_lwt_unix.Server.respond_string ~status:`OK
            ~body:(String.make (Http_io.max_response_bytes + 1) 'x')
            ()
      | _ -> Service.respond 503 (`Assoc []))
    (fun base ->
      Lwt.catch
        (fun () ->
          Http_io.call ~timeout:0.01 `GET (Uri.of_string (base ^ "/slow"))
          >|= fun _ -> check "transport timeout" false)
        (function
          | Lwt_unix.Timeout ->
              check "transport timeout" true;
              Lwt.return_unit
          | e -> Lwt.fail e)
      >>= fun () ->
      Lwt.catch
        (fun () ->
          Http_io.call `GET (Uri.of_string (base ^ "/large")) >|= fun _ ->
          check "provider body limit" false)
        (function
          | Http_io.Too_large ->
              check "provider body limit" true;
              Lwt.return_unit
          | e -> Lwt.fail e)
      >>= fun () ->
      Client.match_track ~base_url:base request >|= fun result ->
      check "typed client propagates 503"
        (result = Error (Client.Http_status 503)))

let () =
  Lwt_main.run (runtime () >>= transport_edges);
  Printf.printf "%d runtime cases passed\n" !count
