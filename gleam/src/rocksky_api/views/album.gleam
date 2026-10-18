import gleam/option.{Some}
import rocksky_api/db/row
import rocksky_api/lexicon/models
import rocksky_api/schema/albums

pub fn basic(r: albums.Album) -> models.AlbumViewBasic {
  models.AlbumViewBasic(
    ..models.new_album_view_basic(),
    id: Some(r.id),
    uri: r.uri,
    title: Some(r.title),
    artist: Some(r.artist),
    artist_uri: r.artist_uri,
    year: r.year,
    album_art: r.album_art,
    release_date: r.release_date,
    sha256: Some(r.sha256),
    apple_music_link: r.apple_music_link,
    spotify_link: r.spotify_link,
    tidal_link: r.tidal_link,
    youtube_link: r.youtube_link,
    discogs_release_id: r.discogs_release_id,
    created_at: Some(row.iso8601(r.created_at)),
    updated_at: Some(row.iso8601(r.updated_at)),
    xata_version: r.xata_version,
  )
}

pub fn detailed(r: albums.Album) -> models.AlbumViewDetailed {
  models.AlbumViewDetailed(
    ..models.new_album_view_detailed(),
    id: Some(r.id),
    uri: r.uri,
    title: Some(r.title),
    artist: Some(r.artist),
    artist_uri: r.artist_uri,
    year: r.year,
    album_art: r.album_art,
    release_date: r.release_date,
    sha256: Some(r.sha256),
    created_at: Some(row.iso8601(r.created_at)),
    apple_music_link: r.apple_music_link,
    spotify_link: r.spotify_link,
    tidal_link: r.tidal_link,
    youtube_link: r.youtube_link,
    discogs_release_id: r.discogs_release_id,
    updated_at: Some(row.iso8601(r.updated_at)),
    xata_version: r.xata_version,
  )
}
