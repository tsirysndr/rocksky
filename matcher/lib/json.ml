open Domain

exception Decode_error of string

let fail field = raise (Decode_error ("invalid or missing " ^ field))
let object_fields = function `Assoc xs -> xs | _ -> fail "object"

let member key j =
  List.assoc_opt key (object_fields j) |> Option.value ~default:`Null

let string = function `String s -> s | _ -> fail "string"
let list f = function `List xs -> List.map f xs | _ -> fail "array"
let optional f = function `Null -> None | j -> Some (f j)

let int64 = function
  | `Int n -> Int64.of_int n
  | `Intlit s -> ( try Int64.of_string s with _ -> fail "64-bit integer")
  | _ -> fail "integer"

let unsigned j =
  let n = int64 j in
  if n < 0L then fail "nonnegative integer" else n

let float = function
  | `Float n when Float.is_finite n -> n
  | `Int n -> float_of_int n
  | _ -> fail "finite number"

let opt_string key j = optional string (member key j)
let opt_int key j = optional unsigned (member key j)

let strict allowed j =
  let seen = Hashtbl.create 16 in
  List.iter
    (fun (key, _) ->
      if not (List.mem key allowed) then fail ("unknown field " ^ key);
      if Hashtbl.mem seen key then fail ("duplicate field " ^ key);
      Hashtbl.add seen key ())
    (object_fields j)

let ids_of_json j =
  strict
    [
      "musicbrainzRecordingId";
      "musicbrainzReleaseId";
      "isrc";
      "spotifyTrackId";
      "deezerTrackId";
    ]
    j;
  {
    musicbrainz_recording_id = opt_string "musicbrainzRecordingId" j;
    musicbrainz_release_id = opt_string "musicbrainzReleaseId" j;
    isrc = opt_string "isrc" j;
    spotify_track_id = opt_string "spotifyTrackId" j;
    deezer_track_id = opt_string "deezerTrackId" j;
  }

let ids j =
  match List.assoc_opt "identifiers" (object_fields j) with
  | None -> empty_identifiers
  | Some v -> ids_of_json v

let request_of_json j =
  strict
    [ "title"; "artists"; "album"; "albumArtist"; "durationMs"; "identifiers" ]
    j;
  {
    title = string (member "title" j);
    artists = list string (member "artists" j);
    album = opt_string "album" j;
    album_artist = opt_string "albumArtist" j;
    duration_ms = opt_int "durationMs" j;
    identifiers = ids j;
  }

let decode_request body =
  try
    let r = request_of_json (Yojson.Safe.from_string body) in
    match Request.validate r with
    | Ok () -> Ok r
    | Error e -> Error (Request.error_message e)
  with
  | Decode_error s -> Error s
  | Yojson.Json_error _ -> Error "invalid JSON"

let candidate_of_json j =
  let c =
    candidate
      ~source:(string (member "source" j))
      ~id:(string (member "id" j))
      ~title:(string (member "title" j))
      ~artists:(list string (member "artists" j))
      ()
  in
  {
    c with
    album = opt_string "album" j;
    album_artist = opt_string "albumArtist" j;
    duration_ms = opt_int "durationMs" j;
    identifiers = ids j;
    version = opt_string "version" j;
    album_type = opt_string "albumType" j;
    release_status = opt_string "releaseStatus" j;
    release_date = opt_string "releaseDate" j;
    country = opt_string "country" j;
    album_art = opt_string "albumArt" j;
    track_number = opt_int "trackNumber" j;
    disc_number = opt_int "discNumber" j;
    label = opt_string "label" j;
    genres = optional (list string) (member "genres" j);
    artist_picture = opt_string "artistPicture" j;
    musicbrainz_artists =
      optional
        (list (fun a -> (string (member "mbid" a), string (member "name" a))))
        (member "musicbrainzArtists" j);
    spotify_link = opt_string "spotifyLink" j;
    provider_score = optional float (member "providerScore" j);
    provider_rank = optional int64 (member "providerRank" j);
    provider_link = opt_string "providerLink" j;
    preview = opt_string "preview" j;
  }

let s x = `String x
let strings xs = `List (List.map s xs)
let opt f = function None -> `Null | Some x -> f x
let integer n = `Intlit (Int64.to_string n)

let ids_to_json ids =
  `Assoc (List.map (fun (k, v) -> (k, opt s v)) (identifier_values ids))

let request_to_json (r : request) =
  `Assoc
    [
      ("title", s r.title);
      ("artists", strings r.artists);
      ("album", opt s r.album);
      ("albumArtist", opt s r.album_artist);
      ("durationMs", opt integer r.duration_ms);
      ("identifiers", ids_to_json r.identifiers);
    ]

let candidate_to_json (c : candidate) =
  `Assoc
    [
      ("source", s c.source);
      ("id", s c.id);
      ("title", s c.title);
      ("artists", strings c.artists);
      ("album", opt s c.album);
      ("albumArtist", opt s c.album_artist);
      ("durationMs", opt integer c.duration_ms);
      ("identifiers", ids_to_json c.identifiers);
      ("version", opt s c.version);
      ("albumType", opt s c.album_type);
      ("releaseStatus", opt s c.release_status);
      ("releaseDate", opt s c.release_date);
      ("country", opt s c.country);
      ("albumArt", opt s c.album_art);
      ("trackNumber", opt integer c.track_number);
      ("discNumber", opt integer c.disc_number);
      ("label", opt s c.label);
      ("genres", opt strings c.genres);
      ("artistPicture", opt s c.artist_picture);
      ( "musicbrainzArtists",
        opt
          (fun xs ->
            `List
              (List.map
                 (fun (mbid, name) ->
                   `Assoc [ ("mbid", s mbid); ("name", s name) ])
                 xs))
          c.musicbrainz_artists );
      ("spotifyLink", opt s c.spotify_link);
      ( "providerScore",
        opt
          (fun f -> if Float.is_finite f then `Float f else `Null)
          c.provider_score );
      ("providerRank", opt integer c.provider_rank);
      ("providerLink", opt s c.provider_link);
      ("preview", opt s c.preview);
    ]

let status = function
  | Matched _ -> "matched"
  | Ambiguous _ -> "ambiguous"
  | Unmatched -> "unmatched"

let response_to_json r =
  `Assoc
    [
      ("policyVersion", s policy_version);
      ("status", s (status r.decision));
      ( "track",
        match r.decision with Matched c -> candidate_to_json c | _ -> `Null );
      ( "candidates",
        `List
          (List.map
             (fun c ->
               `Assoc
                 [
                   ("track", candidate_to_json c.track);
                   ("reasons", strings c.evidence);
                   ("rank", `List (List.map (fun n -> `Int n) c.rank));
                 ])
             r.candidates) );
      ( "rejected",
        `List
          (List.map
             (fun r ->
               `Assoc
                 [
                   ("source", s r.candidate.source);
                   ("id", s r.candidate.id);
                   ("reasons", strings (List.map rejection_code r.reasons));
                 ])
             r.rejected) );
      ("warnings", strings r.warnings);
    ]

let rejection_of_code = function
  | "missing_candidate_identity" -> Missing_candidate_identity
  | "title_mismatch" -> Title_mismatch
  | "artist_mismatch" -> Artist_mismatch
  | "album_mismatch" -> Album_mismatch
  | "album_artist_mismatch" -> Album_artist_mismatch
  | "unrequested_version" -> Version_mismatch
  | "identifier_conflict" -> Identifier_conflict
  | "identifiers_unverified" -> Identifiers_unverified
  | "invalid_candidate_metadata" -> Invalid_candidate_metadata
  | "duration_mismatch" -> Duration_mismatch
  | code -> (
      let kinds = identifier_values empty_identifiers |> List.map fst in
      match List.find_opt (fun kind -> code = kind ^ "_conflict") kinds with
      | Some kind -> Identifier_mismatch kind
      | None -> Other_rejection code)

let response_of_json j =
  let version = string (member "policyVersion" j) in
  if not (List.mem version [ "2"; policy_version ]) then fail "policyVersion";
  let candidates =
    list
      (fun c ->
        let rank =
          list
            (fun n ->
              let n = int64 n in
              if n > Int64.of_int max_int || n < Int64.of_int min_int then
                fail "rank";
              Int64.to_int n)
            (member "rank" c)
        in
        if List.length rank <> 5 then fail "rank";
        {
          track = candidate_of_json (member "track" c);
          evidence = list string (member "reasons" c);
          rank;
        })
      (member "candidates" j)
  in
  let decision =
    match (member "status" j, member "track" j) with
    | `String "matched", (`Assoc _ as track) when candidates <> [] ->
        let track = candidate_of_json track in
        if
          not
            (List.exists
               (fun c -> c.track.source = track.source && c.track.id = track.id)
               candidates)
        then fail "selected candidate";
        Matched track
    | `String "ambiguous", `Null when List.length candidates >= 2 ->
        let rank = (List.hd candidates).rank in
        let tied = List.filter (fun c -> c.rank = rank) candidates in
        if List.length tied < 2 then fail "ambiguous rank";
        Ambiguous (List.map (fun c -> c.track) tied)
    | `String "unmatched", `Null when candidates = [] -> Unmatched
    | _ -> fail "status/track"
  in
  let rejected =
    list
      (fun r ->
        {
          candidate =
            candidate
              ~source:(string (member "source" r))
              ~id:(string (member "id" r))
              ~title:"" ~artists:[] ();
          reasons =
            list (fun j -> rejection_of_code (string j)) (member "reasons" r);
        })
      (member "rejected" j)
  in
  {
    decision;
    candidates;
    rejected;
    warnings = list string (member "warnings" j);
  }
