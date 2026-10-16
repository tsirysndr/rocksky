open Matcher
open Domain

let request : request =
  {
    title = "Beat It";
    artists = [ "Michael Jackson" ];
    album = None;
    album_artist = None;
    duration_ms = None;
    identifiers = empty_identifiers;
  }

let track id album =
  {
    (candidate ~source:"fixture" ~id ~title:request.title
       ~artists:request.artists ())
    with
    album;
    album_type = Some "album";
  }

let resolve r cs =
  match Policy.resolve r cs with
  | Ok x -> x
  | Error e -> failwith (Request.error_message e)

let count = ref 0

let check name condition =
  incr count;
  if not condition then failwith name

let status r cs = Json.status (resolve r cs).decision
let expect name expected r cs = check name (status r cs = expected)

let matched name id r cs =
  check name
    (match (resolve r cs).decision with Matched c -> c.id = id | _ -> false)

let () =
  let c = track "a" None in
  expect "minimum" "matched" request [ c ];
  expect "empty" "unmatched" request [];
  check "invalid request"
    (Policy.resolve { request with title = "" } [ c ]
    = Error Request.Invalid_title);
  List.iter
    (fun suffix ->
      expect suffix "unmatched" request
        [ { c with title = "Beat It (" ^ suffix ^ ")" } ])
    [
      "Live";
      "Acoustic";
      "Remastered";
      "Radio Edit";
      "Instrumental";
      "Demo";
      "Alternate Version";
      "Club Mix";
      "Take 2";
      "feat. Guest";
      "Eurydice Solo";
      "Part II";
      "Reprise";
      "Sped Up";
      "Time of Your Life) - Live";
      "Remix";
      "Karaoke";
      "Mono";
      "Stereo";
    ];
  let r = { request with title = "Good Riddance"; artists = [ "Green Day" ] } in
  let good =
    {
      c with
      title = "Good Riddance (Time of Your Life)";
      artists = r.artists;
      album = Some "Nimrod";
    }
  in
  expect "subtitle" "matched" r [ good ];
  expect "subtitle alternatives" "ambiguous" r
    [ good; { good with id = "b"; title = "Good Riddance (Something Else)" } ];
  expect "subtitle wrong album" "unmatched"
    { r with album = Some "Wrong" }
    [ good ];
  expect "subtitle wrong artist" "unmatched"
    { r with artists = [ "Wrong" ] }
    [ good ];
  expect "punctuation" "matched" request
    [ { c with title = "  BEAT   IT! "; artists = [ " MICHAEL  JACKSON " ] } ];
  List.iter
    (fun (a, b) ->
      expect a "matched"
        { request with artists = [ a ] }
        [ { c with artists = [ b ] } ])
    [
      ("Beyoncé", "Beyonce");
      ("Jóhann Jóhannsson", "Johann Johannsson");
      ("JAŸ-Z", "JAY-Z");
      ("Sälen", "SÄLEN");
      ("8‐Bit", "8-Bit");
      ("宇多田ヒカル", "宇多田ヒカル");
    ];
  List.iter
    (fun (a, b) ->
      expect a "unmatched"
        { request with artists = [ a ] }
        [ { c with artists = [ b ] } ])
    [
      ("Air", "Air Supply");
      ("Queen", "Queens of the Stone Age");
      ("Slipknot", "Cannons");
      ("Earth, Wind & Fire", "Earth");
    ];
  expect "all artists" "unmatched"
    { request with artists = request.artists @ [ "Guest" ] }
    [ c ];
  expect "extra credits" "matched" request
    [ { c with artists = c.artists @ [ "Guest" ] } ];
  expect "album artist cannot replace artist" "unmatched" request
    [ { c with artists = [ "Wrong" ]; album_artist = Some "Michael Jackson" } ];
  List.iter
    (fun title -> expect title "unmatched" request [ { c with title } ])
    [ "Thriller"; "Beat It Again" ];
  let album_request = { request with album = Some "tHRiLLeR" } in
  matched "strict album wins" "original" album_request
    [
      track "remaster" (Some "Thriller (2003 Remaster)");
      track "original" (Some "Thriller");
    ];
  expect "missing album" "unmatched" album_request [ c ];
  expect "no wrong album fallback" "unmatched"
    { request with album = Some "Bad" }
    [ track "a" (Some "Thriller") ];
  expect "safe album normalization" "matched"
    { request with album = Some " THRILLER  " }
    [ track "a" (Some "Thriller") ];
  List.iter
    (fun album ->
      expect album "unmatched" album_request [ track "a" (Some album) ])
    [ "Thriller (Deluxe)"; "Thriller (2003 Remaster)" ];
  List.iter
    (fun album -> expect album "unmatched" request [ track "a" (Some album) ])
    [
      "Thriller (2003 Remaster)";
      "Thriller (2003 Live)";
      "Thriller (Radio Edit)";
    ];
  expect "requested live" "matched"
    { request with title = "Beat It (Live)" }
    [ { c with title = "Beat It - Live" } ];
  expect "requested edition" "matched"
    { request with album = Some "Thriller (2003 Remaster)" }
    [ track "a" (Some "Thriller (2003 Remaster)") ];
  expect "literal album live" "matched" request
    [ track "a" (Some "Live Through This") ];
  expect "literal title live" "unmatched"
    { request with title = "Live Forever" }
    [ { c with title = "Live Forever"; album = Some "Live at Wembley" } ];
  matched "album beats single" "a" request
    [ c; { c with id = "single"; album_type = Some "single" } ];
  let tied = [ c; { c with id = "b" } ] in
  expect "ties" "ambiguous" request tied;
  check "deterministic tie order"
    (Json.response_to_json (resolve request tied)
    = Json.response_to_json (resolve request (List.rev tied)));
  expect "duplicate" "matched" request [ c; c ];
  expect "enrichment duplicate" "matched" request
    [ c; { c with album_art = Some "https://example.test/art" } ];
  let ids = { empty_identifiers with isrc = Some "US-ABC-12-12345" } in
  let identified = { request with identifiers = ids } in
  let marked =
    {
      c with
      album = Some "Thriller (2003 Remaster)";
      identifiers = { empty_identifiers with isrc = Some "USABC1212345" };
    }
  in
  expect "verified ISRC edition" "matched" identified [ marked ];
  expect "verified ISRC suffix" "matched" identified
    [ { marked with title = "Beat It (2003 Remaster)" } ];
  expect "verified ID wrong title" "unmatched" identified
    [ { marked with title = "Thriller (2003 Remaster)" } ];
  expect "verified ID wrong artist" "unmatched" identified
    [ { marked with artists = [ "Cannons" ] } ];
  expect "verified ID wrong album" "unmatched"
    { identified with album = Some "Thriller" }
    [ marked ];
  expect "unverified ID" "unmatched" identified [ c ];
  expect "conflicting ID despite shared ISRC" "unmatched"
    { identified with identifiers = { ids with spotify_track_id = Some "one" } }
    [
      {
        marked with
        identifiers = { marked.identifiers with spotify_track_id = Some "two" };
      };
    ];
  expect "case sensitive Spotify" "unmatched"
    {
      request with
      identifiers = { empty_identifiers with spotify_track_id = Some "ABC" };
    }
    [
      {
        c with
        identifiers = { empty_identifiers with spotify_track_id = Some "abc" };
      };
    ];
  List.iter
    (fun ids ->
      expect "verified provider ID edition" "matched"
        { request with identifiers = ids }
        [ { marked with identifiers = ids } ])
    [
      { empty_identifiers with musicbrainz_recording_id = Some "abc-123" };
      { empty_identifiers with deezer_track_id = Some "123" };
      { empty_identifiers with spotify_track_id = Some "abc123" };
    ];
  let duration = { request with duration_ms = Some 200000L } in
  List.iter
    (fun n ->
      expect "duration accepted" "matched" duration
        [ { c with duration_ms = Some n } ])
    [ 0L; 200000L; 205000L; 195000L ];
  List.iter
    (fun n ->
      expect "duration rejected" "unmatched" duration
        [ { c with duration_ms = Some n } ])
    [ 205001L; 194999L ];
  expect "2 percent boundary" "matched"
    { request with duration_ms = Some 500000L }
    [ { c with duration_ms = Some 510000L } ];
  expect "2 percent beyond" "unmatched"
    { request with duration_ms = Some 500000L }
    [ { c with duration_ms = Some 510001L } ];
  expect "large duration no overflow" "unmatched"
    { request with duration_ms = Some Int64.max_int }
    [ { c with duration_ms = Some 1L } ];
  matched "duration evidence preferred" "known" duration
    [ c; { c with id = "known"; duration_ms = Some 200000L } ];
  let rejected =
    (resolve request [ { c with title = "Wrong"; artists = [ "Wrong" ] } ])
      .rejected
  in
  check "multiple reasons"
    (List.mem Title_mismatch (List.hd rejected).reasons
    && List.mem Artist_mismatch (List.hd rejected).reasons);
  matched "official preferred" "official" request
    [
      { c with id = "official"; release_status = Some "official" };
      { c with id = "bootleg"; release_status = Some "bootleg" };
    ];
  expect "hidden version" "unmatched" request
    [ { c with version = Some "2011 remaster" } ];
  expect "album artist conflict" "unmatched"
    { request with album_artist = Some "Michael Jackson" }
    [ { c with album_artist = Some "Various Artists" } ];
  expect "unknown album artist" "matched"
    { request with album_artist = Some "Michael Jackson" }
    [ c ];
  List.iter
    (fun (wanted, actual) ->
      expect "joined credits" "matched"
        { request with artists = wanted }
        [ { c with artists = actual } ])
    [
      ([ "Mason"; "Princess Superstar" ], [ "Mason, Princess Superstar" ]);
      ([ "C2C, Derek Martin" ], [ "C2C"; "Derek Martin" ]);
      ([ "Earth, Wind & Fire" ], [ "Earth, Wind & Fire" ]);
    ];
  expect "joined incomplete" "unmatched"
    { request with artists = [ "C2C, Derek Martin" ] }
    [ { c with artists = [ "C2C" ] } ];
  List.iter
    (fun (title, artist, album, status, country) ->
      let r = { request with title; artists = [ artist ] } in
      let right =
        {
          c with
          title;
          artists = [ artist ];
          album = Some album;
          release_status = Some status;
          country = Some country;
        }
      in
      matched title "a" r
        [ right; { right with id = "wrong"; artists = [ "Wrong" ] } ])
    [
      ("Smells Like Teen Spirit", "Nirvana", "Nevermind", "official", "US");
      ("Medicine", "Joji", "Chloe Burbank Vol. 1", "bootleg", "XW");
      ("Don't Stay", "Linkin Park", "Meteora", "official", "US");
    ];
  let r = { request with title = "Karma Police"; artists = [ "radiohead" ] } in
  let copy id album album_artist release_date =
    {
      c with
      id;
      title = r.title;
      artists = [ "Radiohead" ];
      album = Some album;
      album_artist = Some album_artist;
      release_date = Some release_date;
      duration_ms = Some 264066L;
      identifiers =
        {
          empty_identifiers with
          isrc = Some "GBAYE9701368";
          spotify_track_id = Some id;
        };
    }
  in
  let a = copy "a" "OK Computer" "Radiohead" "1997-05-28" in
  let b = copy "b" "Personal Effects" "Tasmin Archer" "1999" in
  let d = copy "d" "OK Computer" "Radiohead" "1997-05-28" in
  List.iter
    (fun cs -> matched "same recording representative" "a" r cs)
    [ [ a; b; d ]; [ d; b; a ]; [ b; a; d ] ];
  List.iter
    (fun b -> expect "conflicting recording evidence" "ambiguous" r [ a; b; d ])
    [
      { b with duration_ms = Some 180000L };
      { b with identifiers = { b.identifiers with isrc = Some "GB0409700380" } };
      { b with artists = b.artists @ [ "Guest" ] };
      { b with identifiers = { b.identifiers with isrc = None } };
    ];
  expect "missing ID cannot bridge conflicts" "ambiguous" r
    [
      a;
      {
        b with
        identifiers =
          { b.identifiers with musicbrainz_recording_id = Some "one" };
      };
      {
        d with
        identifiers =
          { d.identifiers with musicbrainz_recording_id = Some "two" };
      };
    ];
  expect "shared recording album filter" "matched"
    { r with album = Some "OK Computer" }
    [ a; b; d ];
  expect "shared recording wrong album" "unmatched"
    { r with album = Some "Wrong" }
    [ a; b; d ];
  expect "same provider contradictory rows retained" "ambiguous" request
    [ c; { c with duration_ms = Some 100000L } ];
  expect "malformed provider rejected" "unmatched" request
    [ { c with title = "Beat It\255" } ];
  check "soundtrack preference"
    (Versions.canonical_score (Some "Nimrod") (Some "album")
    > Versions.canonical_score (Some "Original Soundtrack") (Some "album"));
  Printf.printf "%d policy cases passed\n" !count
