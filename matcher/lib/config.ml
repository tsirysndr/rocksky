let env key =
  match Sys.getenv_opt key with
  | Some s when String.trim s <> "" -> Some s
  | _ -> None

let ttl key default maximum =
  match env key with
  | None -> default
  | Some s -> (
      match int_of_string_opt s with
      | Some n when n >= 0 && n <= maximum -> n
      | _ ->
          invalid_arg (key ^ " must be between 0 and " ^ string_of_int maximum))

let spotify_auth () =
  match (env "SPOTIFY_CLIENT_ID", env "SPOTIFY_CLIENT_SECRET") with
  | Some client_id, Some secret ->
      Spotify_auth.credentials ~client_id ~secret
        ~endpoint:
          (Option.value ~default:"https://accounts.spotify.com/api/token"
             (env "SPOTIFY_TOKEN_URL"))
  | None, None -> (
      match env "SPOTIFY_ACCESS_TOKEN" with
      | Some t -> Spotify_auth.Static t
      | None ->
          invalid_arg "configure Spotify credentials or SPOTIFY_ACCESS_TOKEN")
  | _ ->
      invalid_arg
        "both SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required"

let service () =
  let providers =
    [
      ("DEEZER_URL", "deezer");
      ("MUSICBRAINZ_URL", "musicbrainz");
      ("SPOTIFY_API_URL", "spotify");
    ]
    |> List.filter_map (fun (key, kind) ->
        Option.map
          (fun url ->
            let auth =
              if kind = "spotify" then Some (spotify_auth ()) else None
            in
            Providers.http ?auth kind url)
          (env key))
  in
  let database =
    Catalog.selected_url (env "XATA_READ_POSTGRES_URL") (env "DATABASE_URL")
  in
  let providers =
    providers
    @ match database with None -> [] | Some url -> [ Catalog.create url ]
  in
  if providers = [] then
    invalid_arg
      "configure DATABASE_URL, DEEZER_URL, MUSICBRAINZ_URL or SPOTIFY_API_URL";
  let cache =
    Option.bind (env "REDIS_URL") (fun url ->
        let positive = ttl "MATCHING_CACHE_TTL_SECONDS" 86400 604800 in
        let negative = ttl "MATCHING_CACHE_NEGATIVE_TTL_SECONDS" 300 3600 in
        let scope =
          `Assoc
            (List.map
               (fun key -> (key, Json.opt Json.s (env key)))
               [
                 "MATCHING_CACHE_NAMESPACE";
                 "DEEZER_URL";
                 "MUSICBRAINZ_URL";
                 "SPOTIFY_API_URL";
                 "SPOTIFY_CLIENT_ID";
                 "XATA_READ_POSTGRES_URL";
                 "DATABASE_URL";
               ])
          |> Yojson.Safe.to_string
        in
        try Some (Cache.create ~url ~scope ~positive ~negative)
        with Invalid_argument _ ->
          prerr_endline "matching: invalid Redis configuration; cache disabled";
          None)
  in
  Service.create ?cache providers
