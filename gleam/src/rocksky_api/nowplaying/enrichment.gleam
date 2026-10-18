import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/lib/matching.{type Candidate}
import rocksky_api/lib/track.{type Track, Track}
import rocksky_api/schema/albums
import rocksky_api/schema/tracks

pub fn nonempty(value: Option(String)) {
  case value {
    Some("") -> None
    _ -> value
  }
}

fn nonzero(value: Option(Int)) {
  case value {
    Some(0) -> None
    _ -> value
  }
}

fn nonempty_list(value: Option(List(a))) {
  case value {
    Some([]) -> None
    _ -> value
  }
}

pub fn candidate(track: Track, c: Candidate) {
  Track(
    ..track,
    mb_id: option.or(track.mb_id, c.identifiers.recording),
    isrc: option.or(track.isrc, c.identifiers.isrc),
    artists: option.or(
      nonempty_list(track.artists),
      nonempty_list(c.musicbrainz_artists),
    ),
    album_art: option.or(nonempty(track.album_art), c.album_art),
    duration: case track.duration <= 1 {
      True -> option.unwrap(matching.integer(c.duration_ms), track.duration)
      False -> track.duration
    },
    track_number: option.or(
      nonzero(track.track_number),
      matching.integer(c.track_number),
    ),
    disc_number: option.or(
      nonzero(track.disc_number),
      matching.integer(c.disc_number),
    ),
    label: option.or(nonempty(track.label), c.label),
    release_date: option.or(
      nonempty(track.release_date),
      option.then(c.release_date, fn(d) {
        case is_ymd(d) {
          True -> Some(d)
          False -> None
        }
      }),
    ),
    year: option.or(nonzero(track.year), matching.year(c)),
    artist_picture: option.or(nonempty(track.artist_picture), c.artist_picture),
    genres: option.or(nonempty_list(track.genres), c.genres),
    spotify_link: option.or(
      nonempty(track.spotify_link),
      matching.spotify_link(c),
    ),
    deezer_link: option.or(nonempty(track.deezer_link), matching.deezer_link(c)),
  )
}

@external(javascript, "../lib/track_ffi.mjs", "isYmd")
fn is_ymd(value: String) -> Bool

pub fn catalog(
  track: Track,
  row: Option(tracks.Track),
  selected_id: Option(String),
  album: Option(albums.Album),
) {
  let track = case row, selected_id {
    Some(row), Some(id) if row.id == id ->
      Track(
        ..track,
        track_number: option.or(track.track_number, row.track_number),
        disc_number: option.or(track.disc_number, row.disc_number),
        composer: option.or(nonempty(track.composer), row.composer),
        lyrics: option.or(nonempty(track.lyrics), row.lyrics),
        copyright_message: option.or(
          nonempty(track.copyright_message),
          row.copyright_message,
        ),
        mb_id: option.or(nonempty(track.mb_id), row.mb_id),
        isrc: option.or(nonempty(track.isrc), row.isrc),
        genres: option.or(
          nonempty_list(track.genres),
          option.map(nonempty(row.genre), fn(g) { [g] }),
        ),
        spotify_link: option.or(nonempty(track.spotify_link), row.spotify_link),
        album_art: option.or(nonempty(track.album_art), row.album_art),
      )
    _, _ -> track
  }
  case album {
    None -> track
    Some(album) ->
      Track(
        ..track,
        year: option.or(track.year, album.year),
        release_date: option.or(
          nonempty(track.release_date),
          option.map(nonempty(album.release_date), string.slice(_, 0, 10)),
        ),
        album_art: option.or(nonempty(track.album_art), album.album_art),
      )
  }
}
