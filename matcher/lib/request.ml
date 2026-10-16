type error =
  | Invalid_title
  | Invalid_artists
  | Invalid_album
  | Invalid_album_artist
  | Invalid_duration
  | Invalid_identifier of string

let valid_text text =
  String.length text <= 1024
  &&
  let valid_utf8, has_text =
    Uutf.String.fold_utf_8
      (fun (valid_utf8, has_text) _ -> function
        | `Malformed _ -> (false, has_text)
        | `Uchar u ->
            ( valid_utf8,
              has_text || Uucp.Alpha.is_alphabetic u
              || Uucp.Num.numeric_type u <> `None ))
      (true, false) text
  in
  valid_utf8 && has_text

let valid_optional = function None -> true | Some text -> valid_text text

let valid_identifier id =
  String.length id > 0
  && String.length id <= 128
  && String.for_all
       (function
         | 'a' .. 'z' | 'A' .. 'Z' | '0' .. '9' | '-' -> true | _ -> false)
       id

let validate (request : Domain.request) =
  if not (valid_text request.title) then Error Invalid_title
  else if
    request.artists = []
    || List.length request.artists > 32
    || not (List.for_all valid_text request.artists)
  then Error Invalid_artists
  else if not (valid_optional request.album) then Error Invalid_album
  else if not (valid_optional request.album_artist) then
    Error Invalid_album_artist
  else if Option.fold ~none:false ~some:(fun ms -> ms <= 0L) request.duration_ms
  then Error Invalid_duration
  else
    let ids = request.identifiers in
    let rec check = function
      | [] -> Ok ()
      | (field, Some value) :: _ when not (valid_identifier value) ->
          Error (Invalid_identifier field)
      | _ :: rest -> check rest
    in
    check
      [
        ("musicbrainzRecordingId", ids.musicbrainz_recording_id);
        ("musicbrainzReleaseId", ids.musicbrainz_release_id);
        ("isrc", ids.isrc);
        ("spotifyTrackId", ids.spotify_track_id);
        ("deezerTrackId", ids.deezer_track_id);
      ]

let error_message = function
  | Invalid_title -> "title must contain text (maximum 1024 bytes)"
  | Invalid_artists ->
      "artists must contain 1-32 nonblank names (maximum 1024 bytes each)"
  | Invalid_album ->
      "album must contain text when supplied (maximum 1024 bytes)"
  | Invalid_album_artist ->
      "albumArtist must contain text when supplied (maximum 1024 bytes)"
  | Invalid_duration -> "durationMs must be positive"
  | Invalid_identifier field ->
      field ^ " must contain ASCII letters, digits or hyphens (1-128 bytes)"
