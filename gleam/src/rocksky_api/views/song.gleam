import gleam/dict
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/db/row
import rocksky_api/lexicon/models
import rocksky_api/schema/tracks.{type Track}

pub fn basic(t: Track) -> models.SongViewBasic {
  models.SongViewBasic(
    ..models.new_song_view_basic(),
    id: Some(t.id),
    title: Some(t.title),
    artist: Some(t.artist),
    album_artist: Some(t.album_artist),
    album_art: t.album_art,
    album: Some(t.album),
    track_number: t.track_number,
    duration: Some(t.duration),
    mb_id: t.mb_id,
    isrc: t.isrc,
    youtube_link: t.youtube_link,
    spotify_link: t.spotify_link,
    apple_music_link: t.apple_music_link,
    tidal_link: t.tidal_link,
    sha256: Some(t.sha256),
    disc_number: t.disc_number,
    lyrics: None,
    composer: t.composer,
    genre: t.genre,
    label: t.label,
    copyright_message: t.copyright_message,
    key: t.key,
    bpm: t.bpm,
    acoustid_fingerprint: t.acoustid_fingerprint,
    uri: t.uri,
    album_uri: t.album_uri,
    artist_uri: t.artist_uri,
    created_at: Some(row.iso8601(t.created_at)),
    updated_at: Some(row.iso8601(t.updated_at)),
    xata_version: t.xata_version,
  )
}

pub fn dedupe(tracks: List(Track)) -> List(Track) {
  let #(order, by_key) =
    list.fold(tracks, #([], dict.new()), fn(acc, track) {
      let key = #(track.disc_number, track.track_number)
      case dict.get(acc.1, key) {
        Error(_) -> #([key, ..acc.0], dict.insert(acc.1, key, track))
        Ok(old) ->
          case
            option.unwrap(old.lyrics, "") == ""
            && option.unwrap(track.lyrics, "") != ""
          {
            True -> #(acc.0, dict.insert(acc.1, key, track))
            False -> acc
          }
      }
    })
  list.reverse(order) |> list.filter_map(fn(key) { dict.get(by_key, key) })
}

pub fn catalog(t: Track, plays: Int, listeners: Int) -> models.SongViewBasic {
  models.SongViewBasic(
    ..models.new_song_view_basic(),
    id: Some(t.id),
    uri: t.uri,
    title: Some(t.title),
    artist: Some(t.artist),
    artist_uri: t.artist_uri,
    album: Some(t.album),
    album_uri: t.album_uri,
    album_art: t.album_art,
    album_artist: Some(t.album_artist),
    copyright_message: t.copyright_message,
    disc_number: t.disc_number,
    duration: Some(t.duration),
    sha256: Some(t.sha256),
    track_number: t.track_number,
    play_count: Some(plays),
    unique_listeners: Some(listeners),
    created_at: Some(row.iso8601(t.created_at)),
  )
}

pub fn detailed(t: Track) -> models.SongViewDetailed {
  models.SongViewDetailed(
    ..models.new_song_view_detailed(),
    id: Some(t.id),
    title: Some(t.title),
    artist: Some(t.artist),
    album_artist: Some(t.album_artist),
    album_art: t.album_art,
    album: Some(t.album),
    track_number: t.track_number,
    duration: Some(t.duration),
    mb_id: t.mb_id,
    isrc: t.isrc,
    youtube_link: t.youtube_link,
    spotify_link: t.spotify_link,
    apple_music_link: t.apple_music_link,
    tidal_link: t.tidal_link,
    sha256: Some(t.sha256),
    disc_number: t.disc_number,
    lyrics: t.lyrics,
    composer: t.composer,
    genre: t.genre,
    label: t.label,
    copyright_message: t.copyright_message,
    key: t.key,
    bpm: t.bpm,
    acoustid_fingerprint: t.acoustid_fingerprint,
    uri: t.uri,
    album_uri: t.album_uri,
    artist_uri: t.artist_uri,
    created_at: Some(row.iso8601(t.created_at)),
    updated_at: Some(row.iso8601(t.updated_at)),
    xata_version: t.xata_version,
  )
}
