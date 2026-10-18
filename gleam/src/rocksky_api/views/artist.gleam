//// `artists` rows as lexicon views.

import gleam/option.{None, Some}
import rocksky_api/db/row
import rocksky_api/lexicon/models.{type ArtistViewBasic, ArtistViewBasic}
import rocksky_api/schema/artists.{type Artist}

pub fn basic(a: Artist) -> ArtistViewBasic {
  ArtistViewBasic(
    ..models.new_artist_view_basic(),
    id: Some(a.id),
    uri: a.uri,
    name: Some(a.name),
    picture: a.picture,
    sha256: Some(a.sha256),
    created_at: Some(row.iso8601(a.created_at)),
    updated_at: Some(row.iso8601(a.updated_at)),
    biography: a.biography,
    born: row.optional_iso8601(a.born),
    born_in: a.born_in,
    died: row.optional_iso8601(a.died),
    apple_music_link: a.apple_music_link,
    spotify_link: a.spotify_link,
    tidal_link: a.tidal_link,
    youtube_link: a.youtube_link,
    genres: a.genres,
    xata_version: a.xata_version,
    tags: None,
  )
}

pub fn detailed(r: artists.Artist) -> models.ArtistViewDetailed {
  models.ArtistViewDetailed(
    ..models.new_artist_view_detailed(),
    id: Some(r.id),
    uri: r.uri,
    name: Some(r.name),
    picture: r.picture,
    sha256: Some(r.sha256),
    created_at: Some(row.iso8601(r.created_at)),
    updated_at: Some(row.iso8601(r.updated_at)),
    biography: r.biography,
    born: row.optional_iso8601(r.born),
    born_in: r.born_in,
    died: row.optional_iso8601(r.died),
    apple_music_link: r.apple_music_link,
    spotify_link: r.spotify_link,
    tidal_link: r.tidal_link,
    youtube_link: r.youtube_link,
    genres: r.genres,
    xata_version: r.xata_version,
  )
}
