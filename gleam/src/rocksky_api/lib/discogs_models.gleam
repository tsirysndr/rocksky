//// Typed Discogs service payloads, corresponding to lib/discogs.ts.

import gleam/dynamic/decode
import gleam/option.{type Option, None}

pub type DiscogsCredit {
  DiscogsCredit(
    artist_id: Option(Int),
    name: String,
    role: Option(String),
    tracks: Option(String),
  )
}

pub fn discogs_credit_decoder() {
  use artist_id <- decode.optional_field(
    "artistId",
    None,
    decode.optional(decode.int),
  )
  use name <- decode.field("name", decode.string)
  use role <- decode.optional_field(
    "role",
    None,
    decode.optional(decode.string),
  )
  use tracks <- decode.optional_field(
    "tracks",
    None,
    decode.optional(decode.string),
  )
  decode.success(DiscogsCredit(artist_id, name, role, tracks))
}

pub type DiscogsEnrichedTrack {
  DiscogsEnrichedTrack(
    title: String,
    artist: String,
    album_artist: Option(String),
    album: String,
    album_art: Option(String),
    duration_ms: Option(Int),
    track_number: Option(Int),
    disc_number: Option(Int),
    track_position: Option(String),
    release_date: Option(String),
    year: Option(Int),
    original_year: Option(Int),
    label: Option(String),
    catalog_number: Option(String),
    country: Option(String),
    barcode: Option(String),
    formats: Option(List(String)),
    genres: Option(List(String)),
    styles: Option(List(String)),
    discogs_url: Option(String),
    credits: Option(List(DiscogsCredit)),
    discogs_release_id: Option(Int),
    discogs_master_id: Option(Int),
    discogs_artist_id: Option(Int),
  )
}

pub fn discogs_enriched_track_decoder() {
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
  use duration_ms <- decode.optional_field(
    "durationMs",
    None,
    decode.optional(decode.int),
  )
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
  use track_position <- decode.optional_field(
    "trackPosition",
    None,
    decode.optional(decode.string),
  )
  use release_date <- decode.optional_field(
    "releaseDate",
    None,
    decode.optional(decode.string),
  )
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use original_year <- decode.optional_field(
    "originalYear",
    None,
    decode.optional(decode.int),
  )
  use label <- decode.optional_field(
    "label",
    None,
    decode.optional(decode.string),
  )
  use catalog_number <- decode.optional_field(
    "catalogNumber",
    None,
    decode.optional(decode.string),
  )
  use country <- decode.optional_field(
    "country",
    None,
    decode.optional(decode.string),
  )
  use barcode <- decode.optional_field(
    "barcode",
    None,
    decode.optional(decode.string),
  )
  use formats <- decode.optional_field(
    "formats",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use genres <- decode.optional_field(
    "genres",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use styles <- decode.optional_field(
    "styles",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use discogs_url <- decode.optional_field(
    "discogsUrl",
    None,
    decode.optional(decode.string),
  )
  use credits <- decode.optional_field(
    "credits",
    None,
    decode.optional(decode.list(discogs_credit_decoder())),
  )
  use discogs_release_id <- decode.optional_field(
    "discogsReleaseId",
    None,
    decode.optional(decode.int),
  )
  use discogs_master_id <- decode.optional_field(
    "discogsMasterId",
    None,
    decode.optional(decode.int),
  )
  use discogs_artist_id <- decode.optional_field(
    "discogsArtistId",
    None,
    decode.optional(decode.int),
  )
  decode.success(DiscogsEnrichedTrack(
    title,
    artist,
    album_artist,
    album,
    album_art,
    duration_ms,
    track_number,
    disc_number,
    track_position,
    release_date,
    year,
    original_year,
    label,
    catalog_number,
    country,
    barcode,
    formats,
    genres,
    styles,
    discogs_url,
    credits,
    discogs_release_id,
    discogs_master_id,
    discogs_artist_id,
  ))
}

pub type DiscogsMatch {
  DiscogsMatch(
    id: Int,
    master_id: Option(Int),
    type_: Option(String),
    artist: String,
    album: String,
    album_art: Option(String),
    year: Option(Int),
    country: Option(String),
    label: Option(String),
    catalog_number: Option(String),
    barcode: Option(String),
    formats: Option(List(String)),
    genres: Option(List(String)),
    styles: Option(List(String)),
    url: Option(String),
    score: Float,
  )
}

pub fn discogs_match_decoder() {
  use id <- decode.field("id", decode.int)
  use master_id <- decode.optional_field(
    "masterId",
    None,
    decode.optional(decode.int),
  )
  use type_ <- decode.optional_field(
    "type",
    None,
    decode.optional(decode.string),
  )
  use artist <- decode.field("artist", decode.string)
  use album <- decode.field("album", decode.string)
  use album_art <- decode.optional_field(
    "albumArt",
    None,
    decode.optional(decode.string),
  )
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use country <- decode.optional_field(
    "country",
    None,
    decode.optional(decode.string),
  )
  use label <- decode.optional_field(
    "label",
    None,
    decode.optional(decode.string),
  )
  use catalog_number <- decode.optional_field(
    "catalogNumber",
    None,
    decode.optional(decode.string),
  )
  use barcode <- decode.optional_field(
    "barcode",
    None,
    decode.optional(decode.string),
  )
  use formats <- decode.optional_field(
    "formats",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use genres <- decode.optional_field(
    "genres",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use styles <- decode.optional_field(
    "styles",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use url <- decode.optional_field("url", None, decode.optional(decode.string))
  use score <- decode.field("score", decode.float)
  decode.success(DiscogsMatch(
    id,
    master_id,
    type_,
    artist,
    album,
    album_art,
    year,
    country,
    label,
    catalog_number,
    barcode,
    formats,
    genres,
    styles,
    url,
    score,
  ))
}

pub type DiscogsEnrichResponse {
  DiscogsEnrichResponse(
    track: Option(DiscogsEnrichedTrack),
    matches: List(DiscogsMatch),
  )
}

pub fn discogs_enrich_response_decoder() {
  use track <- decode.optional_field(
    "track",
    None,
    decode.optional(discogs_enriched_track_decoder()),
  )
  use matches <- decode.field("matches", decode.list(discogs_match_decoder()))
  decode.success(DiscogsEnrichResponse(track, matches))
}

pub type DiscogsArtistCredit {
  DiscogsArtistCredit(
    id: Option(Int),
    name: String,
    anv: Option(String),
    join: Option(String),
    role: Option(String),
    tracks: Option(String),
    resource_url: Option(String),
  )
}

pub fn discogs_artist_credit_decoder() {
  use id <- decode.optional_field("id", None, decode.optional(decode.int))
  use name <- decode.field("name", decode.string)
  use anv <- decode.optional_field("anv", None, decode.optional(decode.string))
  use join <- decode.optional_field(
    "join",
    None,
    decode.optional(decode.string),
  )
  use role <- decode.optional_field(
    "role",
    None,
    decode.optional(decode.string),
  )
  use tracks <- decode.optional_field(
    "tracks",
    None,
    decode.optional(decode.string),
  )
  use resource_url <- decode.optional_field(
    "resource_url",
    None,
    decode.optional(decode.string),
  )
  decode.success(DiscogsArtistCredit(
    id,
    name,
    anv,
    join,
    role,
    tracks,
    resource_url,
  ))
}

pub type DiscogsLabelRef {
  DiscogsLabelRef(
    id: Option(Int),
    name: String,
    catno: Option(String),
    entity_type: Option(String),
    entity_type_name: Option(String),
    resource_url: Option(String),
  )
}

pub fn discogs_label_ref_decoder() {
  use id <- decode.optional_field("id", None, decode.optional(decode.int))
  use name <- decode.field("name", decode.string)
  use catno <- decode.optional_field(
    "catno",
    None,
    decode.optional(decode.string),
  )
  use entity_type <- decode.optional_field(
    "entity_type",
    None,
    decode.optional(decode.string),
  )
  use entity_type_name <- decode.optional_field(
    "entity_type_name",
    None,
    decode.optional(decode.string),
  )
  use resource_url <- decode.optional_field(
    "resource_url",
    None,
    decode.optional(decode.string),
  )
  decode.success(DiscogsLabelRef(
    id,
    name,
    catno,
    entity_type,
    entity_type_name,
    resource_url,
  ))
}

pub type DiscogsFormat {
  DiscogsFormat(
    name: Option(String),
    qty: Option(String),
    text: Option(String),
    descriptions: Option(List(String)),
  )
}

pub fn discogs_format_decoder() {
  use name <- decode.optional_field(
    "name",
    None,
    decode.optional(decode.string),
  )
  use qty <- decode.optional_field("qty", None, decode.optional(decode.string))
  use text <- decode.optional_field(
    "text",
    None,
    decode.optional(decode.string),
  )
  use descriptions <- decode.optional_field(
    "descriptions",
    None,
    decode.optional(decode.list(decode.string)),
  )
  decode.success(DiscogsFormat(name, qty, text, descriptions))
}

pub type DiscogsImage {
  DiscogsImage(
    type_: Option(String),
    uri: Option(String),
    uri150: Option(String),
    width: Option(Int),
    height: Option(Int),
  )
}

pub fn discogs_image_decoder() {
  use type_ <- decode.optional_field(
    "type",
    None,
    decode.optional(decode.string),
  )
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use uri150 <- decode.optional_field(
    "uri150",
    None,
    decode.optional(decode.string),
  )
  use width <- decode.optional_field("width", None, decode.optional(decode.int))
  use height <- decode.optional_field(
    "height",
    None,
    decode.optional(decode.int),
  )
  decode.success(DiscogsImage(type_, uri, uri150, width, height))
}

pub type DiscogsIdentifier {
  DiscogsIdentifier(
    type_: String,
    value: Option(String),
    description: Option(String),
  )
}

pub fn discogs_identifier_decoder() {
  use type_ <- decode.field("type", decode.string)
  use value <- decode.optional_field(
    "value",
    None,
    decode.optional(decode.string),
  )
  use description <- decode.optional_field(
    "description",
    None,
    decode.optional(decode.string),
  )
  decode.success(DiscogsIdentifier(type_, value, description))
}

pub type DiscogsTracklistEntry {
  DiscogsTracklistEntry(
    position: Option(String),
    type_: Option(String),
    title: String,
    duration: Option(String),
    artists: Option(List(DiscogsArtistCredit)),
    extraartists: Option(List(DiscogsArtistCredit)),
  )
}

pub fn discogs_tracklist_entry_decoder() {
  use position <- decode.optional_field(
    "position",
    None,
    decode.optional(decode.string),
  )
  use type_ <- decode.optional_field(
    "type_",
    None,
    decode.optional(decode.string),
  )
  use title <- decode.field("title", decode.string)
  use duration <- decode.optional_field(
    "duration",
    None,
    decode.optional(decode.string),
  )
  use artists <- decode.optional_field(
    "artists",
    None,
    decode.optional(decode.list(discogs_artist_credit_decoder())),
  )
  use extraartists <- decode.optional_field(
    "extraartists",
    None,
    decode.optional(decode.list(discogs_artist_credit_decoder())),
  )
  decode.success(DiscogsTracklistEntry(
    position,
    type_,
    title,
    duration,
    artists,
    extraartists,
  ))
}

pub type DiscogsRelease {
  DiscogsRelease(
    id: Int,
    title: String,
    year: Option(Int),
    released: Option(String),
    country: Option(String),
    notes: Option(String),
    uri: Option(String),
    master_id: Option(Int),
    data_quality: Option(String),
    artists: Option(List(DiscogsArtistCredit)),
    extraartists: Option(List(DiscogsArtistCredit)),
    labels: Option(List(DiscogsLabelRef)),
    companies: Option(List(DiscogsLabelRef)),
    formats: Option(List(DiscogsFormat)),
    genres: Option(List(String)),
    styles: Option(List(String)),
    tracklist: Option(List(DiscogsTracklistEntry)),
    images: Option(List(DiscogsImage)),
    identifiers: Option(List(DiscogsIdentifier)),
  )
}

pub fn discogs_release_decoder() {
  use id <- decode.field("id", decode.int)
  use title <- decode.field("title", decode.string)
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use released <- decode.optional_field(
    "released",
    None,
    decode.optional(decode.string),
  )
  use country <- decode.optional_field(
    "country",
    None,
    decode.optional(decode.string),
  )
  use notes <- decode.optional_field(
    "notes",
    None,
    decode.optional(decode.string),
  )
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use master_id <- decode.optional_field(
    "master_id",
    None,
    decode.optional(decode.int),
  )
  use data_quality <- decode.optional_field(
    "data_quality",
    None,
    decode.optional(decode.string),
  )
  use artists <- decode.optional_field(
    "artists",
    None,
    decode.optional(decode.list(discogs_artist_credit_decoder())),
  )
  use extraartists <- decode.optional_field(
    "extraartists",
    None,
    decode.optional(decode.list(discogs_artist_credit_decoder())),
  )
  use labels <- decode.optional_field(
    "labels",
    None,
    decode.optional(decode.list(discogs_label_ref_decoder())),
  )
  use companies <- decode.optional_field(
    "companies",
    None,
    decode.optional(decode.list(discogs_label_ref_decoder())),
  )
  use formats <- decode.optional_field(
    "formats",
    None,
    decode.optional(decode.list(discogs_format_decoder())),
  )
  use genres <- decode.optional_field(
    "genres",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use styles <- decode.optional_field(
    "styles",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use tracklist <- decode.optional_field(
    "tracklist",
    None,
    decode.optional(decode.list(discogs_tracklist_entry_decoder())),
  )
  use images <- decode.optional_field(
    "images",
    None,
    decode.optional(decode.list(discogs_image_decoder())),
  )
  use identifiers <- decode.optional_field(
    "identifiers",
    None,
    decode.optional(decode.list(discogs_identifier_decoder())),
  )
  decode.success(DiscogsRelease(
    id,
    title,
    year,
    released,
    country,
    notes,
    uri,
    master_id,
    data_quality,
    artists,
    extraartists,
    labels,
    companies,
    formats,
    genres,
    styles,
    tracklist,
    images,
    identifiers,
  ))
}

pub type DiscogsMaster {
  DiscogsMaster(
    id: Int,
    title: String,
    year: Option(Int),
    main_release: Option(Int),
    uri: Option(String),
    artists: Option(List(DiscogsArtistCredit)),
    genres: Option(List(String)),
    styles: Option(List(String)),
  )
}

pub fn discogs_master_decoder() {
  use id <- decode.field("id", decode.int)
  use title <- decode.field("title", decode.string)
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use main_release <- decode.optional_field(
    "main_release",
    None,
    decode.optional(decode.int),
  )
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use artists <- decode.optional_field(
    "artists",
    None,
    decode.optional(decode.list(discogs_artist_credit_decoder())),
  )
  use genres <- decode.optional_field(
    "genres",
    None,
    decode.optional(decode.list(decode.string)),
  )
  use styles <- decode.optional_field(
    "styles",
    None,
    decode.optional(decode.list(decode.string)),
  )
  decode.success(DiscogsMaster(
    id,
    title,
    year,
    main_release,
    uri,
    artists,
    genres,
    styles,
  ))
}

pub type DiscogsQuery {
  DiscogsQuery(artist: String, album: Option(String), title: Option(String))
}

pub fn discogs_query_decoder() {
  use artist <- decode.field("artist", decode.string)
  use album <- decode.optional_field(
    "album",
    None,
    decode.optional(decode.string),
  )
  use title <- decode.optional_field(
    "title",
    None,
    decode.optional(decode.string),
  )
  decode.success(DiscogsQuery(artist, album, title))
}
