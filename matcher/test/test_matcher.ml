open Matcher

let identifiers : Domain.identifiers =
  {
    musicbrainz_recording_id = None;
    musicbrainz_release_id = None;
    isrc = None;
    spotify_track_id = None;
    deezer_track_id = None;
  }

let request : Domain.request =
  {
    title = "Thriller";
    artists = [ "Michael Jackson" ];
    album = None;
    album_artist = None;
    duration_ms = None;
    identifiers;
  }

let count = ref 0

let check name expected input =
  if Request.validate input <> expected then failwith name;
  incr count

let () =
  let open Request in
  check "minimal request" (Ok ()) request;
  List.iter
    (fun title ->
      check "invalid title" (Error Invalid_title) { request with title })
    [ ""; " \t\n"; "---!?"; "🎵"; "a\255" ];
  List.iter
    (fun title -> check "Unicode title" (Ok ()) { request with title })
    [ "Björk"; "東京"; "سلام"; "Cafe\204\129"; "123" ];
  check "1024 bytes accepted" (Ok ())
    { request with title = String.make 1024 'a' };
  check "1025 bytes rejected" (Error Invalid_title)
    { request with title = String.make 1025 'a' };
  check "Unicode byte boundary accepted" (Ok ())
    { request with title = String.concat "" (List.init 512 (fun _ -> "é")) };
  check "Unicode byte boundary rejected" (Error Invalid_title)
    { request with title = String.concat "" (List.init 513 (fun _ -> "é")) };
  List.iter
    (fun artists ->
      check "invalid credits" (Error Invalid_artists) { request with artists })
    [
      [];
      [ "" ];
      [ "Artist"; "!?" ];
      List.init 33 (fun _ -> "Artist");
      [ String.make 1025 'a' ];
    ];
  check "32 artists accepted" (Ok ())
    { request with artists = List.init 32 (fun _ -> "Artist") };
  check "literal commas accepted" (Ok ())
    { request with artists = [ "Earth, Wind & Fire" ] };
  check "blank album rejected" (Error Invalid_album)
    { request with album = Some "" };
  check "blank album artist rejected" (Error Invalid_album_artist)
    { request with album_artist = Some " " };
  check "optional metadata accepted" (Ok ())
    {
      request with
      album = Some "Thriller";
      album_artist = Some "Michael Jackson";
    };
  List.iter
    (fun ms ->
      check "nonpositive duration" (Error Invalid_duration)
        { request with duration_ms = Some ms })
    [ 0L; -1L; Int64.min_int ];
  List.iter
    (fun ms ->
      check "positive duration" (Ok ()) { request with duration_ms = Some ms })
    [ 1L; 240000L; Int64.max_int ];
  let fields =
    [
      ( "musicbrainzRecordingId",
        fun v -> { identifiers with musicbrainz_recording_id = Some v } );
      ( "musicbrainzReleaseId",
        fun v -> { identifiers with musicbrainz_release_id = Some v } );
      ("isrc", fun v -> { identifiers with isrc = Some v });
      ("spotifyTrackId", fun v -> { identifiers with spotify_track_id = Some v });
      ("deezerTrackId", fun v -> { identifiers with deezer_track_id = Some v });
    ]
  in
  List.iter
    (fun (field, make) ->
      List.iter
        (fun value ->
          check ("invalid " ^ field) (Error (Invalid_identifier field))
            { request with identifiers = make value })
        [ ""; "a b"; "é"; "a_b"; String.make 129 'a' ];
      List.iter
        (fun value ->
          check ("valid " ^ field) (Ok ())
            { request with identifiers = make value })
        [ "AbC-123"; String.make 128 'a' ])
    fields;
  check "first error follows Rust field order" (Error Invalid_title)
    { request with title = ""; artists = []; duration_ms = Some 0L };
  Printf.printf "%d validation cases passed\n" !count
