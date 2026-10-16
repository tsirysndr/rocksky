open Domain
module S = Versions.Strings

let norm = Normalize.normalize
let artist_set xs = S.of_list (List.map norm xs)

let normalize_identifier kind id =
  match kind with
  | "isrc" ->
      String.concat "" (String.split_on_char '-' id) |> String.uppercase_ascii
  | "musicbrainzRecordingId" | "musicbrainzReleaseId" ->
      String.lowercase_ascii id
  | _ -> id

let known_duration = function Some n when n > 0L -> Some n | _ -> None

let compatible_duration wanted actual =
  let difference =
    Int64.sub (Int64.max wanted actual) (Int64.min wanted actual)
  in
  difference <= Int64.max 5000L (Int64.div wanted 50L)

let opt_norm = Option.map norm

type recording_evidence = {
  title_key : string;
  subtitle_key : string option;
  credits : S.t;
  version_key : string option;
  album_editions : S.t;
  duration : int64 option;
  recording_ids : (string * string option) list;
}

let recording_evidence (c : candidate) =
  {
    title_key = norm c.title;
    subtitle_key = Versions.subtitle_base c.title;
    credits = artist_set c.artists;
    version_key = opt_norm c.version;
    album_editions = Versions.album_editions (Option.value ~default:"" c.album);
    duration = known_duration c.duration_ms;
    recording_ids =
      List.map
        (fun (kind, value) ->
          (kind, Option.map (normalize_identifier kind) value))
        [
          ("musicbrainzRecordingId", c.identifiers.musicbrainz_recording_id);
          ("isrc", c.identifiers.isrc);
        ];
  }

let same_evidence a b =
  (a.title_key = b.title_key
  || a.subtitle_key = Some b.title_key
  || b.subtitle_key = Some a.title_key)
  && S.equal a.credits b.credits
  && a.version_key = b.version_key
  && S.equal a.album_editions b.album_editions
  && (match (a.duration, b.duration) with
    | Some x, Some y -> compatible_duration (Int64.min x y) (Int64.max x y)
    | _ -> true)
  &&
  let shared = ref false in
  let compatible =
    List.for_all2
      (fun (kind, x) (_, y) ->
        match (x, y) with
        | Some x, Some y ->
            if x = y && x <> "" && (kind <> "isrc" || String.length x = 12) then
              shared := true;
            x = y
        | _ -> true)
      a.recording_ids b.recording_ids
  in
  compatible && !shared

let same_recording a b =
  same_evidence (recording_evidence a) (recording_evidence b)

let evaluate (request : request) (c : candidate) =
  let reasons = ref [] and evidence = ref [ "title_match"; "artist_match" ] in
  let reject condition reason =
    if condition then reasons := reason :: !reasons
  in
  reject (c.source = "" || c.id = "") Missing_candidate_identity;
  reject
    ((not (Request.valid_text c.title))
    || c.artists = []
    || not (List.for_all Request.valid_text c.artists))
    Invalid_candidate_metadata;
  reject
    ((not (S.subset (artist_set request.artists) (artist_set c.artists)))
    && norm (String.concat ", " request.artists)
       <> norm (String.concat ", " c.artists))
    Artist_mismatch;
  reject
    (match request.album with
    | None -> false
    | Some a -> opt_norm c.album <> Some (norm a))
    Album_mismatch;
  reject
    (match (request.album_artist, c.album_artist) with
    | Some a, Some b -> norm a <> norm b
    | _ -> false)
    Album_artist_mismatch;
  if request.album <> None then evidence := !evidence @ [ "album_match" ];
  let hits = ref 0 in
  List.iter2
    (fun (kind, wanted) (_, actual) ->
      match (wanted, actual) with
      | Some a, Some b ->
          if normalize_identifier kind a <> normalize_identifier kind b then
            reject true (Identifier_mismatch kind)
          else (
            incr hits;
            evidence := !evidence @ [ kind ^ "_match" ])
      | _ -> ())
    (identifier_values request.identifiers)
    (identifier_values c.identifiers);
  reject
    (List.exists
       (fun (_, v) -> v <> None)
       (identifier_values request.identifiers)
    && !hits = 0)
    Identifiers_unverified;
  reject
    ((not (Versions.titles_match request.title c.title))
    && not
         (!hits > 0
         && Versions.version_base request.title = Versions.version_base c.title
         ))
    Title_mismatch;
  let edition_set title album =
    S.union
      (Versions.album_editions title)
      (Versions.album_editions (Option.value ~default:"" album))
  in
  let wanted = edition_set request.title request.album in
  let actual =
    S.union
      (edition_set c.title c.album)
      (Versions.editions (Option.value ~default:"" c.version))
  in
  reject (!hits = 0 && not (S.subset actual wanted)) Version_mismatch;
  if !hits > 0 then evidence := !evidence @ [ "explicit_identifier_verified" ];
  let duration_score =
    match (request.duration_ms, known_duration c.duration_ms) with
    | Some a, Some b when compatible_duration a b ->
        evidence := !evidence @ [ "duration_compatible" ];
        1
    | Some _, Some _ ->
        reject true Duration_mismatch;
        0
    | _ -> 0
  in
  match List.rev !reasons with
  | [] ->
      Ok
        {
          track = c;
          evidence = !evidence;
          rank =
            [
              !hits;
              duration_score;
              Versions.canonical_score c.album c.album_type;
              (match c.release_status with
              | Some "official" -> 2
              | Some "bootleg" -> 0
              | _ -> 1);
              (if c.country = Some "US" || c.country = Some "XW" then 1 else 0);
            ];
        }
  | reasons -> Error { candidate = c; reasons }

(* Enrichment copies collapse, but contradictory recording evidence remains.
   This deliberately strengthens the Rust policy's second deduplication pass. *)
let identity (c : candidate) =
  ( c.source,
    c.id,
    norm c.title,
    S.elements (artist_set c.artists),
    opt_norm c.album,
    opt_norm c.album_artist,
    known_duration c.duration_ms,
    opt_norm c.version,
    List.map
      (fun (k, v) -> (k, Option.map (normalize_identifier k) v))
      (identifier_values c.identifiers),
    c.album_type,
    c.release_status,
    c.country,
    c.release_date )

let compare_ranked a b =
  let rank = compare b.rank a.rank in
  if rank <> 0 then rank
  else
    let stable =
      compare (a.track.source, a.track.id) (b.track.source, b.track.id)
    in
    if stable <> 0 then stable else compare a.track b.track

let resolve request candidates =
  match Request.validate request with
  | Error e -> Error e
  | Ok () ->
      let accepted, rejected =
        List.fold_left
          (fun (yes, no) c ->
            let result =
              try evaluate request c
              with Invalid_argument _ ->
                Error
                  { candidate = c; reasons = [ Invalid_candidate_metadata ] }
            in
            match result with
            | Ok c -> (c :: yes, no)
            | Error c -> (yes, c :: no))
          ([], []) candidates
      in
      let seen = Hashtbl.create (List.length accepted) in
      let candidates =
        List.sort compare_ranked accepted
        |> List.filter (fun r ->
            let key = identity r.track in
            if Hashtbl.mem seen key then false
            else (
              Hashtbl.add seen key ();
              true))
      in
      let decision =
        match candidates with
        | [] -> Unmatched
        | first :: _ ->
            let tied = List.filter (fun c -> c.rank = first.rank) candidates in
            let rec pairwise = function
              | [] -> true
              | a :: rest ->
                  List.for_all (same_evidence a) rest && pairwise rest
            in
            if
              not
                (pairwise (List.map (fun c -> recording_evidence c.track) tied))
            then Ambiguous (List.map (fun c -> c.track) tied)
            else
              let representative (c : candidate) =
                let own_album =
                  Option.fold ~none:false
                    ~some:(fun a -> S.mem (norm a) (artist_set c.artists))
                    c.album_artist
                in
                ( not own_album,
                  Option.value ~default:"9999" c.release_date,
                  c.source,
                  c.id,
                  c )
              in
              let sorted =
                List.sort
                  (fun a b ->
                    compare (representative a.track) (representative b.track))
                  tied
              in
              Matched (List.hd sorted).track
      in
      let rejected =
        List.sort
          (fun a b ->
            compare
              (a.candidate.source, a.candidate.id, a.reasons)
              (b.candidate.source, b.candidate.id, b.reasons))
          rejected
      in
      Ok { decision; candidates; rejected; warnings = [] }
