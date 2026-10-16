type identifiers = {
  musicbrainz_recording_id : string option;
  musicbrainz_release_id : string option;
  isrc : string option;
  spotify_track_id : string option;
  deezer_track_id : string option;
}

type request = {
  title : string;
  artists : string list;
  album : string option;
  album_artist : string option;
  duration_ms : int64 option;
  identifiers : identifiers;
}

type candidate = {
  source : string;
  id : string;
  title : string;
  artists : string list;
  album : string option;
  album_artist : string option;
  duration_ms : int64 option;
  identifiers : identifiers;
  version : string option;
  album_type : string option;
  release_status : string option;
  release_date : string option;
  country : string option;
  album_art : string option;
  track_number : int64 option;
  disc_number : int64 option;
  label : string option;
  genres : string list option;
  artist_picture : string option;
  musicbrainz_artists : (string * string) list option;
  spotify_link : string option;
  provider_score : float option;
  provider_rank : int64 option;
  provider_link : string option;
  preview : string option;
  provider_album_id : string option;
  provider_artist_id : string option;
}

type rejection_reason =
  | Missing_candidate_identity
  | Title_mismatch
  | Artist_mismatch
  | Album_mismatch
  | Album_artist_mismatch
  | Version_mismatch
  | Identifier_conflict
  | Other_rejection of string
  | Identifier_mismatch of string
  | Identifiers_unverified
  | Invalid_candidate_metadata
  | Duration_mismatch

type rejection = { candidate : candidate; reasons : rejection_reason list }
type decision = Matched of candidate | Ambiguous of candidate list | Unmatched

type ranked_candidate = {
  track : candidate;
  evidence : string list;
  rank : int list;
}

type response = {
  decision : decision;
  candidates : ranked_candidate list;
  rejected : rejection list;
  warnings : string list;
}

let policy_version = "2-ocaml.1"

let empty_identifiers =
  {
    musicbrainz_recording_id = None;
    musicbrainz_release_id = None;
    isrc = None;
    spotify_track_id = None;
    deezer_track_id = None;
  }

let identifier_values ids =
  [
    ("musicbrainzRecordingId", ids.musicbrainz_recording_id);
    ("musicbrainzReleaseId", ids.musicbrainz_release_id);
    ("isrc", ids.isrc);
    ("spotifyTrackId", ids.spotify_track_id);
    ("deezerTrackId", ids.deezer_track_id);
  ]

let candidate ~source ~id ~title ~artists () =
  {
    source;
    id;
    title;
    artists;
    album = None;
    album_artist = None;
    duration_ms = None;
    identifiers = empty_identifiers;
    version = None;
    album_type = None;
    release_status = None;
    release_date = None;
    country = None;
    album_art = None;
    track_number = None;
    disc_number = None;
    label = None;
    genres = None;
    artist_picture = None;
    musicbrainz_artists = None;
    spotify_link = None;
    provider_score = None;
    provider_rank = None;
    provider_link = None;
    preview = None;
    provider_album_id = None;
    provider_artist_id = None;
  }

let rejection_code = function
  | Missing_candidate_identity -> "missing_candidate_identity"
  | Title_mismatch -> "title_mismatch"
  | Artist_mismatch -> "artist_mismatch"
  | Album_mismatch -> "album_mismatch"
  | Album_artist_mismatch -> "album_artist_mismatch"
  | Version_mismatch -> "unrequested_version"
  | Identifier_conflict -> "identifier_conflict"
  | Other_rejection code -> code
  | Identifier_mismatch kind -> kind ^ "_conflict"
  | Identifiers_unverified -> "identifiers_unverified"
  | Invalid_candidate_metadata -> "invalid_candidate_metadata"
  | Duration_mismatch -> "duration_mismatch"
