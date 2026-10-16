open Matcher
open Lwt.Infix

let count = ref 0

let check name c =
  incr count;
  if not c then failwith name

let request =
  Json.request_of_json
    (Yojson.Safe.from_string
       {|{"title":"Beat It","artists":["Michael Jackson"]}|})

let track =
  Domain.candidate ~source:"fixture" ~id:"a" ~title:request.title
    ~artists:request.artists ()

let response = Result.get_ok (Policy.resolve request [ track ])
let make url = Cache.create ~url ~scope:"test" ~positive:86400 ~negative:300

let unit_tests () =
  let cache = make "redis://127.0.0.1:6379" in
  let key r = Cache.key cache [ "fixture" ] r in
  check "key deterministic" (key request = key request);
  List.iter
    (fun r -> check "all constraints in key" (key r <> key request))
    [
      { request with title = "Other" };
      { request with artists = [ "Other" ] };
      { request with album = Some "Thriller" };
      { request with album_artist = Some "Artist" };
      { request with duration_ms = Some 200000L };
      {
        request with
        identifiers =
          { Domain.empty_identifiers with isrc = Some "USABC1212345" };
      };
    ];
  check "provider config in key"
    (Cache.key { cache with scope = "other" } [ "fixture" ] request
    <> key request);
  check "TTL in key"
    (Cache.key { cache with positive = 10 } [ "fixture" ] request <> key request);
  check "provider set in key"
    (Cache.key cache [ "other" ] request <> key request);
  check "positive TTL" (Cache.response_ttl cache ~now:1000. response = 86400);
  check "negative TTL"
    (Cache.response_ttl cache ~now:1000.
       (Result.get_ok (Policy.resolve request []))
    = 300);
  check "warning disables caching"
    (Cache.response_ttl cache ~now:1000.
       { response with warnings = [ "offline" ] }
    = 0);
  check "positive zero disables successful writes"
    (Cache.response_ttl { cache with positive = 0 } ~now:1000. response = 0);
  check "unknown preview expiry"
    (Cache.preview_ttl ~now:1000. "https://x/preview" = 300);
  check "direct preview expiry"
    (Cache.preview_ttl ~now:1000. "https://x/preview?expires=1200" = 140);
  check "signed preview expiry"
    (Cache.preview_ttl ~now:1000. "https://x/preview?hdnea=exp%3D1200~acl%3D*"
    = 140);
  check "earliest preview expiry"
    (Cache.preview_ttl ~now:1000. "https://x/preview?exp=1300&expires=1200"
    = 140);
  check "expired preview"
    (Cache.preview_ttl ~now:1000. "https://x/preview?exp=1001" = 0)

let with_redis f =
  let store = Hashtbl.create 8 in
  let commands = ref [] in
  let read_command ic =
    Cache.line ic >>= fun header ->
    let n = int_of_string (String.sub header 1 (String.length header - 1)) in
    Lwt_list.map_s
      (fun _ ->
        Cache.line ic >>= fun header ->
        let length =
          int_of_string (String.sub header 1 (String.length header - 1))
        in
        let bytes = Bytes.create (length + 2) in
        Lwt_io.read_into_exactly ic bytes 0 (length + 2) >|= fun () ->
        Bytes.sub_string bytes 0 length)
      (List.init n Fun.id)
  in
  let handler _ (ic, oc) =
    let rec loop () =
      read_command ic >>= fun args ->
      commands := args :: !commands;
      let reply =
        match args with
        | [ "AUTH"; "user"; "secret" ] | [ "SELECT"; "2" ] -> "+OK\r\n"
        | [ "GET"; key ] -> (
            match Hashtbl.find_opt store key with
            | None -> "$-1\r\n"
            | Some s when String.length s > Cache.max_bytes ->
                "$" ^ string_of_int (String.length s) ^ "\r\n"
            | Some s ->
                "$" ^ string_of_int (String.length s) ^ "\r\n" ^ s ^ "\r\n")
        | [ "SETEX"; key; ttl; value ] ->
            check "Redis TTL sent" (int_of_string ttl > 0);
            Hashtbl.replace store key value;
            "+OK\r\n"
        | _ -> "-ERR unexpected command\r\n"
      in
      Lwt_io.write oc reply >>= fun () -> Lwt_io.flush oc >>= loop
    in
    Lwt.catch loop (function End_of_file -> Lwt.return_unit | e -> Lwt.fail e)
  in
  let fd = Lwt_unix.socket Unix.PF_INET Unix.SOCK_STREAM 0 in
  Lwt_io.establish_server_with_client_address ~fd
    (Unix.ADDR_INET (Unix.inet_addr_loopback, 0))
    handler
  >>= fun server ->
  let port =
    match Lwt_unix.getsockname fd with
    | Unix.ADDR_INET (_, p) -> p
    | _ -> assert false
  in
  Lwt.finalize
    (fun () ->
      f
        ("redis://user:secret@127.0.0.1:" ^ string_of_int port ^ "/2")
        store commands)
    (fun () -> Lwt_io.shutdown_server server)

let runtime () =
  with_redis (fun url store commands ->
      let cache = make url in
      let key = Cache.key cache [ "fixture" ] request in
      Cache.get cache key >>= fun missing ->
      check "Redis miss" (missing = None);
      Cache.put cache key response >>= fun () ->
      Cache.get cache key >>= fun hit ->
      check "Redis hit roundtrip"
        (Option.map Yojson.Safe.to_string hit
        = Some (Yojson.Safe.to_string (Json.response_to_json response)));
      check "Redis ACL authentication"
        (List.mem [ "AUTH"; "user"; "secret" ] !commands
        && List.mem [ "SELECT"; "2" ] !commands);
      Hashtbl.replace store key "broken JSON";
      Cache.get cache key >>= fun hit ->
      check "corrupt JSON falls back" (hit = None);
      Hashtbl.replace store key (String.make (Cache.max_bytes + 1) 'x');
      Cache.get cache key >>= fun hit ->
      check "oversized entry falls back" (hit = None);
      Hashtbl.clear store;
      let called = ref 0 in
      let provider =
        Provider.make "fixture" (fun _ ->
            incr called;
            Lwt.return [ track ])
      in
      let service = Service.create ~cache [ provider ] in
      Service.resolve service request >>= fun (code, header, _) ->
      check "service cache miss" (code = 200 && header = "MISS");
      Service.resolve service request >>= fun (code, header, _) ->
      check "service cache hit" (code = 200 && header = "HIT" && !called = 1);
      Hashtbl.clear store;
      Cache.put cache key { response with warnings = [ "offline" ] }
      >>= fun () ->
      check "warnings not written" (Hashtbl.length store = 0);
      let unavailable = make "redis://127.0.0.1:1" in
      Service.resolve (Service.create ~cache:unavailable [ provider ]) request
      >|= fun (code, _, _) ->
      check "Redis outage does not fail matching" (code = 200))

let () =
  unit_tests ();
  Lwt_main.run (runtime ());
  Printf.printf "%d cache cases passed\n" !count
