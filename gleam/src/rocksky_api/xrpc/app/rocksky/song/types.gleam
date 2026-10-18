//// Generated typed provider payloads. See scripts/generate_provider_models.py.

import gleam/dynamic/decode
import gleam/option.{type Option, None}

pub type SearchResponse {
  SearchResponse(tracks: Tracks)
}

pub fn search_response_decoder() {
  use tracks <- decode.field("tracks", tracks_decoder())
  decode.success(SearchResponse(tracks))
}

pub type Tracks {
  Tracks(
    href: String,
    limit: Int,
    next: Option(String),
    offset: Int,
    previous: Option(String),
    total: Int,
    items: List(Track),
  )
}

pub fn tracks_decoder() {
  use href <- decode.field("href", decode.string)
  use limit <- decode.field("limit", decode.int)
  use next <- decode.optional_field(
    "next",
    None,
    decode.optional(decode.string),
  )
  use offset <- decode.field("offset", decode.int)
  use previous <- decode.optional_field(
    "previous",
    None,
    decode.optional(decode.string),
  )
  use total <- decode.field("total", decode.int)
  use items <- decode.field("items", decode.list(track_decoder()))
  decode.success(Tracks(href, limit, next, offset, previous, total, items))
}

pub type Track {
  Track(
    album: Album,
    artists: List(Artist),
    available_markets: List(String),
    disc_number: Int,
    duration_ms: Int,
    explicit: Bool,
    external_ids: ExternalIds,
    external_urls: ExternalUrls,
    href: String,
    id: String,
    is_local: Bool,
    is_playable: Option(Bool),
    name: String,
    popularity: Int,
    preview_url: Option(String),
    track_number: Int,
    type_: String,
    uri: String,
  )
}

pub fn track_decoder() {
  use album <- decode.field("album", album_decoder())
  use artists <- decode.field("artists", decode.list(artist_decoder()))
  use available_markets <- decode.field(
    "available_markets",
    decode.list(decode.string),
  )
  use disc_number <- decode.field("disc_number", decode.int)
  use duration_ms <- decode.field("duration_ms", decode.int)
  use explicit <- decode.field("explicit", decode.bool)
  use external_ids <- decode.field("external_ids", external_ids_decoder())
  use external_urls <- decode.field("external_urls", external_urls_decoder())
  use href <- decode.field("href", decode.string)
  use id <- decode.field("id", decode.string)
  use is_local <- decode.field("is_local", decode.bool)
  use is_playable <- decode.optional_field(
    "is_playable",
    None,
    decode.optional(decode.bool),
  )
  use name <- decode.field("name", decode.string)
  use popularity <- decode.field("popularity", decode.int)
  use preview_url <- decode.optional_field(
    "preview_url",
    None,
    decode.optional(decode.string),
  )
  use track_number <- decode.field("track_number", decode.int)
  use type_ <- decode.field("type", decode.string)
  use uri <- decode.field("uri", decode.string)
  decode.success(Track(
    album,
    artists,
    available_markets,
    disc_number,
    duration_ms,
    explicit,
    external_ids,
    external_urls,
    href,
    id,
    is_local,
    is_playable,
    name,
    popularity,
    preview_url,
    track_number,
    type_,
    uri,
  ))
}

pub type Album {
  Album(
    album_type: String,
    artists: List(Artist),
    available_markets: List(String),
    external_urls: ExternalUrls,
    href: String,
    id: String,
    images: List(Image),
    name: String,
    release_date: String,
    release_date_precision: String,
    total_tracks: Int,
    type_: String,
    uri: String,
    label: Option(String),
    genres: Option(List(String)),
    copyrights: Option(List(Copyright)),
  )
}

pub fn album_decoder() {
  use album_type <- decode.field("album_type", decode.string)
  use artists <- decode.field("artists", decode.list(artist_decoder()))
  use available_markets <- decode.field(
    "available_markets",
    decode.list(decode.string),
  )
  use external_urls <- decode.field("external_urls", external_urls_decoder())
  use href <- decode.field("href", decode.string)
  use id <- decode.field("id", decode.string)
  use images <- decode.field("images", decode.list(image_decoder()))
  use name <- decode.field("name", decode.string)
  use release_date <- decode.field("release_date", decode.string)
  use release_date_precision <- decode.field(
    "release_date_precision",
    decode.string,
  )
  use total_tracks <- decode.field("total_tracks", decode.int)
  use type_ <- decode.field("type", decode.string)
  use uri <- decode.field("uri", decode.string)
  use label <- decode.optional_field(
    "label",
    None,
    decode.optional(decode.string),
  )
  use genres <- decode.optional_field(
    "genres",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use copyrights <- decode.optional_field(
    "copyrights",
    None,
    decode.optional(decode.list(copyright_decoder())),
  )
  decode.success(Album(
    album_type,
    artists,
    available_markets,
    external_urls,
    href,
    id,
    images,
    name,
    release_date,
    release_date_precision,
    total_tracks,
    type_,
    uri,
    label,
    genres,
    copyrights,
  ))
}

pub type Copyright {
  Copyright(text: String, type_: String)
}

pub fn copyright_decoder() {
  use text <- decode.field("text", decode.string)
  use type_ <- decode.field("type", decode.string)
  decode.success(Copyright(text, type_))
}

pub type Artist {
  Artist(
    external_urls: ExternalUrls,
    href: String,
    id: String,
    name: String,
    type_: String,
    uri: String,
    images: Option(List(Image)),
    genres: Option(List(String)),
  )
}

pub fn artist_decoder() {
  use external_urls <- decode.field("external_urls", external_urls_decoder())
  use href <- decode.field("href", decode.string)
  use id <- decode.field("id", decode.string)
  use name <- decode.field("name", decode.string)
  use type_ <- decode.field("type", decode.string)
  use uri <- decode.field("uri", decode.string)
  use images <- decode.optional_field(
    "images",
    None,
    decode.optional(decode.list(image_decoder())),
  )
  use genres <- decode.optional_field(
    "genres",
    None,
    decode.optional(decode.list(decode.string)),
  )
  decode.success(Artist(
    external_urls,
    href,
    id,
    name,
    type_,
    uri,
    images,
    genres,
  ))
}

pub type ExternalUrls {
  ExternalUrls(spotify: String)
}

pub fn external_urls_decoder() {
  use spotify <- decode.field("spotify", decode.string)
  decode.success(ExternalUrls(spotify))
}

pub type ExternalIds {
  ExternalIds(isrc: String)
}

pub fn external_ids_decoder() {
  use isrc <- decode.field("isrc", decode.string)
  decode.success(ExternalIds(isrc))
}

pub type Image {
  Image(height: Int, width: Int, url: String)
}

pub fn image_decoder() {
  use height <- decode.field("height", decode.int)
  use width <- decode.field("width", decode.int)
  use url <- decode.field("url", decode.string)
  decode.success(Image(height, width, url))
}

pub type AccessToken {
  AccessToken(
    access_token: String,
    token_type: String,
    scope: String,
    expires_in: Int,
  )
}

pub fn access_token_decoder() {
  use access_token <- decode.field("access_token", decode.string)
  use token_type <- decode.field("token_type", decode.string)
  use scope <- decode.field("scope", decode.string)
  use expires_in <- decode.field("expires_in", decode.int)
  decode.success(AccessToken(access_token, token_type, scope, expires_in))
}

pub type MusicBrainzArtist {
  MusicBrainzArtist(mbid: String, name: String)
}

pub fn music_brainz_artist_decoder() {
  use mbid <- decode.field("mbid", decode.string)
  use name <- decode.field("name", decode.string)
  decode.success(MusicBrainzArtist(mbid, name))
}

pub type DeezerEnrichedTrack {
  DeezerEnrichedTrack(
    title: String,
    artist: String,
    album_artist: Option(String),
    album: String,
    album_art: Option(String),
    isrc: Option(String),
    upc: Option(String),
    duration_ms: Int,
    track_number: Option(Int),
    disc_number: Option(Int),
    release_date: Option(String),
    year: Option(Int),
    label: Option(String),
    genres: Option(List(String)),
    artist_picture: Option(String),
    deezer_link: Option(String),
    preview: Option(String),
    explicit: Option(Bool),
    deezer_track_id: Option(Int),
    deezer_album_id: Option(Int),
    deezer_artist_id: Option(Int),
  )
}

pub fn deezer_enriched_track_decoder() {
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use album_artist <- decode.optional_field(
    "albumArtist",
    None,
    decode.optional(decode.string),
  )
  use album <- decode.field("album", decode.string)
  use album_art <- decode.optional_field(
    "albumArt",
    None,
    decode.optional(decode.string),
  )
  use isrc <- decode.optional_field(
    "isrc",
    None,
    decode.optional(decode.string),
  )
  use upc <- decode.optional_field("upc", None, decode.optional(decode.string))
  use duration_ms <- decode.field("durationMs", decode.int)
  use track_number <- decode.optional_field(
    "trackNumber",
    None,
    decode.optional(decode.int),
  )
  use disc_number <- decode.optional_field(
    "discNumber",
    None,
    decode.optional(decode.int),
  )
  use release_date <- decode.optional_field(
    "releaseDate",
    None,
    decode.optional(decode.string),
  )
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use label <- decode.optional_field(
    "label",
    None,
    decode.optional(decode.string),
  )
  use genres <- decode.optional_field(
    "genres",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use artist_picture <- decode.optional_field(
    "artistPicture",
    None,
    decode.optional(decode.string),
  )
  use deezer_link <- decode.optional_field(
    "deezerLink",
    None,
    decode.optional(decode.string),
  )
  use preview <- decode.optional_field(
    "preview",
    None,
    decode.optional(decode.string),
  )
  use explicit <- decode.optional_field(
    "explicit",
    None,
    decode.optional(decode.bool),
  )
  use deezer_track_id <- decode.optional_field(
    "deezerTrackId",
    None,
    decode.optional(decode.int),
  )
  use deezer_album_id <- decode.optional_field(
    "deezerAlbumId",
    None,
    decode.optional(decode.int),
  )
  use deezer_artist_id <- decode.optional_field(
    "deezerArtistId",
    None,
    decode.optional(decode.int),
  )
  decode.success(DeezerEnrichedTrack(
    title,
    artist,
    album_artist,
    album,
    album_art,
    isrc,
    upc,
    duration_ms,
    track_number,
    disc_number,
    release_date,
    year,
    label,
    genres,
    artist_picture,
    deezer_link,
    preview,
    explicit,
    deezer_track_id,
    deezer_album_id,
    deezer_artist_id,
  ))
}

pub type DeezerMatch {
  DeezerMatch(
    id: Int,
    title: String,
    artist: String,
    album: String,
    album_art: Option(String),
    isrc: Option(String),
    duration_ms: Int,
    link: Option(String),
    preview: Option(String),
    rank: Option(Int),
    explicit: Option(Bool),
    score: Float,
  )
}

pub fn deezer_match_decoder() {
  use id <- decode.field("id", decode.int)
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use album <- decode.field("album", decode.string)
  use album_art <- decode.optional_field(
    "albumArt",
    None,
    decode.optional(decode.string),
  )
  use isrc <- decode.optional_field(
    "isrc",
    None,
    decode.optional(decode.string),
  )
  use duration_ms <- decode.field("durationMs", decode.int)
  use link <- decode.optional_field(
    "link",
    None,
    decode.optional(decode.string),
  )
  use preview <- decode.optional_field(
    "preview",
    None,
    decode.optional(decode.string),
  )
  use rank <- decode.optional_field("rank", None, decode.optional(decode.int))
  use explicit <- decode.optional_field(
    "explicit",
    None,
    decode.optional(decode.bool),
  )
  use score <- decode.field("score", decode.float)
  decode.success(DeezerMatch(
    id,
    title,
    artist,
    album,
    album_art,
    isrc,
    duration_ms,
    link,
    preview,
    rank,
    explicit,
    score,
  ))
}

pub type DeezerEnrichResponse {
  DeezerEnrichResponse(
    track: Option(DeezerEnrichedTrack),
    matches: List(DeezerMatch),
  )
}

pub fn deezer_enrich_response_decoder() {
  use track <- decode.optional_field(
    "track",
    None,
    decode.optional(deezer_enriched_track_decoder()),
  )
  use matches <- decode.field("matches", decode.list(deezer_match_decoder()))
  decode.success(DeezerEnrichResponse(track, matches))
}
