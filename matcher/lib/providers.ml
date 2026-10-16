open Domain
open Lwt.Infix

let get key = function
  | `Assoc xs -> Option.value ~default:`Null (List.assoc_opt key xs)
  | _ -> `Null

let text key j =
  match get key j with
  | `String s when String.trim s <> "" -> Some s
  | _ -> None

let array = function `List xs -> xs | _ -> []

let required_array = function
  | `List xs -> xs
  | _ -> failwith "invalid provider array"

let number key j =
  try Json.optional Json.unsigned (get key j) with Json.Decode_error _ -> None

let id key j =
  match get key j with
  | `String s when s <> "" -> Some s
  | `Int n when n > 0 -> Some (string_of_int n)
  | `Intlit s -> (
      try if Int64.of_string s > 0L then Some s else None with _ -> None)
  | _ -> None

let default = Option.value ~default:""
let names j = array j |> List.filter_map (text "name")
let first j = match array j with x :: _ -> x | [] -> `Null
let alternative a b = match a with Some _ -> a | None -> b

let score maximum key j =
  let value =
    match get key j with
    | `String s -> float_of_string_opt s
    | x -> ( try Some (Json.float x) with Json.Decode_error _ -> None)
  in
  Option.bind value (fun n ->
      if Float.is_finite n && n >= 0. && n <= maximum then Some n else None)

let spotify_candidate j =
  let album = get "album" j in
  let track_id = text "id" j in
  let c =
    candidate ~source:"spotify" ~id:(default track_id)
      ~title:(default (text "name" j))
      ~artists:(names (get "artists" j))
      ()
  in
  {
    c with
    album = text "name" album;
    album_artist = text "name" (first (get "artists" album));
    album_type = text "album_type" album;
    duration_ms = number "duration_ms" j;
    identifiers =
      {
        empty_identifiers with
        spotify_track_id = track_id;
        isrc = text "isrc" (get "external_ids" j);
      };
    album_art = text "url" (first (get "images" album));
    release_date = text "release_date" album;
    track_number = number "track_number" j;
    disc_number = number "disc_number" j;
    label = text "label" album;
    spotify_link = text "spotify" (get "external_urls" j);
    provider_album_id = text "id" album;
    provider_artist_id = text "id" (first (get "artists" j));
  }

let deezer_match j =
  let track_id = alternative (id "deezerTrackId" j) (id "id" j) in
  let c =
    candidate ~source:"deezer" ~id:(default track_id)
      ~title:(default (text "title" j))
      ~artists:[ default (text "artist" j) ]
      ()
  in
  {
    c with
    album = text "album" j;
    album_artist = text "albumArtist" j;
    album_art = text "albumArt" j;
    duration_ms = number "durationMs" j;
    identifiers =
      {
        empty_identifiers with
        deezer_track_id = track_id;
        isrc = text "isrc" j;
      };
    provider_score = Option.map (( *. ) 100.) (score 1. "score" j);
    provider_rank = number "rank" j;
    provider_link = text "link" j;
    preview = text "preview" j;
    track_number = number "trackNumber" j;
    disc_number = number "discNumber" j;
    release_date = text "releaseDate" j;
    label = text "label" j;
    genres =
      (match get "genres" j with
      | `List xs ->
          Some (List.filter_map (function `String s -> Some s | _ -> None) xs)
      | _ -> None);
    artist_picture = text "artistPicture" j;
  }

let deezer_direct j =
  let contributors = names (get "contributors" j) in
  let c =
    candidate ~source:"deezer"
      ~id:(default (id "id" j))
      ~title:(default (text "title" j))
      ~artists:
        (if contributors = [] then [ default (text "name" (get "artist" j)) ]
         else contributors)
      ()
  in
  let duration_ms =
    Option.bind (number "duration" j) (fun n ->
        if n > Int64.div Int64.max_int 1000L then None
        else Some (Int64.mul n 1000L))
  in
  {
    c with
    album = text "title" (get "album" j);
    album_art = text "cover_xl" (get "album" j);
    duration_ms;
    identifiers =
      {
        empty_identifiers with
        deezer_track_id = id "id" j;
        isrc = text "isrc" j;
      };
    track_number = number "track_position" j;
    disc_number = number "disk_number" j;
    release_date = text "release_date" j;
    provider_rank = number "rank" j;
    provider_link = text "link" j;
    preview = text "preview" j;
  }

let mb_artists credits =
  List.filter_map
    (fun a ->
      let artist = get "artist" a in
      match
        (text "id" artist, alternative (text "name" a) (text "name" artist))
      with
      | Some id, Some name -> Some (id, name)
      | _ -> None)
    credits

let musicbrainz_candidates (request : request) j =
  let credits = array (get "artist-credit" j) in
  let isrcs =
    array (get "isrcs" j)
    |> List.filter_map (function `String s -> Some s | _ -> None)
  in
  let isrc =
    alternative
      (List.find_opt
         (fun id ->
           Option.map
             (Policy.normalize_identifier "isrc")
             request.identifiers.isrc
           = Some (Policy.normalize_identifier "isrc" id))
         isrcs)
      (List.nth_opt isrcs 0)
  in
  let c =
    candidate ~source:"musicbrainz"
      ~id:(default (text "id" j))
      ~title:(default (text "title" j))
      ~artists:
        (List.filter_map
           (fun a -> alternative (text "name" a) (text "name" (get "artist" a)))
           credits)
      ()
  in
  let c =
    {
      c with
      duration_ms = number "length" j;
      version = text "disambiguation" j;
      provider_score = score 100. "score" j;
      musicbrainz_artists = Some (mb_artists credits);
      identifiers =
        { empty_identifiers with musicbrainz_recording_id = text "id" j; isrc };
    }
  in
  match array (get "releases" j) with
  | [] -> [ c ]
  | releases ->
      List.map
        (fun r ->
          let release_id = text "id" r in
          {
            c with
            id = c.id ^ ":" ^ Option.value ~default:"unknown" release_id;
            album = text "title" r;
            version =
              Some (default c.version ^ " " ^ default (text "disambiguation" r));
            identifiers =
              { c.identifiers with musicbrainz_release_id = release_id };
            release_status = Option.map String.lowercase_ascii (text "status" r);
            country = text "country" r;
            release_date = text "date" r;
            album_type =
              (if number "track-count" r = Some 1L then Some "single"
               else
                 Option.map String.lowercase_ascii
                   (text "primary-type" (get "release-group" r)));
          })
        releases

let musicbrainz_direct j =
  match text "trackMBID" j with
  | None -> []
  | Some recording ->
      let artists = array (get "artist" j) in
      let c =
        candidate ~source:"musicbrainz" ~id:recording
          ~title:(default (text "name" j))
          ~artists:(names (get "artist" j))
          ()
      in
      [
        {
          c with
          album = text "album" j;
          duration_ms = number "durationMs" j;
          musicbrainz_artists =
            Some
              (List.filter_map
                 (fun a ->
                   match (text "mbid" a, text "name" a) with
                   | Some id, Some name -> Some (id, name)
                   | _ -> None)
                 artists);
          identifiers =
            {
              empty_identifiers with
              musicbrainz_recording_id = Some recording;
              musicbrainz_release_id = text "releaseMBID" j;
              isrc = text "isrc" j;
            };
        };
      ]

let endpoint base path =
  Uri.with_path base
    ( String.trim (Uri.path base) |> fun s ->
      let rec trim s =
        if String.ends_with ~suffix:"/" s then
          trim (String.sub s 0 (String.length s - 1))
        else s
      in
      trim s ^ path )

let segment = Uri.pct_encode
let quoted s = Yojson.Safe.to_string (`String s)

let http ?auth kind url =
  let base = Http_io.validate_url url in
  let uri path = endpoint base path in
  let spotify path query =
    match auth with
    | None -> Lwt.fail_with "Spotify authentication not configured"
    | Some auth ->
        Spotify_auth.get auth (Uri.add_query_params' (uri path) query)
  in
  let candidates (r : request) =
    match kind with
    | "spotify" -> (
        match r.identifiers.spotify_track_id with
        | Some id ->
            spotify ("/tracks/" ^ segment id) [] >|= fun j ->
            [ spotify_candidate j ]
        | None ->
            let q =
              "track:" ^ quoted r.title ^ " "
              ^ String.concat " "
                  (List.map (fun a -> "artist:" ^ quoted a) r.artists)
              ^ Option.fold ~none:""
                  ~some:(fun a -> " album:" ^ quoted a)
                  r.album
            in
            spotify "/search" [ ("type", "track"); ("q", q); ("limit", "10") ]
            >|= fun j ->
            required_array (get "items" (get "tracks" j))
            |> List.map spotify_candidate)
    | "deezer" -> (
        match r.identifiers.deezer_track_id with
        | Some id ->
            Http_io.json `GET (uri ("/track/" ^ segment id)) >|= fun j ->
            [ deezer_direct j ]
        | None -> (
            Http_io.json
              ~body:
                (`Assoc
                   [
                     ("title", Json.s r.title);
                     ("artist", Json.s (String.concat ", " r.artists));
                     ("album", Json.opt Json.s r.album);
                   ])
              `POST (uri "/enrich")
            >|= fun j ->
            let matches =
              required_array (get "matches" j) |> List.map deezer_match
            in
            match get "track" j with
            | `Null -> matches
            | v ->
                let selected = deezer_match v in
                let selected =
                  match List.find_opt (fun c -> c.id = selected.id) matches with
                  | None -> selected
                  | Some search ->
                      {
                        selected with
                        provider_score =
                          alternative selected.provider_score
                            search.provider_score;
                        provider_rank =
                          alternative selected.provider_rank
                            search.provider_rank;
                        provider_link =
                          alternative selected.provider_link
                            search.provider_link;
                        preview = alternative selected.preview search.preview;
                      }
                in
                selected :: matches))
    | "musicbrainz" -> (
        match r.identifiers.musicbrainz_recording_id with
        | Some id ->
            Http_io.json `GET (uri ("/recording/" ^ segment id))
            >|= musicbrainz_direct
        | None ->
            Http_io.json
              ~body:
                (`Assoc
                   [
                     ("Track", Json.s r.title);
                     ("Artist", Json.s (String.concat ", " r.artists));
                     ("Release", Json.opt Json.s r.album);
                   ])
              `POST (uri "/search")
            >|= fun j ->
            required_array j |> List.concat_map (musicbrainz_candidates r))
    | _ -> invalid_arg "unknown HTTP provider"
  in
  let enrich c =
    if kind <> "spotify" then Lwt.return c
    else
      let detail path = function
        | None -> Lwt.return_none
        | Some id ->
            Lwt.catch
              (fun () ->
                spotify (path ^ segment id) [] >|= fun j ->
                if text "id" j = Some id then Some j else None)
              (fun _ -> Lwt.return_none)
      in
      Lwt.both
        (detail "/albums/" c.provider_album_id)
        (detail "/artists/" c.provider_artist_id)
      >|= fun (album, artist) ->
      let c =
        match album with
        | None -> c
        | Some j -> { c with label = alternative (text "label" j) c.label }
      in
      match artist with
      | None -> c
      | Some j ->
          {
            c with
            artist_picture = text "url" (first (get "images" j));
            genres =
              (match get "genres" j with
              | `List xs ->
                  Some
                    (List.filter_map
                       (function `String s -> Some s | _ -> None)
                       xs)
              | _ -> c.genres);
          }
  in
  Provider.make ~enrich kind candidates
