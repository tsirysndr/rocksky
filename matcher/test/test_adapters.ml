open Matcher
open Domain

let json = Yojson.Safe.from_string
let count = ref 0

let check name value =
  incr count;
  if not value then failwith name

let request =
  Json.request_of_json
    (json
       {|{"title":"Beat It","artists":["Michael Jackson"],"identifiers":{"isrc":"US-ABC-12-12345"}}|})

let () =
  let c =
    Providers.spotify_candidate
      (json
         {|{"id":"abc","name":"Beat It","artists":[{"id":"artist","name":"Michael Jackson"}],"duration_ms":240000,"external_ids":{"isrc":"USABC1212345"},"external_urls":{"spotify":"https://open.spotify.com/track/abc"},"track_number":2,"disc_number":1,"album":{"id":"album","name":"Thriller","artists":[{"name":"Michael Jackson"}],"album_type":"album","release_date":"1982","images":[{"url":"art"}]}}|})
  in
  check "Spotify identity"
    (c.id = "abc" && c.identifiers.spotify_track_id = Some "abc");
  check "Spotify metadata"
    (c.duration_ms = Some 240000L
    && c.album = Some "Thriller" && c.album_art = Some "art");
  check "Spotify enrichment IDs internal"
    (c.provider_album_id = Some "album"
    && c.provider_artist_id = Some "artist"
    && Json.member "providerAlbumId" (Json.candidate_to_json c) = `Null);
  let c =
    Providers.deezer_match
      (json
         {|{"deezerTrackId":42,"title":"Beat It","artist":"Michael Jackson","album":"Thriller","durationMs":240000,"score":0.9,"rank":120,"isrc":"USABC1212345","preview":"url"}|})
  in
  check "Deezer enriched ID"
    (c.id = "42" && c.identifiers.deezer_track_id = Some "42");
  check "Deezer advisory score"
    (c.provider_score = Some 90. && c.provider_rank = Some 120L);
  let c =
    Providers.deezer_direct
      (json
         {|{"id":42,"title":"Beat It","artist":{"name":"Michael Jackson"},"contributors":[{"name":"Michael Jackson"},{"name":"Guest"}],"duration":240,"album":{"title":"Thriller"}}|})
  in
  check "Deezer seconds to ms" (c.duration_ms = Some 240000L);
  check "Deezer full contributors" (c.artists = [ "Michael Jackson"; "Guest" ]);
  let mb =
    json
      {|{"id":"recording","title":"Beat It","score":"98","length":240000,"artist-credit":[{"artist":{"id":"artist","name":"Michael Jackson"}}],"isrcs":["OTHER","USABC1212345"],"releases":[{"id":"r1","title":"Thriller","status":"Official","country":"US","date":"1982","release-group":{"primary-type":"Album"}},{"id":"r2","title":"Beat It","track-count":1}]}|}
  in
  let cs = Providers.musicbrainz_candidates request mb in
  check "all MusicBrainz releases" (List.length cs = 2);
  let a = List.hd cs in
  check "MusicBrainz verified ISRC chosen"
    (a.identifiers.isrc = Some "USABC1212345");
  check "MusicBrainz release metadata"
    (a.id = "recording:r1"
    && a.release_status = Some "official"
    && a.album_type = Some "album");
  check "MusicBrainz single" ((List.nth cs 1).album_type = Some "single");
  check "MusicBrainz artist metadata"
    (a.musicbrainz_artists = Some [ ("artist", "Michael Jackson") ]);
  check "MusicBrainz no releases"
    (List.length
       (Providers.musicbrainz_candidates request
          (json {|{"id":"x","title":"Beat It"}|}))
    = 1);
  check "MusicBrainz direct missing ID"
    (Providers.musicbrainz_direct (json {|{"name":"Beat It"}|}) = []);
  let direct =
    Providers.musicbrainz_direct
      (json
         {|{"trackMBID":"actual","name":"Wrong Title","artist":[{"mbid":"a","name":"Michael Jackson"}],"releaseMBID":"release"}|})
  in
  check "direct preserves provider title"
    ((List.hd direct).title = "Wrong Title"
    && (List.hd direct).identifiers.musicbrainz_recording_id = Some "actual");
  Printf.printf "%d adapter cases passed\n" !count
