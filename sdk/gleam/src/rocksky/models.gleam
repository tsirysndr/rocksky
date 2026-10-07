// AUTO-GENERATED from apps/api/lexicons. Do not edit.
// Regenerate: bun tools/lexgen/generate.ts --gleam

import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/int
import rocksky/json_value

fn float_decoder() -> decode.Decoder(Float) {
  decode.one_of(decode.float, [decode.int |> decode.map(int.to_float)])
}

pub type BlobCidRef {
  BlobCidRef(link: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_blob_cid_ref(link: String) -> BlobCidRef {
  BlobCidRef(link: link)
}

pub fn blob_cid_ref_decoder() -> decode.Decoder(BlobCidRef) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use link <- decode.field("$link", decode.string)
  decode.success(BlobCidRef(link: link))
}

pub fn encode_blob_cid_ref(value: BlobCidRef) -> json.Json {
  json.object(list.flatten([
    [#("$link", json.string(value.link))],
  ]))
}

pub type BlobRef {
  BlobRef(type_: String, ref: BlobCidRef, mime_type: String, size: Int)
}

/// Construct with required fields; optional fields default to None.
pub fn new_blob_ref(type_: String, ref: BlobCidRef, mime_type: String, size: Int) -> BlobRef {
  BlobRef(type_: type_, ref: ref, mime_type: mime_type, size: size)
}

pub fn blob_ref_decoder() -> decode.Decoder(BlobRef) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use type_ <- decode.field("$type", decode.string)
  use ref <- decode.field("ref", blob_cid_ref_decoder())
  use mime_type <- decode.field("mimeType", decode.string)
  use size <- decode.field("size", decode.int)
  decode.success(BlobRef(type_: type_, ref: ref, mime_type: mime_type, size: size))
}

pub fn encode_blob_ref(value: BlobRef) -> json.Json {
  json.object(list.flatten([
    [#("$type", json.string(value.type_))],
    [#("ref", encode_blob_cid_ref(value.ref))],
    [#("mimeType", json.string(value.mime_type))],
    [#("size", json.int(value.size))],
  ]))
}

pub type ActorArtistViewBasic {
  ActorArtistViewBasic(id: Option(String), name: Option(String), picture: Option(String), uri: Option(String), user1_rank: Option(Int), user2_rank: Option(Int), weight: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_actor_artist_view_basic() -> ActorArtistViewBasic {
  ActorArtistViewBasic(id: None, name: None, picture: None, uri: None, user1_rank: None, user2_rank: None, weight: None)
}

pub fn actor_artist_view_basic_decoder() -> decode.Decoder(ActorArtistViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use picture <- decode.optional_field("picture", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use user1_rank <- decode.optional_field("user1Rank", None, decode.optional(decode.int))
  use user2_rank <- decode.optional_field("user2Rank", None, decode.optional(decode.int))
  use weight <- decode.optional_field("weight", None, decode.optional(float_decoder()))
  decode.success(ActorArtistViewBasic(id: id, name: name, picture: picture, uri: uri, user1_rank: user1_rank, user2_rank: user2_rank, weight: weight))
}

pub fn encode_actor_artist_view_basic(value: ActorArtistViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.picture { Some(v) -> [#("picture", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.user1_rank { Some(v) -> [#("user1Rank", json.int(v))] None -> [] },
    case value.user2_rank { Some(v) -> [#("user2Rank", json.int(v))] None -> [] },
    case value.weight { Some(v) -> [#("weight", json.float(v))] None -> [] },
  ]))
}

pub type ActorCompatibilityViewBasic {
  ActorCompatibilityViewBasic(compatibility_level: Option(Int), shared_artists: Option(Int), top_shared_artist_names: Option(List(String)), top_shared_detailed_artists: Option(List(ActorArtistViewBasic)), user1_artist_count: Option(Int), user2_artist_count: Option(Int), compatibility_percentage: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_actor_compatibility_view_basic() -> ActorCompatibilityViewBasic {
  ActorCompatibilityViewBasic(compatibility_level: None, shared_artists: None, top_shared_artist_names: None, top_shared_detailed_artists: None, user1_artist_count: None, user2_artist_count: None, compatibility_percentage: None)
}

pub fn actor_compatibility_view_basic_decoder() -> decode.Decoder(ActorCompatibilityViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use compatibility_level <- decode.optional_field("compatibilityLevel", None, decode.optional(decode.int))
  use shared_artists <- decode.optional_field("sharedArtists", None, decode.optional(decode.int))
  use top_shared_artist_names <- decode.optional_field("topSharedArtistNames", None, decode.optional(decode.list(decode.string)))
  use top_shared_detailed_artists <- decode.optional_field("topSharedDetailedArtists", None, decode.optional(decode.list(actor_artist_view_basic_decoder())))
  use user1_artist_count <- decode.optional_field("user1ArtistCount", None, decode.optional(decode.int))
  use user2_artist_count <- decode.optional_field("user2ArtistCount", None, decode.optional(decode.int))
  use compatibility_percentage <- decode.optional_field("compatibilityPercentage", None, decode.optional(float_decoder()))
  decode.success(ActorCompatibilityViewBasic(compatibility_level: compatibility_level, shared_artists: shared_artists, top_shared_artist_names: top_shared_artist_names, top_shared_detailed_artists: top_shared_detailed_artists, user1_artist_count: user1_artist_count, user2_artist_count: user2_artist_count, compatibility_percentage: compatibility_percentage))
}

pub fn encode_actor_compatibility_view_basic(value: ActorCompatibilityViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.compatibility_level { Some(v) -> [#("compatibilityLevel", json.int(v))] None -> [] },
    case value.shared_artists { Some(v) -> [#("sharedArtists", json.int(v))] None -> [] },
    case value.top_shared_artist_names { Some(v) -> [#("topSharedArtistNames", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.top_shared_detailed_artists { Some(v) -> [#("topSharedDetailedArtists", json.array(v, fn(item) { encode_actor_artist_view_basic(item) }))] None -> [] },
    case value.user1_artist_count { Some(v) -> [#("user1ArtistCount", json.int(v))] None -> [] },
    case value.user2_artist_count { Some(v) -> [#("user2ArtistCount", json.int(v))] None -> [] },
    case value.compatibility_percentage { Some(v) -> [#("compatibilityPercentage", json.float(v))] None -> [] },
  ]))
}

pub type ActorNeighbourViewBasic {
  ActorNeighbourViewBasic(user_id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String), shared_artists_count: Option(Int), top_shared_artist_names: Option(List(String)), top_shared_artists_details: Option(List(ArtistViewBasic)), similarity_score: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_actor_neighbour_view_basic() -> ActorNeighbourViewBasic {
  ActorNeighbourViewBasic(user_id: None, did: None, handle: None, display_name: None, avatar: None, shared_artists_count: None, top_shared_artist_names: None, top_shared_artists_details: None, similarity_score: None)
}

pub fn actor_neighbour_view_basic_decoder() -> decode.Decoder(ActorNeighbourViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use user_id <- decode.optional_field("userId", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use shared_artists_count <- decode.optional_field("sharedArtistsCount", None, decode.optional(decode.int))
  use top_shared_artist_names <- decode.optional_field("topSharedArtistNames", None, decode.optional(decode.list(decode.string)))
  use top_shared_artists_details <- decode.optional_field("topSharedArtistsDetails", None, decode.optional(decode.list(artist_view_basic_decoder())))
  use similarity_score <- decode.optional_field("similarityScore", None, decode.optional(float_decoder()))
  decode.success(ActorNeighbourViewBasic(user_id: user_id, did: did, handle: handle, display_name: display_name, avatar: avatar, shared_artists_count: shared_artists_count, top_shared_artist_names: top_shared_artist_names, top_shared_artists_details: top_shared_artists_details, similarity_score: similarity_score))
}

pub fn encode_actor_neighbour_view_basic(value: ActorNeighbourViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.user_id { Some(v) -> [#("userId", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.shared_artists_count { Some(v) -> [#("sharedArtistsCount", json.int(v))] None -> [] },
    case value.top_shared_artist_names { Some(v) -> [#("topSharedArtistNames", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.top_shared_artists_details { Some(v) -> [#("topSharedArtistsDetails", json.array(v, fn(item) { encode_artist_view_basic(item) }))] None -> [] },
    case value.similarity_score { Some(v) -> [#("similarityScore", json.float(v))] None -> [] },
  ]))
}

pub type ActorProfileViewBasic {
  ActorProfileViewBasic(id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String), created_at: Option(String), updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_actor_profile_view_basic() -> ActorProfileViewBasic {
  ActorProfileViewBasic(id: None, did: None, handle: None, display_name: None, avatar: None, created_at: None, updated_at: None)
}

pub fn actor_profile_view_basic_decoder() -> decode.Decoder(ActorProfileViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(ActorProfileViewBasic(id: id, did: did, handle: handle, display_name: display_name, avatar: avatar, created_at: created_at, updated_at: updated_at))
}

pub fn encode_actor_profile_view_basic(value: ActorProfileViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type ActorProfileViewDetailed {
  ActorProfileViewDetailed(id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String), created_at: Option(String), updated_at: Option(String), spotify_user: Option(ActorResponseSpotifyUserView), spotify_connected: Option(Bool), googledrive: Option(ActorResponseGoogledriveView), dropbox: Option(ActorResponseDropboxView))
}

/// Construct with required fields; optional fields default to None.
pub fn new_actor_profile_view_detailed() -> ActorProfileViewDetailed {
  ActorProfileViewDetailed(id: None, did: None, handle: None, display_name: None, avatar: None, created_at: None, updated_at: None, spotify_user: None, spotify_connected: None, googledrive: None, dropbox: None)
}

pub fn actor_profile_view_detailed_decoder() -> decode.Decoder(ActorProfileViewDetailed) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use spotify_user <- decode.optional_field("spotifyUser", None, decode.optional(actor_response_spotify_user_view_decoder()))
  use spotify_connected <- decode.optional_field("spotifyConnected", None, decode.optional(decode.bool))
  use googledrive <- decode.optional_field("googledrive", None, decode.optional(actor_response_googledrive_view_decoder()))
  use dropbox <- decode.optional_field("dropbox", None, decode.optional(actor_response_dropbox_view_decoder()))
  decode.success(ActorProfileViewDetailed(id: id, did: did, handle: handle, display_name: display_name, avatar: avatar, created_at: created_at, updated_at: updated_at, spotify_user: spotify_user, spotify_connected: spotify_connected, googledrive: googledrive, dropbox: dropbox))
}

pub fn encode_actor_profile_view_detailed(value: ActorProfileViewDetailed) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.spotify_user { Some(v) -> [#("spotifyUser", encode_actor_response_spotify_user_view(v))] None -> [] },
    case value.spotify_connected { Some(v) -> [#("spotifyConnected", json.bool(v))] None -> [] },
    case value.googledrive { Some(v) -> [#("googledrive", encode_actor_response_googledrive_view(v))] None -> [] },
    case value.dropbox { Some(v) -> [#("dropbox", encode_actor_response_dropbox_view(v))] None -> [] },
  ]))
}

pub type ActorResponseDropboxView {
  ActorResponseDropboxView(created_at: Option(String), updated_at: Option(String), id: Option(String), email: Option(String), is_beta_user: Option(Bool), user_id: Option(String), xata_version: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_actor_response_dropbox_view() -> ActorResponseDropboxView {
  ActorResponseDropboxView(created_at: None, updated_at: None, id: None, email: None, is_beta_user: None, user_id: None, xata_version: None)
}

pub fn actor_response_dropbox_view_decoder() -> decode.Decoder(ActorResponseDropboxView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use email <- decode.optional_field("email", None, decode.optional(decode.string))
  use is_beta_user <- decode.optional_field("isBetaUser", None, decode.optional(decode.bool))
  use user_id <- decode.optional_field("userId", None, decode.optional(decode.string))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.string))
  decode.success(ActorResponseDropboxView(created_at: created_at, updated_at: updated_at, id: id, email: email, is_beta_user: is_beta_user, user_id: user_id, xata_version: xata_version))
}

pub fn encode_actor_response_dropbox_view(value: ActorResponseDropboxView) -> json.Json {
  json.object(list.flatten([
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.email { Some(v) -> [#("email", json.string(v))] None -> [] },
    case value.is_beta_user { Some(v) -> [#("isBetaUser", json.bool(v))] None -> [] },
    case value.user_id { Some(v) -> [#("userId", json.string(v))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.string(v))] None -> [] },
  ]))
}

pub type ActorResponseGoogledriveView {
  ActorResponseGoogledriveView(created_at: Option(String), updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_actor_response_googledrive_view() -> ActorResponseGoogledriveView {
  ActorResponseGoogledriveView(created_at: None, updated_at: None)
}

pub fn actor_response_googledrive_view_decoder() -> decode.Decoder(ActorResponseGoogledriveView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(ActorResponseGoogledriveView(created_at: created_at, updated_at: updated_at))
}

pub fn encode_actor_response_googledrive_view(value: ActorResponseGoogledriveView) -> json.Json {
  json.object(list.flatten([
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type ActorResponseSpotifyUserView {
  ActorResponseSpotifyUserView(created_at: Option(String), updated_at: Option(String), id: Option(String), xata_version: Option(Int), user_id: Option(String), is_beta_user: Option(Bool), spotify_app_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_actor_response_spotify_user_view() -> ActorResponseSpotifyUserView {
  ActorResponseSpotifyUserView(created_at: None, updated_at: None, id: None, xata_version: None, user_id: None, is_beta_user: None, spotify_app_id: None)
}

pub fn actor_response_spotify_user_view_decoder() -> decode.Decoder(ActorResponseSpotifyUserView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  use user_id <- decode.optional_field("userId", None, decode.optional(decode.string))
  use is_beta_user <- decode.optional_field("isBetaUser", None, decode.optional(decode.bool))
  use spotify_app_id <- decode.optional_field("spotifyAppId", None, decode.optional(decode.string))
  decode.success(ActorResponseSpotifyUserView(created_at: created_at, updated_at: updated_at, id: id, xata_version: xata_version, user_id: user_id, is_beta_user: is_beta_user, spotify_app_id: spotify_app_id))
}

pub fn encode_actor_response_spotify_user_view(value: ActorResponseSpotifyUserView) -> json.Json {
  json.object(list.flatten([
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
    case value.user_id { Some(v) -> [#("userId", json.string(v))] None -> [] },
    case value.is_beta_user { Some(v) -> [#("isBetaUser", json.bool(v))] None -> [] },
    case value.spotify_app_id { Some(v) -> [#("spotifyAppId", json.string(v))] None -> [] },
  ]))
}

pub type ActorTrackView {
  ActorTrackView(name: String, artist: String, album: Option(String), album_cover_url: Option(String), duration_ms: Option(Int), source: Option(String), recording_mb_id: Option(String), track_number: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_actor_track_view(name: String, artist: String) -> ActorTrackView {
  ActorTrackView(name: name, artist: artist, album: None, album_cover_url: None, duration_ms: None, source: None, recording_mb_id: None, track_number: None)
}

pub fn actor_track_view_decoder() -> decode.Decoder(ActorTrackView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use name <- decode.field("name", decode.string)
  use artist <- decode.field("artist", decode.string)
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use album_cover_url <- decode.optional_field("albumCoverUrl", None, decode.optional(decode.string))
  use duration_ms <- decode.optional_field("durationMs", None, decode.optional(decode.int))
  use source <- decode.optional_field("source", None, decode.optional(decode.string))
  use recording_mb_id <- decode.optional_field("recordingMbId", None, decode.optional(decode.string))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  decode.success(ActorTrackView(name: name, artist: artist, album: album, album_cover_url: album_cover_url, duration_ms: duration_ms, source: source, recording_mb_id: recording_mb_id, track_number: track_number))
}

pub fn encode_actor_track_view(value: ActorTrackView) -> json.Json {
  json.object(list.flatten([
    [#("name", json.string(value.name))],
    [#("artist", json.string(value.artist))],
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.album_cover_url { Some(v) -> [#("albumCoverUrl", json.string(v))] None -> [] },
    case value.duration_ms { Some(v) -> [#("durationMs", json.int(v))] None -> [] },
    case value.source { Some(v) -> [#("source", json.string(v))] None -> [] },
    case value.recording_mb_id { Some(v) -> [#("recordingMbId", json.string(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
  ]))
}

pub type AddDirectoryToQueueParams {
  AddDirectoryToQueueParams(player_id: Option(String), directory: String, position: Option(Int), shuffle: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_add_directory_to_queue_params(directory: String) -> AddDirectoryToQueueParams {
  AddDirectoryToQueueParams(player_id: None, directory: directory, position: None, shuffle: None)
}

pub fn add_directory_to_queue_params_decoder() -> decode.Decoder(AddDirectoryToQueueParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  use directory <- decode.field("directory", decode.string)
  use position <- decode.optional_field("position", None, decode.optional(decode.int))
  use shuffle <- decode.optional_field("shuffle", None, decode.optional(decode.bool))
  decode.success(AddDirectoryToQueueParams(player_id: player_id, directory: directory, position: position, shuffle: shuffle))
}

pub fn encode_add_directory_to_queue_params(value: AddDirectoryToQueueParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
    [#("directory", json.string(value.directory))],
    case value.position { Some(v) -> [#("position", json.int(v))] None -> [] },
    case value.shuffle { Some(v) -> [#("shuffle", json.bool(v))] None -> [] },
  ]))
}

pub type AddItemsToQueueParams {
  AddItemsToQueueParams(player_id: Option(String), items: List(String), position: Option(Int), shuffle: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_add_items_to_queue_params(items: List(String)) -> AddItemsToQueueParams {
  AddItemsToQueueParams(player_id: None, items: items, position: None, shuffle: None)
}

pub fn add_items_to_queue_params_decoder() -> decode.Decoder(AddItemsToQueueParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  use items <- decode.field("items", decode.list(decode.string))
  use position <- decode.optional_field("position", None, decode.optional(decode.int))
  use shuffle <- decode.optional_field("shuffle", None, decode.optional(decode.bool))
  decode.success(AddItemsToQueueParams(player_id: player_id, items: items, position: position, shuffle: shuffle))
}

pub fn encode_add_items_to_queue_params(value: AddItemsToQueueParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
    [#("items", json.array(value.items, fn(item) { json.string(item) }))],
    case value.position { Some(v) -> [#("position", json.int(v))] None -> [] },
    case value.shuffle { Some(v) -> [#("shuffle", json.bool(v))] None -> [] },
  ]))
}

pub type AddSongsOutput {
  AddSongsOutput(uris: List(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_add_songs_output(uris: List(String)) -> AddSongsOutput {
  AddSongsOutput(uris: uris)
}

pub fn add_songs_output_decoder() -> decode.Decoder(AddSongsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uris <- decode.field("uris", decode.list(decode.string))
  decode.success(AddSongsOutput(uris: uris))
}

pub fn encode_add_songs_output(value: AddSongsOutput) -> json.Json {
  json.object(list.flatten([
    [#("uris", json.array(value.uris, fn(item) { json.string(item) }))],
  ]))
}

pub type AddSongsParams {
  AddSongsParams(uri: String, songs: List(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_add_songs_params(uri: String, songs: List(String)) -> AddSongsParams {
  AddSongsParams(uri: uri, songs: songs)
}

pub fn add_songs_params_decoder() -> decode.Decoder(AddSongsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use songs <- decode.field("songs", decode.list(decode.string))
  decode.success(AddSongsParams(uri: uri, songs: songs))
}

pub fn encode_add_songs_params(value: AddSongsParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    [#("songs", json.array(value.songs, fn(item) { json.string(item) }))],
  ]))
}

pub type AlbumDiscogsArtistView {
  AlbumDiscogsArtistView(artist_id: Option(Int), name: Option(String), anv: Option(String), join_phrase: Option(String), role: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_discogs_artist_view() -> AlbumDiscogsArtistView {
  AlbumDiscogsArtistView(artist_id: None, name: None, anv: None, join_phrase: None, role: None)
}

pub fn album_discogs_artist_view_decoder() -> decode.Decoder(AlbumDiscogsArtistView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use artist_id <- decode.optional_field("artistId", None, decode.optional(decode.int))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use anv <- decode.optional_field("anv", None, decode.optional(decode.string))
  use join_phrase <- decode.optional_field("joinPhrase", None, decode.optional(decode.string))
  use role <- decode.optional_field("role", None, decode.optional(decode.string))
  decode.success(AlbumDiscogsArtistView(artist_id: artist_id, name: name, anv: anv, join_phrase: join_phrase, role: role))
}

pub fn encode_album_discogs_artist_view(value: AlbumDiscogsArtistView) -> json.Json {
  json.object(list.flatten([
    case value.artist_id { Some(v) -> [#("artistId", json.int(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.anv { Some(v) -> [#("anv", json.string(v))] None -> [] },
    case value.join_phrase { Some(v) -> [#("joinPhrase", json.string(v))] None -> [] },
    case value.role { Some(v) -> [#("role", json.string(v))] None -> [] },
  ]))
}

pub type AlbumDiscogsCreditView {
  AlbumDiscogsCreditView(artist_id: Option(Int), name: Option(String), role: Option(String), tracks: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_discogs_credit_view() -> AlbumDiscogsCreditView {
  AlbumDiscogsCreditView(artist_id: None, name: None, role: None, tracks: None)
}

pub fn album_discogs_credit_view_decoder() -> decode.Decoder(AlbumDiscogsCreditView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use artist_id <- decode.optional_field("artistId", None, decode.optional(decode.int))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use role <- decode.optional_field("role", None, decode.optional(decode.string))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.string))
  decode.success(AlbumDiscogsCreditView(artist_id: artist_id, name: name, role: role, tracks: tracks))
}

pub fn encode_album_discogs_credit_view(value: AlbumDiscogsCreditView) -> json.Json {
  json.object(list.flatten([
    case value.artist_id { Some(v) -> [#("artistId", json.int(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.role { Some(v) -> [#("role", json.string(v))] None -> [] },
    case value.tracks { Some(v) -> [#("tracks", json.string(v))] None -> [] },
  ]))
}

pub type AlbumDiscogsIdentifierView {
  AlbumDiscogsIdentifierView(type_: Option(String), value: Option(String), description: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_discogs_identifier_view() -> AlbumDiscogsIdentifierView {
  AlbumDiscogsIdentifierView(type_: None, value: None, description: None)
}

pub fn album_discogs_identifier_view_decoder() -> decode.Decoder(AlbumDiscogsIdentifierView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use value <- decode.optional_field("value", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  decode.success(AlbumDiscogsIdentifierView(type_: type_, value: value, description: description))
}

pub fn encode_album_discogs_identifier_view(value: AlbumDiscogsIdentifierView) -> json.Json {
  json.object(list.flatten([
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.value { Some(v) -> [#("value", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
  ]))
}

pub type AlbumDiscogsLabelView {
  AlbumDiscogsLabelView(label_id: Option(Int), name: Option(String), catalog_number: Option(String), kind: Option(String), entity_type: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_discogs_label_view() -> AlbumDiscogsLabelView {
  AlbumDiscogsLabelView(label_id: None, name: None, catalog_number: None, kind: None, entity_type: None)
}

pub fn album_discogs_label_view_decoder() -> decode.Decoder(AlbumDiscogsLabelView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use label_id <- decode.optional_field("labelId", None, decode.optional(decode.int))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use catalog_number <- decode.optional_field("catalogNumber", None, decode.optional(decode.string))
  use kind <- decode.optional_field("kind", None, decode.optional(decode.string))
  use entity_type <- decode.optional_field("entityType", None, decode.optional(decode.string))
  decode.success(AlbumDiscogsLabelView(label_id: label_id, name: name, catalog_number: catalog_number, kind: kind, entity_type: entity_type))
}

pub fn encode_album_discogs_label_view(value: AlbumDiscogsLabelView) -> json.Json {
  json.object(list.flatten([
    case value.label_id { Some(v) -> [#("labelId", json.int(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.catalog_number { Some(v) -> [#("catalogNumber", json.string(v))] None -> [] },
    case value.kind { Some(v) -> [#("kind", json.string(v))] None -> [] },
    case value.entity_type { Some(v) -> [#("entityType", json.string(v))] None -> [] },
  ]))
}

pub type AlbumDiscogsMasterView {
  AlbumDiscogsMasterView(master_id: Option(Int), title: Option(String), artist: Option(String), year: Option(Int), main_release_id: Option(Int), url: Option(String), genres: Option(List(String)), styles: Option(List(String)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_discogs_master_view() -> AlbumDiscogsMasterView {
  AlbumDiscogsMasterView(master_id: None, title: None, artist: None, year: None, main_release_id: None, url: None, genres: None, styles: None)
}

pub fn album_discogs_master_view_decoder() -> decode.Decoder(AlbumDiscogsMasterView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use master_id <- decode.optional_field("masterId", None, decode.optional(decode.int))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use main_release_id <- decode.optional_field("mainReleaseId", None, decode.optional(decode.int))
  use url <- decode.optional_field("url", None, decode.optional(decode.string))
  use genres <- decode.optional_field("genres", None, decode.optional(decode.list(decode.string)))
  use styles <- decode.optional_field("styles", None, decode.optional(decode.list(decode.string)))
  decode.success(AlbumDiscogsMasterView(master_id: master_id, title: title, artist: artist, year: year, main_release_id: main_release_id, url: url, genres: genres, styles: styles))
}

pub fn encode_album_discogs_master_view(value: AlbumDiscogsMasterView) -> json.Json {
  json.object(list.flatten([
    case value.master_id { Some(v) -> [#("masterId", json.int(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.main_release_id { Some(v) -> [#("mainReleaseId", json.int(v))] None -> [] },
    case value.url { Some(v) -> [#("url", json.string(v))] None -> [] },
    case value.genres { Some(v) -> [#("genres", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.styles { Some(v) -> [#("styles", json.array(v, fn(item) { json.string(item) }))] None -> [] },
  ]))
}

pub type AlbumDiscogsTrackView {
  AlbumDiscogsTrackView(position: Option(String), type_: Option(String), title: Option(String), duration: Option(String), duration_ms: Option(Int), disc_number: Option(Int), track_number: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_discogs_track_view() -> AlbumDiscogsTrackView {
  AlbumDiscogsTrackView(position: None, type_: None, title: None, duration: None, duration_ms: None, disc_number: None, track_number: None)
}

pub fn album_discogs_track_view_decoder() -> decode.Decoder(AlbumDiscogsTrackView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use position <- decode.optional_field("position", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use duration <- decode.optional_field("duration", None, decode.optional(decode.string))
  use duration_ms <- decode.optional_field("durationMs", None, decode.optional(decode.int))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  decode.success(AlbumDiscogsTrackView(position: position, type_: type_, title: title, duration: duration, duration_ms: duration_ms, disc_number: disc_number, track_number: track_number))
}

pub fn encode_album_discogs_track_view(value: AlbumDiscogsTrackView) -> json.Json {
  json.object(list.flatten([
    case value.position { Some(v) -> [#("position", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.duration { Some(v) -> [#("duration", json.string(v))] None -> [] },
    case value.duration_ms { Some(v) -> [#("durationMs", json.int(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
  ]))
}

pub type AlbumDiscogsView {
  AlbumDiscogsView(release_id: Option(Int), master_id: Option(Int), title: Option(String), artist: Option(String), album_art: Option(String), year: Option(Int), original_year: Option(Int), release_date: Option(String), country: Option(String), label: Option(String), catalog_number: Option(String), barcode: Option(String), formats: Option(List(String)), genres: Option(List(String)), styles: Option(List(String)), url: Option(String), score: Option(Int), credits: Option(List(AlbumDiscogsCreditView)), tracklist: Option(List(AlbumDiscogsTrackView)), labels: Option(List(AlbumDiscogsLabelView)), identifiers: Option(List(AlbumDiscogsIdentifierView)), artists: Option(List(AlbumDiscogsArtistView)), master: Option(AlbumDiscogsMasterView))
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_discogs_view() -> AlbumDiscogsView {
  AlbumDiscogsView(release_id: None, master_id: None, title: None, artist: None, album_art: None, year: None, original_year: None, release_date: None, country: None, label: None, catalog_number: None, barcode: None, formats: None, genres: None, styles: None, url: None, score: None, credits: None, tracklist: None, labels: None, identifiers: None, artists: None, master: None)
}

pub fn album_discogs_view_decoder() -> decode.Decoder(AlbumDiscogsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use release_id <- decode.optional_field("releaseId", None, decode.optional(decode.int))
  use master_id <- decode.optional_field("masterId", None, decode.optional(decode.int))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use original_year <- decode.optional_field("originalYear", None, decode.optional(decode.int))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use country <- decode.optional_field("country", None, decode.optional(decode.string))
  use label <- decode.optional_field("label", None, decode.optional(decode.string))
  use catalog_number <- decode.optional_field("catalogNumber", None, decode.optional(decode.string))
  use barcode <- decode.optional_field("barcode", None, decode.optional(decode.string))
  use formats <- decode.optional_field("formats", None, decode.optional(decode.list(decode.string)))
  use genres <- decode.optional_field("genres", None, decode.optional(decode.list(decode.string)))
  use styles <- decode.optional_field("styles", None, decode.optional(decode.list(decode.string)))
  use url <- decode.optional_field("url", None, decode.optional(decode.string))
  use score <- decode.optional_field("score", None, decode.optional(decode.int))
  use credits <- decode.optional_field("credits", None, decode.optional(decode.list(album_discogs_credit_view_decoder())))
  use tracklist <- decode.optional_field("tracklist", None, decode.optional(decode.list(album_discogs_track_view_decoder())))
  use labels <- decode.optional_field("labels", None, decode.optional(decode.list(album_discogs_label_view_decoder())))
  use identifiers <- decode.optional_field("identifiers", None, decode.optional(decode.list(album_discogs_identifier_view_decoder())))
  use artists <- decode.optional_field("artists", None, decode.optional(decode.list(album_discogs_artist_view_decoder())))
  use master <- decode.optional_field("master", None, decode.optional(album_discogs_master_view_decoder()))
  decode.success(AlbumDiscogsView(release_id: release_id, master_id: master_id, title: title, artist: artist, album_art: album_art, year: year, original_year: original_year, release_date: release_date, country: country, label: label, catalog_number: catalog_number, barcode: barcode, formats: formats, genres: genres, styles: styles, url: url, score: score, credits: credits, tracklist: tracklist, labels: labels, identifiers: identifiers, artists: artists, master: master))
}

pub fn encode_album_discogs_view(value: AlbumDiscogsView) -> json.Json {
  json.object(list.flatten([
    case value.release_id { Some(v) -> [#("releaseId", json.int(v))] None -> [] },
    case value.master_id { Some(v) -> [#("masterId", json.int(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.original_year { Some(v) -> [#("originalYear", json.int(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.country { Some(v) -> [#("country", json.string(v))] None -> [] },
    case value.label { Some(v) -> [#("label", json.string(v))] None -> [] },
    case value.catalog_number { Some(v) -> [#("catalogNumber", json.string(v))] None -> [] },
    case value.barcode { Some(v) -> [#("barcode", json.string(v))] None -> [] },
    case value.formats { Some(v) -> [#("formats", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.genres { Some(v) -> [#("genres", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.styles { Some(v) -> [#("styles", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.url { Some(v) -> [#("url", json.string(v))] None -> [] },
    case value.score { Some(v) -> [#("score", json.int(v))] None -> [] },
    case value.credits { Some(v) -> [#("credits", json.array(v, fn(item) { encode_album_discogs_credit_view(item) }))] None -> [] },
    case value.tracklist { Some(v) -> [#("tracklist", json.array(v, fn(item) { encode_album_discogs_track_view(item) }))] None -> [] },
    case value.labels { Some(v) -> [#("labels", json.array(v, fn(item) { encode_album_discogs_label_view(item) }))] None -> [] },
    case value.identifiers { Some(v) -> [#("identifiers", json.array(v, fn(item) { encode_album_discogs_identifier_view(item) }))] None -> [] },
    case value.artists { Some(v) -> [#("artists", json.array(v, fn(item) { encode_album_discogs_artist_view(item) }))] None -> [] },
    case value.master { Some(v) -> [#("master", encode_album_discogs_master_view(v))] None -> [] },
  ]))
}

pub type AlbumGetAlbumParams {
  AlbumGetAlbumParams(uri: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_get_album_params(uri: String) -> AlbumGetAlbumParams {
  AlbumGetAlbumParams(uri: uri)
}

pub fn album_get_album_params_decoder() -> decode.Decoder(AlbumGetAlbumParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  decode.success(AlbumGetAlbumParams(uri: uri))
}

pub fn encode_album_get_album_params(value: AlbumGetAlbumParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
  ]))
}

pub type AlbumRecord {
  AlbumRecord(title: String, artist: String, duration: Option(Int), release_date: Option(String), year: Option(Int), genre: Option(String), album_art: Option(BlobRef), album_art_url: Option(String), tags: Option(List(String)), youtube_link: Option(String), spotify_link: Option(String), tidal_link: Option(String), apple_music_link: Option(String), created_at: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_record(title: String, artist: String, created_at: String) -> AlbumRecord {
  AlbumRecord(title: title, artist: artist, duration: None, release_date: None, year: None, genre: None, album_art: None, album_art_url: None, tags: None, youtube_link: None, spotify_link: None, tidal_link: None, apple_music_link: None, created_at: created_at)
}

pub fn album_record_decoder() -> decode.Decoder(AlbumRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use duration <- decode.optional_field("duration", None, decode.optional(decode.int))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(blob_ref_decoder()))
  use album_art_url <- decode.optional_field("albumArtUrl", None, decode.optional(decode.string))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use created_at <- decode.field("createdAt", decode.string)
  decode.success(AlbumRecord(title: title, artist: artist, duration: duration, release_date: release_date, year: year, genre: genre, album_art: album_art, album_art_url: album_art_url, tags: tags, youtube_link: youtube_link, spotify_link: spotify_link, tidal_link: tidal_link, apple_music_link: apple_music_link, created_at: created_at))
}

pub fn encode_album_record(value: AlbumRecord) -> json.Json {
  json.object(list.flatten([
    [#("title", json.string(value.title))],
    [#("artist", json.string(value.artist))],
    case value.duration { Some(v) -> [#("duration", json.int(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", encode_blob_ref(v))] None -> [] },
    case value.album_art_url { Some(v) -> [#("albumArtUrl", json.string(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
  ]))
}

pub type AlbumViewBasic {
  AlbumViewBasic(id: Option(String), uri: Option(String), title: Option(String), artist: Option(String), artist_uri: Option(String), year: Option(Int), album_art: Option(String), release_date: Option(String), sha256: Option(String), play_count: Option(Int), unique_listeners: Option(Int), apple_music_link: Option(String), spotify_link: Option(String), tidal_link: Option(String), youtube_link: Option(String), discogs_release_id: Option(String), created_at: Option(String), updated_at: Option(String), xata_version: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_view_basic() -> AlbumViewBasic {
  AlbumViewBasic(id: None, uri: None, title: None, artist: None, artist_uri: None, year: None, album_art: None, release_date: None, sha256: None, play_count: None, unique_listeners: None, apple_music_link: None, spotify_link: None, tidal_link: None, youtube_link: None, discogs_release_id: None, created_at: None, updated_at: None, xata_version: None)
}

pub fn album_view_basic_decoder() -> decode.Decoder(AlbumViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use sha256 <- decode.optional_field("sha256", None, decode.optional(decode.string))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  use unique_listeners <- decode.optional_field("uniqueListeners", None, decode.optional(decode.int))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use discogs_release_id <- decode.optional_field("discogsReleaseId", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  decode.success(AlbumViewBasic(id: id, uri: uri, title: title, artist: artist, artist_uri: artist_uri, year: year, album_art: album_art, release_date: release_date, sha256: sha256, play_count: play_count, unique_listeners: unique_listeners, apple_music_link: apple_music_link, spotify_link: spotify_link, tidal_link: tidal_link, youtube_link: youtube_link, discogs_release_id: discogs_release_id, created_at: created_at, updated_at: updated_at, xata_version: xata_version))
}

pub fn encode_album_view_basic(value: AlbumViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.sha256 { Some(v) -> [#("sha256", json.string(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
    case value.unique_listeners { Some(v) -> [#("uniqueListeners", json.int(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.discogs_release_id { Some(v) -> [#("discogsReleaseId", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
  ]))
}

pub type AlbumViewDetailed {
  AlbumViewDetailed(id: Option(String), uri: Option(String), title: Option(String), artist: Option(String), artist_uri: Option(String), year: Option(Int), album_art: Option(String), release_date: Option(String), sha256: Option(String), play_count: Option(Int), unique_listeners: Option(Int), tags: Option(List(String)), tracks: Option(List(SongViewBasic)), discogs: Option(AlbumDiscogsView), created_at: Option(String), apple_music_link: Option(String), spotify_link: Option(String), tidal_link: Option(String), youtube_link: Option(String), discogs_release_id: Option(String), updated_at: Option(String), xata_version: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_album_view_detailed() -> AlbumViewDetailed {
  AlbumViewDetailed(id: None, uri: None, title: None, artist: None, artist_uri: None, year: None, album_art: None, release_date: None, sha256: None, play_count: None, unique_listeners: None, tags: None, tracks: None, discogs: None, created_at: None, apple_music_link: None, spotify_link: None, tidal_link: None, youtube_link: None, discogs_release_id: None, updated_at: None, xata_version: None)
}

pub fn album_view_detailed_decoder() -> decode.Decoder(AlbumViewDetailed) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use sha256 <- decode.optional_field("sha256", None, decode.optional(decode.string))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  use unique_listeners <- decode.optional_field("uniqueListeners", None, decode.optional(decode.int))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.list(song_view_basic_decoder())))
  use discogs <- decode.optional_field("discogs", None, decode.optional(album_discogs_view_decoder()))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use discogs_release_id <- decode.optional_field("discogsReleaseId", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  decode.success(AlbumViewDetailed(id: id, uri: uri, title: title, artist: artist, artist_uri: artist_uri, year: year, album_art: album_art, release_date: release_date, sha256: sha256, play_count: play_count, unique_listeners: unique_listeners, tags: tags, tracks: tracks, discogs: discogs, created_at: created_at, apple_music_link: apple_music_link, spotify_link: spotify_link, tidal_link: tidal_link, youtube_link: youtube_link, discogs_release_id: discogs_release_id, updated_at: updated_at, xata_version: xata_version))
}

pub fn encode_album_view_detailed(value: AlbumViewDetailed) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.sha256 { Some(v) -> [#("sha256", json.string(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
    case value.unique_listeners { Some(v) -> [#("uniqueListeners", json.int(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.tracks { Some(v) -> [#("tracks", json.array(v, fn(item) { encode_song_view_basic(item) }))] None -> [] },
    case value.discogs { Some(v) -> [#("discogs", encode_album_discogs_view(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.discogs_release_id { Some(v) -> [#("discogsReleaseId", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
  ]))
}

pub type ApiKeyView {
  ApiKeyView(id: Option(String), name: Option(String), description: Option(String), created_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_api_key_view() -> ApiKeyView {
  ApiKeyView(id: None, name: None, description: None, created_at: None)
}

pub fn api_key_view_decoder() -> decode.Decoder(ApiKeyView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  decode.success(ApiKeyView(id: id, name: name, description: description, created_at: created_at))
}

pub fn encode_api_key_view(value: ApiKeyView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
  ]))
}

pub type ArtistGetArtistParams {
  ArtistGetArtistParams(uri: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_get_artist_params(uri: String) -> ArtistGetArtistParams {
  ArtistGetArtistParams(uri: uri)
}

pub fn artist_get_artist_params_decoder() -> decode.Decoder(ArtistGetArtistParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  decode.success(ArtistGetArtistParams(uri: uri))
}

pub fn encode_artist_get_artist_params(value: ArtistGetArtistParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
  ]))
}

pub type ArtistGetArtistsOutput {
  ArtistGetArtistsOutput(artists: Option(List(ArtistViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_get_artists_output() -> ArtistGetArtistsOutput {
  ArtistGetArtistsOutput(artists: None)
}

pub fn artist_get_artists_output_decoder() -> decode.Decoder(ArtistGetArtistsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use artists <- decode.optional_field("artists", None, decode.optional(decode.list(artist_view_basic_decoder())))
  decode.success(ArtistGetArtistsOutput(artists: artists))
}

pub fn encode_artist_get_artists_output(value: ArtistGetArtistsOutput) -> json.Json {
  json.object(list.flatten([
    case value.artists { Some(v) -> [#("artists", json.array(v, fn(item) { encode_artist_view_basic(item) }))] None -> [] },
  ]))
}

pub type ArtistGetArtistsParams {
  ArtistGetArtistsParams(limit: Option(Int), offset: Option(Int), names: Option(String), genre: Option(String), filter: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_get_artists_params() -> ArtistGetArtistsParams {
  ArtistGetArtistsParams(limit: None, offset: None, names: None, genre: None, filter: None)
}

pub fn artist_get_artists_params_decoder() -> decode.Decoder(ArtistGetArtistsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use names <- decode.optional_field("names", None, decode.optional(decode.string))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use filter <- decode.optional_field("filter", None, decode.optional(decode.string))
  decode.success(ArtistGetArtistsParams(limit: limit, offset: offset, names: names, genre: genre, filter: filter))
}

pub fn encode_artist_get_artists_params(value: ArtistGetArtistsParams) -> json.Json {
  json.object(list.flatten([
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.names { Some(v) -> [#("names", json.string(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.filter { Some(v) -> [#("filter", json.string(v))] None -> [] },
  ]))
}

pub type ArtistListenerViewBasic {
  ArtistListenerViewBasic(id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String), most_listened_song: Option(ArtistSongViewBasic), total_plays: Option(Int), rank: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_listener_view_basic() -> ArtistListenerViewBasic {
  ArtistListenerViewBasic(id: None, did: None, handle: None, display_name: None, avatar: None, most_listened_song: None, total_plays: None, rank: None)
}

pub fn artist_listener_view_basic_decoder() -> decode.Decoder(ArtistListenerViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use most_listened_song <- decode.optional_field("mostListenedSong", None, decode.optional(artist_song_view_basic_decoder()))
  use total_plays <- decode.optional_field("totalPlays", None, decode.optional(decode.int))
  use rank <- decode.optional_field("rank", None, decode.optional(decode.int))
  decode.success(ArtistListenerViewBasic(id: id, did: did, handle: handle, display_name: display_name, avatar: avatar, most_listened_song: most_listened_song, total_plays: total_plays, rank: rank))
}

pub fn encode_artist_listener_view_basic(value: ArtistListenerViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.most_listened_song { Some(v) -> [#("mostListenedSong", encode_artist_song_view_basic(v))] None -> [] },
    case value.total_plays { Some(v) -> [#("totalPlays", json.int(v))] None -> [] },
    case value.rank { Some(v) -> [#("rank", json.int(v))] None -> [] },
  ]))
}

pub type ArtistMbid {
  ArtistMbid(mbid: Option(String), name: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_mbid() -> ArtistMbid {
  ArtistMbid(mbid: None, name: None)
}

pub fn artist_mbid_decoder() -> decode.Decoder(ArtistMbid) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  decode.success(ArtistMbid(mbid: mbid, name: name))
}

pub fn encode_artist_mbid(value: ArtistMbid) -> json.Json {
  json.object(list.flatten([
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
  ]))
}

pub type ArtistRecentListenerView {
  ArtistRecentListenerView(id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String), timestamp: Option(String), scrobble_uri: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_recent_listener_view() -> ArtistRecentListenerView {
  ArtistRecentListenerView(id: None, did: None, handle: None, display_name: None, avatar: None, timestamp: None, scrobble_uri: None)
}

pub fn artist_recent_listener_view_decoder() -> decode.Decoder(ArtistRecentListenerView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use timestamp <- decode.optional_field("timestamp", None, decode.optional(decode.string))
  use scrobble_uri <- decode.optional_field("scrobbleUri", None, decode.optional(decode.string))
  decode.success(ArtistRecentListenerView(id: id, did: did, handle: handle, display_name: display_name, avatar: avatar, timestamp: timestamp, scrobble_uri: scrobble_uri))
}

pub fn encode_artist_recent_listener_view(value: ArtistRecentListenerView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.timestamp { Some(v) -> [#("timestamp", json.string(v))] None -> [] },
    case value.scrobble_uri { Some(v) -> [#("scrobbleUri", json.string(v))] None -> [] },
  ]))
}

pub type ArtistRecord {
  ArtistRecord(name: String, bio: Option(String), picture: Option(BlobRef), picture_url: Option(String), tags: Option(List(String)), born: Option(String), died: Option(String), born_in: Option(String), created_at: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_record(name: String, created_at: String) -> ArtistRecord {
  ArtistRecord(name: name, bio: None, picture: None, picture_url: None, tags: None, born: None, died: None, born_in: None, created_at: created_at)
}

pub fn artist_record_decoder() -> decode.Decoder(ArtistRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use name <- decode.field("name", decode.string)
  use bio <- decode.optional_field("bio", None, decode.optional(decode.string))
  use picture <- decode.optional_field("picture", None, decode.optional(blob_ref_decoder()))
  use picture_url <- decode.optional_field("pictureUrl", None, decode.optional(decode.string))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use born <- decode.optional_field("born", None, decode.optional(decode.string))
  use died <- decode.optional_field("died", None, decode.optional(decode.string))
  use born_in <- decode.optional_field("bornIn", None, decode.optional(decode.string))
  use created_at <- decode.field("createdAt", decode.string)
  decode.success(ArtistRecord(name: name, bio: bio, picture: picture, picture_url: picture_url, tags: tags, born: born, died: died, born_in: born_in, created_at: created_at))
}

pub fn encode_artist_record(value: ArtistRecord) -> json.Json {
  json.object(list.flatten([
    [#("name", json.string(value.name))],
    case value.bio { Some(v) -> [#("bio", json.string(v))] None -> [] },
    case value.picture { Some(v) -> [#("picture", encode_blob_ref(v))] None -> [] },
    case value.picture_url { Some(v) -> [#("pictureUrl", json.string(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.born { Some(v) -> [#("born", json.string(v))] None -> [] },
    case value.died { Some(v) -> [#("died", json.string(v))] None -> [] },
    case value.born_in { Some(v) -> [#("bornIn", json.string(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
  ]))
}

pub type ArtistSongViewBasic {
  ArtistSongViewBasic(uri: Option(String), title: Option(String), play_count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_song_view_basic() -> ArtistSongViewBasic {
  ArtistSongViewBasic(uri: None, title: None, play_count: None)
}

pub fn artist_song_view_basic_decoder() -> decode.Decoder(ArtistSongViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  decode.success(ArtistSongViewBasic(uri: uri, title: title, play_count: play_count))
}

pub fn encode_artist_song_view_basic(value: ArtistSongViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
  ]))
}

pub type ArtistViewBasic {
  ArtistViewBasic(id: Option(String), uri: Option(String), name: Option(String), picture: Option(String), sha256: Option(String), play_count: Option(Int), unique_listeners: Option(Int), tags: Option(List(String)), created_at: Option(String), updated_at: Option(String), biography: Option(String), born: Option(String), born_in: Option(String), died: Option(String), apple_music_link: Option(String), spotify_link: Option(String), tidal_link: Option(String), youtube_link: Option(String), genres: Option(List(String)), xata_version: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_view_basic() -> ArtistViewBasic {
  ArtistViewBasic(id: None, uri: None, name: None, picture: None, sha256: None, play_count: None, unique_listeners: None, tags: None, created_at: None, updated_at: None, biography: None, born: None, born_in: None, died: None, apple_music_link: None, spotify_link: None, tidal_link: None, youtube_link: None, genres: None, xata_version: None)
}

pub fn artist_view_basic_decoder() -> decode.Decoder(ArtistViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use picture <- decode.optional_field("picture", None, decode.optional(decode.string))
  use sha256 <- decode.optional_field("sha256", None, decode.optional(decode.string))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  use unique_listeners <- decode.optional_field("uniqueListeners", None, decode.optional(decode.int))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use biography <- decode.optional_field("biography", None, decode.optional(decode.string))
  use born <- decode.optional_field("born", None, decode.optional(decode.string))
  use born_in <- decode.optional_field("bornIn", None, decode.optional(decode.string))
  use died <- decode.optional_field("died", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use genres <- decode.optional_field("genres", None, decode.optional(decode.list(decode.string)))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  decode.success(ArtistViewBasic(id: id, uri: uri, name: name, picture: picture, sha256: sha256, play_count: play_count, unique_listeners: unique_listeners, tags: tags, created_at: created_at, updated_at: updated_at, biography: biography, born: born, born_in: born_in, died: died, apple_music_link: apple_music_link, spotify_link: spotify_link, tidal_link: tidal_link, youtube_link: youtube_link, genres: genres, xata_version: xata_version))
}

pub fn encode_artist_view_basic(value: ArtistViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.picture { Some(v) -> [#("picture", json.string(v))] None -> [] },
    case value.sha256 { Some(v) -> [#("sha256", json.string(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
    case value.unique_listeners { Some(v) -> [#("uniqueListeners", json.int(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.biography { Some(v) -> [#("biography", json.string(v))] None -> [] },
    case value.born { Some(v) -> [#("born", json.string(v))] None -> [] },
    case value.born_in { Some(v) -> [#("bornIn", json.string(v))] None -> [] },
    case value.died { Some(v) -> [#("died", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.genres { Some(v) -> [#("genres", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
  ]))
}

pub type ArtistViewDetailed {
  ArtistViewDetailed(id: Option(String), uri: Option(String), name: Option(String), picture: Option(String), sha256: Option(String), play_count: Option(Int), unique_listeners: Option(Int), tags: Option(List(String)), created_at: Option(String), updated_at: Option(String), biography: Option(String), born: Option(String), born_in: Option(String), died: Option(String), apple_music_link: Option(String), spotify_link: Option(String), tidal_link: Option(String), youtube_link: Option(String), genres: Option(List(String)), xata_version: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_artist_view_detailed() -> ArtistViewDetailed {
  ArtistViewDetailed(id: None, uri: None, name: None, picture: None, sha256: None, play_count: None, unique_listeners: None, tags: None, created_at: None, updated_at: None, biography: None, born: None, born_in: None, died: None, apple_music_link: None, spotify_link: None, tidal_link: None, youtube_link: None, genres: None, xata_version: None)
}

pub fn artist_view_detailed_decoder() -> decode.Decoder(ArtistViewDetailed) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use picture <- decode.optional_field("picture", None, decode.optional(decode.string))
  use sha256 <- decode.optional_field("sha256", None, decode.optional(decode.string))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  use unique_listeners <- decode.optional_field("uniqueListeners", None, decode.optional(decode.int))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use biography <- decode.optional_field("biography", None, decode.optional(decode.string))
  use born <- decode.optional_field("born", None, decode.optional(decode.string))
  use born_in <- decode.optional_field("bornIn", None, decode.optional(decode.string))
  use died <- decode.optional_field("died", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use genres <- decode.optional_field("genres", None, decode.optional(decode.list(decode.string)))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  decode.success(ArtistViewDetailed(id: id, uri: uri, name: name, picture: picture, sha256: sha256, play_count: play_count, unique_listeners: unique_listeners, tags: tags, created_at: created_at, updated_at: updated_at, biography: biography, born: born, born_in: born_in, died: died, apple_music_link: apple_music_link, spotify_link: spotify_link, tidal_link: tidal_link, youtube_link: youtube_link, genres: genres, xata_version: xata_version))
}

pub fn encode_artist_view_detailed(value: ArtistViewDetailed) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.picture { Some(v) -> [#("picture", json.string(v))] None -> [] },
    case value.sha256 { Some(v) -> [#("sha256", json.string(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
    case value.unique_listeners { Some(v) -> [#("uniqueListeners", json.int(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.biography { Some(v) -> [#("biography", json.string(v))] None -> [] },
    case value.born { Some(v) -> [#("born", json.string(v))] None -> [] },
    case value.born_in { Some(v) -> [#("bornIn", json.string(v))] None -> [] },
    case value.died { Some(v) -> [#("died", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.genres { Some(v) -> [#("genres", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
  ]))
}

pub type ChartsDecadeViewBasic {
  ChartsDecadeViewBasic(decade: Option(Int), scrobbles: Option(Int), unique_albums: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_charts_decade_view_basic() -> ChartsDecadeViewBasic {
  ChartsDecadeViewBasic(decade: None, scrobbles: None, unique_albums: None)
}

pub fn charts_decade_view_basic_decoder() -> decode.Decoder(ChartsDecadeViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use decade <- decode.optional_field("decade", None, decode.optional(decode.int))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.int))
  use unique_albums <- decode.optional_field("uniqueAlbums", None, decode.optional(decode.int))
  decode.success(ChartsDecadeViewBasic(decade: decade, scrobbles: scrobbles, unique_albums: unique_albums))
}

pub fn encode_charts_decade_view_basic(value: ChartsDecadeViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.decade { Some(v) -> [#("decade", json.int(v))] None -> [] },
    case value.scrobbles { Some(v) -> [#("scrobbles", json.int(v))] None -> [] },
    case value.unique_albums { Some(v) -> [#("uniqueAlbums", json.int(v))] None -> [] },
  ]))
}

pub type ChartsScrobblerViewBasic {
  ChartsScrobblerViewBasic(id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String), scrobbles: Option(Int), unique_artists: Option(Int), unique_tracks: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_charts_scrobbler_view_basic() -> ChartsScrobblerViewBasic {
  ChartsScrobblerViewBasic(id: None, did: None, handle: None, display_name: None, avatar: None, scrobbles: None, unique_artists: None, unique_tracks: None)
}

pub fn charts_scrobbler_view_basic_decoder() -> decode.Decoder(ChartsScrobblerViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.int))
  use unique_artists <- decode.optional_field("uniqueArtists", None, decode.optional(decode.int))
  use unique_tracks <- decode.optional_field("uniqueTracks", None, decode.optional(decode.int))
  decode.success(ChartsScrobblerViewBasic(id: id, did: did, handle: handle, display_name: display_name, avatar: avatar, scrobbles: scrobbles, unique_artists: unique_artists, unique_tracks: unique_tracks))
}

pub fn encode_charts_scrobbler_view_basic(value: ChartsScrobblerViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.scrobbles { Some(v) -> [#("scrobbles", json.int(v))] None -> [] },
    case value.unique_artists { Some(v) -> [#("uniqueArtists", json.int(v))] None -> [] },
    case value.unique_tracks { Some(v) -> [#("uniqueTracks", json.int(v))] None -> [] },
  ]))
}

pub type ChartsScrobbleViewBasic {
  ChartsScrobbleViewBasic(date: Option(String), count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_charts_scrobble_view_basic() -> ChartsScrobbleViewBasic {
  ChartsScrobbleViewBasic(date: None, count: None)
}

pub fn charts_scrobble_view_basic_decoder() -> decode.Decoder(ChartsScrobbleViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use date <- decode.optional_field("date", None, decode.optional(decode.string))
  use count <- decode.optional_field("count", None, decode.optional(decode.int))
  decode.success(ChartsScrobbleViewBasic(date: date, count: count))
}

pub fn encode_charts_scrobble_view_basic(value: ChartsScrobbleViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.date { Some(v) -> [#("date", json.string(v))] None -> [] },
    case value.count { Some(v) -> [#("count", json.int(v))] None -> [] },
  ]))
}

pub type ChartsView {
  ChartsView(scrobbles: Option(List(ChartsScrobbleViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_charts_view() -> ChartsView {
  ChartsView(scrobbles: None)
}

pub fn charts_view_decoder() -> decode.Decoder(ChartsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.list(charts_scrobble_view_basic_decoder())))
  decode.success(ChartsView(scrobbles: scrobbles))
}

pub fn encode_charts_view(value: ChartsView) -> json.Json {
  json.object(list.flatten([
    case value.scrobbles { Some(v) -> [#("scrobbles", json.array(v, fn(item) { encode_charts_scrobble_view_basic(item) }))] None -> [] },
  ]))
}

pub type CreateApikeyInput {
  CreateApikeyInput(name: String, description: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_create_apikey_input(name: String) -> CreateApikeyInput {
  CreateApikeyInput(name: name, description: None)
}

pub fn create_apikey_input_decoder() -> decode.Decoder(CreateApikeyInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use name <- decode.field("name", decode.string)
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  decode.success(CreateApikeyInput(name: name, description: description))
}

pub fn encode_create_apikey_input(value: CreateApikeyInput) -> json.Json {
  json.object(list.flatten([
    [#("name", json.string(value.name))],
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
  ]))
}

pub type CreateScrobbleInput {
  CreateScrobbleInput(title: String, artist: String, album: Option(String), duration: Option(Int), mb_id: Option(String), isrc: Option(String), album_art: Option(String), track_number: Option(Int), release_date: Option(String), year: Option(Int), disc_number: Option(Int), lyrics: Option(String), composer: Option(String), copyright_message: Option(String), label: Option(String), artist_picture: Option(String), spotify_link: Option(String), lastfm_link: Option(String), tidal_link: Option(String), apple_music_link: Option(String), youtube_link: Option(String), deezer_link: Option(String), timestamp: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_create_scrobble_input(title: String, artist: String) -> CreateScrobbleInput {
  CreateScrobbleInput(title: title, artist: artist, album: None, duration: None, mb_id: None, isrc: None, album_art: None, track_number: None, release_date: None, year: None, disc_number: None, lyrics: None, composer: None, copyright_message: None, label: None, artist_picture: None, spotify_link: None, lastfm_link: None, tidal_link: None, apple_music_link: None, youtube_link: None, deezer_link: None, timestamp: None)
}

pub fn create_scrobble_input_decoder() -> decode.Decoder(CreateScrobbleInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use duration <- decode.optional_field("duration", None, decode.optional(decode.int))
  use mb_id <- decode.optional_field("mbId", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use lyrics <- decode.optional_field("lyrics", None, decode.optional(decode.string))
  use composer <- decode.optional_field("composer", None, decode.optional(decode.string))
  use copyright_message <- decode.optional_field("copyrightMessage", None, decode.optional(decode.string))
  use label <- decode.optional_field("label", None, decode.optional(decode.string))
  use artist_picture <- decode.optional_field("artistPicture", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use lastfm_link <- decode.optional_field("lastfmLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use deezer_link <- decode.optional_field("deezerLink", None, decode.optional(decode.string))
  use timestamp <- decode.optional_field("timestamp", None, decode.optional(decode.int))
  decode.success(CreateScrobbleInput(title: title, artist: artist, album: album, duration: duration, mb_id: mb_id, isrc: isrc, album_art: album_art, track_number: track_number, release_date: release_date, year: year, disc_number: disc_number, lyrics: lyrics, composer: composer, copyright_message: copyright_message, label: label, artist_picture: artist_picture, spotify_link: spotify_link, lastfm_link: lastfm_link, tidal_link: tidal_link, apple_music_link: apple_music_link, youtube_link: youtube_link, deezer_link: deezer_link, timestamp: timestamp))
}

pub fn encode_create_scrobble_input(value: CreateScrobbleInput) -> json.Json {
  json.object(list.flatten([
    [#("title", json.string(value.title))],
    [#("artist", json.string(value.artist))],
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.duration { Some(v) -> [#("duration", json.int(v))] None -> [] },
    case value.mb_id { Some(v) -> [#("mbId", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.lyrics { Some(v) -> [#("lyrics", json.string(v))] None -> [] },
    case value.composer { Some(v) -> [#("composer", json.string(v))] None -> [] },
    case value.copyright_message { Some(v) -> [#("copyrightMessage", json.string(v))] None -> [] },
    case value.label { Some(v) -> [#("label", json.string(v))] None -> [] },
    case value.artist_picture { Some(v) -> [#("artistPicture", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.lastfm_link { Some(v) -> [#("lastfmLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.deezer_link { Some(v) -> [#("deezerLink", json.string(v))] None -> [] },
    case value.timestamp { Some(v) -> [#("timestamp", json.int(v))] None -> [] },
  ]))
}

pub type CreateShoutInput {
  CreateShoutInput(message: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_create_shout_input() -> CreateShoutInput {
  CreateShoutInput(message: None)
}

pub fn create_shout_input_decoder() -> decode.Decoder(CreateShoutInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use message <- decode.optional_field("message", None, decode.optional(decode.string))
  decode.success(CreateShoutInput(message: message))
}

pub fn encode_create_shout_input(value: CreateShoutInput) -> json.Json {
  json.object(list.flatten([
    case value.message { Some(v) -> [#("message", json.string(v))] None -> [] },
  ]))
}

pub type CreateSongInput {
  CreateSongInput(title: String, artist: String, album_artist: String, album: String, duration: Option(Int), mb_id: Option(String), isrc: Option(String), album_art: Option(String), track_number: Option(Int), release_date: Option(String), year: Option(Int), disc_number: Option(Int), lyrics: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_create_song_input(title: String, artist: String, album_artist: String, album: String) -> CreateSongInput {
  CreateSongInput(title: title, artist: artist, album_artist: album_artist, album: album, duration: None, mb_id: None, isrc: None, album_art: None, track_number: None, release_date: None, year: None, disc_number: None, lyrics: None)
}

pub fn create_song_input_decoder() -> decode.Decoder(CreateSongInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use album_artist <- decode.field("albumArtist", decode.string)
  use album <- decode.field("album", decode.string)
  use duration <- decode.optional_field("duration", None, decode.optional(decode.int))
  use mb_id <- decode.optional_field("mbId", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use lyrics <- decode.optional_field("lyrics", None, decode.optional(decode.string))
  decode.success(CreateSongInput(title: title, artist: artist, album_artist: album_artist, album: album, duration: duration, mb_id: mb_id, isrc: isrc, album_art: album_art, track_number: track_number, release_date: release_date, year: year, disc_number: disc_number, lyrics: lyrics))
}

pub fn encode_create_song_input(value: CreateSongInput) -> json.Json {
  json.object(list.flatten([
    [#("title", json.string(value.title))],
    [#("artist", json.string(value.artist))],
    [#("albumArtist", json.string(value.album_artist))],
    [#("album", json.string(value.album))],
    case value.duration { Some(v) -> [#("duration", json.int(v))] None -> [] },
    case value.mb_id { Some(v) -> [#("mbId", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.lyrics { Some(v) -> [#("lyrics", json.string(v))] None -> [] },
  ]))
}

pub type DeleteAlbumInput {
  DeleteAlbumInput(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_delete_album_input(id: String) -> DeleteAlbumInput {
  DeleteAlbumInput(id: id)
}

pub fn delete_album_input_decoder() -> decode.Decoder(DeleteAlbumInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(DeleteAlbumInput(id: id))
}

pub fn encode_delete_album_input(value: DeleteAlbumInput) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type DeleteAlbumOutput {
  DeleteAlbumOutput(status: String, deleted: Int)
}

/// Construct with required fields; optional fields default to None.
pub fn new_delete_album_output(status: String, deleted: Int) -> DeleteAlbumOutput {
  DeleteAlbumOutput(status: status, deleted: deleted)
}

pub fn delete_album_output_decoder() -> decode.Decoder(DeleteAlbumOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.field("status", decode.string)
  use deleted <- decode.field("deleted", decode.int)
  decode.success(DeleteAlbumOutput(status: status, deleted: deleted))
}

pub fn encode_delete_album_output(value: DeleteAlbumOutput) -> json.Json {
  json.object(list.flatten([
    [#("status", json.string(value.status))],
    [#("deleted", json.int(value.deleted))],
  ]))
}

pub type DeletePlaylistInput {
  DeletePlaylistInput(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_delete_playlist_input(id: String) -> DeletePlaylistInput {
  DeletePlaylistInput(id: id)
}

pub fn delete_playlist_input_decoder() -> decode.Decoder(DeletePlaylistInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(DeletePlaylistInput(id: id))
}

pub fn encode_delete_playlist_input(value: DeletePlaylistInput) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type DeletePlaylistOutput {
  DeletePlaylistOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), atproto_error: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_delete_playlist_output() -> DeletePlaylistOutput {
  DeletePlaylistOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, atproto_error: None)
}

pub fn delete_playlist_output_decoder() -> decode.Decoder(DeletePlaylistOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use atproto_error <- decode.optional_field("atprotoError", None, decode.optional(decode.string))
  decode.success(DeletePlaylistOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, atproto_error: atproto_error))
}

pub fn encode_delete_playlist_output(value: DeletePlaylistOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.atproto_error { Some(v) -> [#("atprotoError", json.string(v))] None -> [] },
  ]))
}

pub type DeletePresetParams {
  DeletePresetParams(rkey: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_delete_preset_params(rkey: String) -> DeletePresetParams {
  DeletePresetParams(rkey: rkey)
}

pub fn delete_preset_params_decoder() -> decode.Decoder(DeletePresetParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use rkey <- decode.field("rkey", decode.string)
  decode.success(DeletePresetParams(rkey: rkey))
}

pub fn encode_delete_preset_params(value: DeletePresetParams) -> json.Json {
  json.object(list.flatten([
    [#("rkey", json.string(value.rkey))],
  ]))
}

pub type DeleteSongInput {
  DeleteSongInput(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_delete_song_input(id: String) -> DeleteSongInput {
  DeleteSongInput(id: id)
}

pub fn delete_song_input_decoder() -> decode.Decoder(DeleteSongInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(DeleteSongInput(id: id))
}

pub fn encode_delete_song_input(value: DeleteSongInput) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type DeleteSongOutput {
  DeleteSongOutput(status: String, deleted: Int)
}

/// Construct with required fields; optional fields default to None.
pub fn new_delete_song_output(status: String, deleted: Int) -> DeleteSongOutput {
  DeleteSongOutput(status: status, deleted: deleted)
}

pub fn delete_song_output_decoder() -> decode.Decoder(DeleteSongOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.field("status", decode.string)
  use deleted <- decode.field("deleted", decode.int)
  decode.success(DeleteSongOutput(status: status, deleted: deleted))
}

pub fn encode_delete_song_output(value: DeleteSongOutput) -> json.Json {
  json.object(list.flatten([
    [#("status", json.string(value.status))],
    [#("deleted", json.int(value.deleted))],
  ]))
}

pub type DescribeFeedGeneratorOutput {
  DescribeFeedGeneratorOutput(did: Option(String), feeds: Option(List(FeedUriView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_describe_feed_generator_output() -> DescribeFeedGeneratorOutput {
  DescribeFeedGeneratorOutput(did: None, feeds: None)
}

pub fn describe_feed_generator_output_decoder() -> decode.Decoder(DescribeFeedGeneratorOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use feeds <- decode.optional_field("feeds", None, decode.optional(decode.list(feed_uri_view_decoder())))
  decode.success(DescribeFeedGeneratorOutput(did: did, feeds: feeds))
}

pub fn encode_describe_feed_generator_output(value: DescribeFeedGeneratorOutput) -> json.Json {
  json.object(list.flatten([
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.feeds { Some(v) -> [#("feeds", json.array(v, fn(item) { encode_feed_uri_view(item) }))] None -> [] },
  ]))
}

pub type DislikeShoutInput {
  DislikeShoutInput(uri: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_dislike_shout_input() -> DislikeShoutInput {
  DislikeShoutInput(uri: None)
}

pub fn dislike_shout_input_decoder() -> decode.Decoder(DislikeShoutInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  decode.success(DislikeShoutInput(uri: uri))
}

pub fn encode_dislike_shout_input(value: DislikeShoutInput) -> json.Json {
  json.object(list.flatten([
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
  ]))
}

pub type DislikeSongInput {
  DislikeSongInput(uri: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_dislike_song_input() -> DislikeSongInput {
  DislikeSongInput(uri: None)
}

pub fn dislike_song_input_decoder() -> decode.Decoder(DislikeSongInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  decode.success(DislikeSongInput(uri: uri))
}

pub fn encode_dislike_song_input(value: DislikeSongInput) -> json.Json {
  json.object(list.flatten([
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
  ]))
}

pub type DropboxDownloadFileParams {
  DropboxDownloadFileParams(file_id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_dropbox_download_file_params(file_id: String) -> DropboxDownloadFileParams {
  DropboxDownloadFileParams(file_id: file_id)
}

pub fn dropbox_download_file_params_decoder() -> decode.Decoder(DropboxDownloadFileParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use file_id <- decode.field("fileId", decode.string)
  decode.success(DropboxDownloadFileParams(file_id: file_id))
}

pub fn encode_dropbox_download_file_params(value: DropboxDownloadFileParams) -> json.Json {
  json.object(list.flatten([
    [#("fileId", json.string(value.file_id))],
  ]))
}

pub type DropboxFileListView {
  DropboxFileListView(files: Option(List(DropboxFileView)), directory: Option(DropboxResponseDirectoryView), parent_directory: Option(DropboxResponseParentDirectoryView), directories: Option(List(DropboxResponseDirectoriesItemView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_dropbox_file_list_view() -> DropboxFileListView {
  DropboxFileListView(files: None, directory: None, parent_directory: None, directories: None)
}

pub fn dropbox_file_list_view_decoder() -> decode.Decoder(DropboxFileListView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use files <- decode.optional_field("files", None, decode.optional(decode.list(dropbox_file_view_decoder())))
  use directory <- decode.optional_field("directory", None, decode.optional(dropbox_response_directory_view_decoder()))
  use parent_directory <- decode.optional_field("parentDirectory", None, decode.optional(dropbox_response_parent_directory_view_decoder()))
  use directories <- decode.optional_field("directories", None, decode.optional(decode.list(dropbox_response_directories_item_view_decoder())))
  decode.success(DropboxFileListView(files: files, directory: directory, parent_directory: parent_directory, directories: directories))
}

pub fn encode_dropbox_file_list_view(value: DropboxFileListView) -> json.Json {
  json.object(list.flatten([
    case value.files { Some(v) -> [#("files", json.array(v, fn(item) { encode_dropbox_file_view(item) }))] None -> [] },
    case value.directory { Some(v) -> [#("directory", encode_dropbox_response_directory_view(v))] None -> [] },
    case value.parent_directory { Some(v) -> [#("parentDirectory", encode_dropbox_response_parent_directory_view(v))] None -> [] },
    case value.directories { Some(v) -> [#("directories", json.array(v, fn(item) { encode_dropbox_response_directories_item_view(item) }))] None -> [] },
  ]))
}

pub type DropboxFileView {
  DropboxFileView(id: Option(String), name: Option(String), path_lower: Option(String), path_display: Option(String), client_modified: Option(String), server_modified: Option(String), file_id: Option(String), directory_id: Option(String), track_id: Option(String), created_at: Option(String), updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_dropbox_file_view() -> DropboxFileView {
  DropboxFileView(id: None, name: None, path_lower: None, path_display: None, client_modified: None, server_modified: None, file_id: None, directory_id: None, track_id: None, created_at: None, updated_at: None)
}

pub fn dropbox_file_view_decoder() -> decode.Decoder(DropboxFileView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use path_lower <- decode.optional_field("pathLower", None, decode.optional(decode.string))
  use path_display <- decode.optional_field("pathDisplay", None, decode.optional(decode.string))
  use client_modified <- decode.optional_field("clientModified", None, decode.optional(decode.string))
  use server_modified <- decode.optional_field("serverModified", None, decode.optional(decode.string))
  use file_id <- decode.optional_field("fileId", None, decode.optional(decode.string))
  use directory_id <- decode.optional_field("directoryId", None, decode.optional(decode.string))
  use track_id <- decode.optional_field("trackId", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(DropboxFileView(id: id, name: name, path_lower: path_lower, path_display: path_display, client_modified: client_modified, server_modified: server_modified, file_id: file_id, directory_id: directory_id, track_id: track_id, created_at: created_at, updated_at: updated_at))
}

pub fn encode_dropbox_file_view(value: DropboxFileView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.path_lower { Some(v) -> [#("pathLower", json.string(v))] None -> [] },
    case value.path_display { Some(v) -> [#("pathDisplay", json.string(v))] None -> [] },
    case value.client_modified { Some(v) -> [#("clientModified", json.string(v))] None -> [] },
    case value.server_modified { Some(v) -> [#("serverModified", json.string(v))] None -> [] },
    case value.file_id { Some(v) -> [#("fileId", json.string(v))] None -> [] },
    case value.directory_id { Some(v) -> [#("directoryId", json.string(v))] None -> [] },
    case value.track_id { Some(v) -> [#("trackId", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type DropboxGetFilesParams {
  DropboxGetFilesParams(at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_dropbox_get_files_params() -> DropboxGetFilesParams {
  DropboxGetFilesParams(at: None)
}

pub fn dropbox_get_files_params_decoder() -> decode.Decoder(DropboxGetFilesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use at <- decode.optional_field("at", None, decode.optional(decode.string))
  decode.success(DropboxGetFilesParams(at: at))
}

pub fn encode_dropbox_get_files_params(value: DropboxGetFilesParams) -> json.Json {
  json.object(list.flatten([
    case value.at { Some(v) -> [#("at", json.string(v))] None -> [] },
  ]))
}

pub type DropboxResponseDirectoriesItemView {
  DropboxResponseDirectoriesItemView(id: Option(String), name: Option(String), file_id: Option(String), path: Option(String), parent_id: Option(String), created_at: Option(String), updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_dropbox_response_directories_item_view() -> DropboxResponseDirectoriesItemView {
  DropboxResponseDirectoriesItemView(id: None, name: None, file_id: None, path: None, parent_id: None, created_at: None, updated_at: None)
}

pub fn dropbox_response_directories_item_view_decoder() -> decode.Decoder(DropboxResponseDirectoriesItemView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use file_id <- decode.optional_field("fileId", None, decode.optional(decode.string))
  use path <- decode.optional_field("path", None, decode.optional(decode.string))
  use parent_id <- decode.optional_field("parentId", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(DropboxResponseDirectoriesItemView(id: id, name: name, file_id: file_id, path: path, parent_id: parent_id, created_at: created_at, updated_at: updated_at))
}

pub fn encode_dropbox_response_directories_item_view(value: DropboxResponseDirectoriesItemView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.file_id { Some(v) -> [#("fileId", json.string(v))] None -> [] },
    case value.path { Some(v) -> [#("path", json.string(v))] None -> [] },
    case value.parent_id { Some(v) -> [#("parentId", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type DropboxResponseDirectoryView {
  DropboxResponseDirectoryView
}

/// Construct with required fields; optional fields default to None.
pub fn new_dropbox_response_directory_view() -> DropboxResponseDirectoryView {
  DropboxResponseDirectoryView
}

pub fn dropbox_response_directory_view_decoder() -> decode.Decoder(DropboxResponseDirectoryView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(DropboxResponseDirectoryView)
}

pub fn encode_dropbox_response_directory_view(_value: DropboxResponseDirectoryView) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type DropboxResponseParentDirectoryView {
  DropboxResponseParentDirectoryView
}

/// Construct with required fields; optional fields default to None.
pub fn new_dropbox_response_parent_directory_view() -> DropboxResponseParentDirectoryView {
  DropboxResponseParentDirectoryView
}

pub fn dropbox_response_parent_directory_view_decoder() -> decode.Decoder(DropboxResponseParentDirectoryView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(DropboxResponseParentDirectoryView)
}

pub fn encode_dropbox_response_parent_directory_view(_value: DropboxResponseParentDirectoryView) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type DropboxTemporaryLinkView {
  DropboxTemporaryLinkView(link: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_dropbox_temporary_link_view() -> DropboxTemporaryLinkView {
  DropboxTemporaryLinkView(link: None)
}

pub fn dropbox_temporary_link_view_decoder() -> decode.Decoder(DropboxTemporaryLinkView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use link <- decode.optional_field("link", None, decode.optional(decode.string))
  decode.success(DropboxTemporaryLinkView(link: link))
}

pub fn encode_dropbox_temporary_link_view(value: DropboxTemporaryLinkView) -> json.Json {
  json.object(list.flatten([
    case value.link { Some(v) -> [#("link", json.string(v))] None -> [] },
  ]))
}

pub type EqualizerPresetView {
  EqualizerPresetView(uri: String, rkey: String, name: String, precut: Option(Int), bands: List(RockboxEqualizerBand), created_at: String, updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_equalizer_preset_view(uri: String, rkey: String, name: String, bands: List(RockboxEqualizerBand), created_at: String) -> EqualizerPresetView {
  EqualizerPresetView(uri: uri, rkey: rkey, name: name, precut: None, bands: bands, created_at: created_at, updated_at: None)
}

pub fn equalizer_preset_view_decoder() -> decode.Decoder(EqualizerPresetView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use rkey <- decode.field("rkey", decode.string)
  use name <- decode.field("name", decode.string)
  use precut <- decode.optional_field("precut", None, decode.optional(decode.int))
  use bands <- decode.field("bands", decode.list(rockbox_equalizer_band_decoder()))
  use created_at <- decode.field("createdAt", decode.string)
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(EqualizerPresetView(uri: uri, rkey: rkey, name: name, precut: precut, bands: bands, created_at: created_at, updated_at: updated_at))
}

pub fn encode_equalizer_preset_view(value: EqualizerPresetView) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    [#("rkey", json.string(value.rkey))],
    [#("name", json.string(value.name))],
    case value.precut { Some(v) -> [#("precut", json.int(v))] None -> [] },
    [#("bands", json.array(value.bands, fn(item) { encode_rockbox_equalizer_band(item) }))],
    [#("createdAt", json.string(value.created_at))],
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type EqualizerRecord {
  EqualizerRecord(name: String, precut: Option(Int), bands: List(RockboxEqualizerBand), created_at: String, updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_equalizer_record(name: String, bands: List(RockboxEqualizerBand), created_at: String) -> EqualizerRecord {
  EqualizerRecord(name: name, precut: None, bands: bands, created_at: created_at, updated_at: None)
}

pub fn equalizer_record_decoder() -> decode.Decoder(EqualizerRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use name <- decode.field("name", decode.string)
  use precut <- decode.optional_field("precut", None, decode.optional(decode.int))
  use bands <- decode.field("bands", decode.list(rockbox_equalizer_band_decoder()))
  use created_at <- decode.field("createdAt", decode.string)
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(EqualizerRecord(name: name, precut: precut, bands: bands, created_at: created_at, updated_at: updated_at))
}

pub fn encode_equalizer_record(value: EqualizerRecord) -> json.Json {
  json.object(list.flatten([
    [#("name", json.string(value.name))],
    case value.precut { Some(v) -> [#("precut", json.int(v))] None -> [] },
    [#("bands", json.array(value.bands, fn(item) { encode_rockbox_equalizer_band(item) }))],
    [#("createdAt", json.string(value.created_at))],
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type FeedGeneratorsView {
  FeedGeneratorsView(feeds: Option(List(FeedGeneratorView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_generators_view() -> FeedGeneratorsView {
  FeedGeneratorsView(feeds: None)
}

pub fn feed_generators_view_decoder() -> decode.Decoder(FeedGeneratorsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use feeds <- decode.optional_field("feeds", None, decode.optional(decode.list(feed_generator_view_decoder())))
  decode.success(FeedGeneratorsView(feeds: feeds))
}

pub fn encode_feed_generators_view(value: FeedGeneratorsView) -> json.Json {
  json.object(list.flatten([
    case value.feeds { Some(v) -> [#("feeds", json.array(v, fn(item) { encode_feed_generator_view(item) }))] None -> [] },
  ]))
}

pub type FeedGeneratorView {
  FeedGeneratorView(id: Option(String), name: Option(String), description: Option(String), uri: Option(String), avatar: Option(String), creator: Option(ActorProfileViewBasic), did: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_generator_view() -> FeedGeneratorView {
  FeedGeneratorView(id: None, name: None, description: None, uri: None, avatar: None, creator: None, did: None)
}

pub fn feed_generator_view_decoder() -> decode.Decoder(FeedGeneratorView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use creator <- decode.optional_field("creator", None, decode.optional(actor_profile_view_basic_decoder()))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  decode.success(FeedGeneratorView(id: id, name: name, description: description, uri: uri, avatar: avatar, creator: creator, did: did))
}

pub fn encode_feed_generator_view(value: FeedGeneratorView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.creator { Some(v) -> [#("creator", encode_actor_profile_view_basic(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
  ]))
}

pub type FeedItemView {
  FeedItemView(scrobble: Option(ScrobbleViewBasic))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_item_view() -> FeedItemView {
  FeedItemView(scrobble: None)
}

pub fn feed_item_view_decoder() -> decode.Decoder(FeedItemView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use scrobble <- decode.optional_field("scrobble", None, decode.optional(scrobble_view_basic_decoder()))
  decode.success(FeedItemView(scrobble: scrobble))
}

pub fn encode_feed_item_view(value: FeedItemView) -> json.Json {
  json.object(list.flatten([
    case value.scrobble { Some(v) -> [#("scrobble", encode_scrobble_view_basic(v))] None -> [] },
  ]))
}

pub type FeedRecommendationsView {
  FeedRecommendationsView(recommendations: Option(List(FeedRecommendationView)), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_recommendations_view() -> FeedRecommendationsView {
  FeedRecommendationsView(recommendations: None, cursor: None)
}

pub fn feed_recommendations_view_decoder() -> decode.Decoder(FeedRecommendationsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use recommendations <- decode.optional_field("recommendations", None, decode.optional(decode.list(feed_recommendation_view_decoder())))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(FeedRecommendationsView(recommendations: recommendations, cursor: cursor))
}

pub fn encode_feed_recommendations_view(value: FeedRecommendationsView) -> json.Json {
  json.object(list.flatten([
    case value.recommendations { Some(v) -> [#("recommendations", json.array(v, fn(item) { encode_feed_recommendation_view(item) }))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type FeedRecommendationView {
  FeedRecommendationView(title: Option(String), artist: Option(String), album: Option(String), album_art: Option(String), track_uri: Option(String), artist_uri: Option(String), album_uri: Option(String), genres: Option(List(String)), source: Option(String), likes_count: Option(Int), recommendation_score: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_recommendation_view() -> FeedRecommendationView {
  FeedRecommendationView(title: None, artist: None, album: None, album_art: None, track_uri: None, artist_uri: None, album_uri: None, genres: None, source: None, likes_count: None, recommendation_score: None)
}

pub fn feed_recommendation_view_decoder() -> decode.Decoder(FeedRecommendationView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use track_uri <- decode.optional_field("trackUri", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use album_uri <- decode.optional_field("albumUri", None, decode.optional(decode.string))
  use genres <- decode.optional_field("genres", None, decode.optional(decode.list(decode.string)))
  use source <- decode.optional_field("source", None, decode.optional(decode.string))
  use likes_count <- decode.optional_field("likesCount", None, decode.optional(decode.int))
  use recommendation_score <- decode.optional_field("recommendationScore", None, decode.optional(float_decoder()))
  decode.success(FeedRecommendationView(title: title, artist: artist, album: album, album_art: album_art, track_uri: track_uri, artist_uri: artist_uri, album_uri: album_uri, genres: genres, source: source, likes_count: likes_count, recommendation_score: recommendation_score))
}

pub fn encode_feed_recommendation_view(value: FeedRecommendationView) -> json.Json {
  json.object(list.flatten([
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.track_uri { Some(v) -> [#("trackUri", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.album_uri { Some(v) -> [#("albumUri", json.string(v))] None -> [] },
    case value.genres { Some(v) -> [#("genres", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.source { Some(v) -> [#("source", json.string(v))] None -> [] },
    case value.likes_count { Some(v) -> [#("likesCount", json.int(v))] None -> [] },
    case value.recommendation_score { Some(v) -> [#("recommendationScore", json.float(v))] None -> [] },
  ]))
}

pub type FeedRecommendedAlbumsView {
  FeedRecommendedAlbumsView(albums: Option(List(FeedRecommendedAlbumView)), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_recommended_albums_view() -> FeedRecommendedAlbumsView {
  FeedRecommendedAlbumsView(albums: None, cursor: None)
}

pub fn feed_recommended_albums_view_decoder() -> decode.Decoder(FeedRecommendedAlbumsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use albums <- decode.optional_field("albums", None, decode.optional(decode.list(feed_recommended_album_view_decoder())))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(FeedRecommendedAlbumsView(albums: albums, cursor: cursor))
}

pub fn encode_feed_recommended_albums_view(value: FeedRecommendedAlbumsView) -> json.Json {
  json.object(list.flatten([
    case value.albums { Some(v) -> [#("albums", json.array(v, fn(item) { encode_feed_recommended_album_view(item) }))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type FeedRecommendedAlbumView {
  FeedRecommendedAlbumView(id: Option(String), uri: Option(String), title: Option(String), artist: Option(String), artist_uri: Option(String), year: Option(Int), album_art: Option(String), source: Option(String), recommendation_score: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_recommended_album_view() -> FeedRecommendedAlbumView {
  FeedRecommendedAlbumView(id: None, uri: None, title: None, artist: None, artist_uri: None, year: None, album_art: None, source: None, recommendation_score: None)
}

pub fn feed_recommended_album_view_decoder() -> decode.Decoder(FeedRecommendedAlbumView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use source <- decode.optional_field("source", None, decode.optional(decode.string))
  use recommendation_score <- decode.optional_field("recommendationScore", None, decode.optional(float_decoder()))
  decode.success(FeedRecommendedAlbumView(id: id, uri: uri, title: title, artist: artist, artist_uri: artist_uri, year: year, album_art: album_art, source: source, recommendation_score: recommendation_score))
}

pub fn encode_feed_recommended_album_view(value: FeedRecommendedAlbumView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.source { Some(v) -> [#("source", json.string(v))] None -> [] },
    case value.recommendation_score { Some(v) -> [#("recommendationScore", json.float(v))] None -> [] },
  ]))
}

pub type FeedRecommendedArtistsView {
  FeedRecommendedArtistsView(artists: Option(List(FeedRecommendedArtistView)), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_recommended_artists_view() -> FeedRecommendedArtistsView {
  FeedRecommendedArtistsView(artists: None, cursor: None)
}

pub fn feed_recommended_artists_view_decoder() -> decode.Decoder(FeedRecommendedArtistsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use artists <- decode.optional_field("artists", None, decode.optional(decode.list(feed_recommended_artist_view_decoder())))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(FeedRecommendedArtistsView(artists: artists, cursor: cursor))
}

pub fn encode_feed_recommended_artists_view(value: FeedRecommendedArtistsView) -> json.Json {
  json.object(list.flatten([
    case value.artists { Some(v) -> [#("artists", json.array(v, fn(item) { encode_feed_recommended_artist_view(item) }))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type FeedRecommendedArtistView {
  FeedRecommendedArtistView(id: Option(String), uri: Option(String), name: Option(String), picture: Option(String), genres: Option(List(String)), source: Option(String), recommendation_score: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_recommended_artist_view() -> FeedRecommendedArtistView {
  FeedRecommendedArtistView(id: None, uri: None, name: None, picture: None, genres: None, source: None, recommendation_score: None)
}

pub fn feed_recommended_artist_view_decoder() -> decode.Decoder(FeedRecommendedArtistView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use picture <- decode.optional_field("picture", None, decode.optional(decode.string))
  use genres <- decode.optional_field("genres", None, decode.optional(decode.list(decode.string)))
  use source <- decode.optional_field("source", None, decode.optional(decode.string))
  use recommendation_score <- decode.optional_field("recommendationScore", None, decode.optional(float_decoder()))
  decode.success(FeedRecommendedArtistView(id: id, uri: uri, name: name, picture: picture, genres: genres, source: source, recommendation_score: recommendation_score))
}

pub fn encode_feed_recommended_artist_view(value: FeedRecommendedArtistView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.picture { Some(v) -> [#("picture", json.string(v))] None -> [] },
    case value.genres { Some(v) -> [#("genres", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.source { Some(v) -> [#("source", json.string(v))] None -> [] },
    case value.recommendation_score { Some(v) -> [#("recommendationScore", json.float(v))] None -> [] },
  ]))
}

pub type FeedSearchFederation {
  FeedSearchFederation(index_uid: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_search_federation() -> FeedSearchFederation {
  FeedSearchFederation(index_uid: None)
}

pub fn feed_search_federation_decoder() -> decode.Decoder(FeedSearchFederation) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use index_uid <- decode.optional_field("indexUid", None, decode.optional(decode.string))
  decode.success(FeedSearchFederation(index_uid: index_uid))
}

pub fn encode_feed_search_federation(value: FeedSearchFederation) -> json.Json {
  json.object(list.flatten([
    case value.index_uid { Some(v) -> [#("indexUid", json.string(v))] None -> [] },
  ]))
}

pub type FeedSearchHit {
  FeedSearchHit(id: Option(String), title: Option(String), artist: Option(String), album_artist: Option(String), album_art: Option(String), uri: Option(String), album: Option(String), duration: Option(Int), track_number: Option(Int), disc_number: Option(Int), play_count: Option(Int), likes_count: Option(Int), liked: Option(Bool), unique_listeners: Option(Int), album_uri: Option(String), artist_uri: Option(String), sha256: Option(String), mbid: Option(String), isrc: Option(String), tags: Option(List(String)), created_at: Option(String), updated_at: Option(String), mb_id: Option(String), youtube_link: Option(String), spotify_link: Option(String), apple_music_link: Option(String), tidal_link: Option(String), lyrics: Option(String), composer: Option(String), genre: Option(String), label: Option(String), copyright_message: Option(String), key: Option(String), acoustid_fingerprint: Option(String), xata_version: Option(Int), year: Option(Int), release_date: Option(String), discogs_release_id: Option(String), name: Option(String), picture: Option(String), biography: Option(String), born: Option(String), born_in: Option(String), died: Option(String), genres: Option(List(String)), curator_did: Option(String), curator_handle: Option(String), curator_name: Option(String), curator_avatar_url: Option(String), description: Option(String), cover_image_url: Option(String), track_count: Option(Int), track_arts: Option(List(String)), curator_d_id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String), federation: Option(FeedSearchFederation), bpm: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_search_hit() -> FeedSearchHit {
  FeedSearchHit(id: None, title: None, artist: None, album_artist: None, album_art: None, uri: None, album: None, duration: None, track_number: None, disc_number: None, play_count: None, likes_count: None, liked: None, unique_listeners: None, album_uri: None, artist_uri: None, sha256: None, mbid: None, isrc: None, tags: None, created_at: None, updated_at: None, mb_id: None, youtube_link: None, spotify_link: None, apple_music_link: None, tidal_link: None, lyrics: None, composer: None, genre: None, label: None, copyright_message: None, key: None, acoustid_fingerprint: None, xata_version: None, year: None, release_date: None, discogs_release_id: None, name: None, picture: None, biography: None, born: None, born_in: None, died: None, genres: None, curator_did: None, curator_handle: None, curator_name: None, curator_avatar_url: None, description: None, cover_image_url: None, track_count: None, track_arts: None, curator_d_id: None, did: None, handle: None, display_name: None, avatar: None, federation: None, bpm: None)
}

pub fn feed_search_hit_decoder() -> decode.Decoder(FeedSearchHit) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album_artist <- decode.optional_field("albumArtist", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use duration <- decode.optional_field("duration", None, decode.optional(decode.int))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  use likes_count <- decode.optional_field("likesCount", None, decode.optional(decode.int))
  use liked <- decode.optional_field("liked", None, decode.optional(decode.bool))
  use unique_listeners <- decode.optional_field("uniqueListeners", None, decode.optional(decode.int))
  use album_uri <- decode.optional_field("albumUri", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use sha256 <- decode.optional_field("sha256", None, decode.optional(decode.string))
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use mb_id <- decode.optional_field("mbId", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use lyrics <- decode.optional_field("lyrics", None, decode.optional(decode.string))
  use composer <- decode.optional_field("composer", None, decode.optional(decode.string))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use label <- decode.optional_field("label", None, decode.optional(decode.string))
  use copyright_message <- decode.optional_field("copyrightMessage", None, decode.optional(decode.string))
  use key <- decode.optional_field("key", None, decode.optional(decode.string))
  use acoustid_fingerprint <- decode.optional_field("acoustidFingerprint", None, decode.optional(decode.string))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use discogs_release_id <- decode.optional_field("discogsReleaseId", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use picture <- decode.optional_field("picture", None, decode.optional(decode.string))
  use biography <- decode.optional_field("biography", None, decode.optional(decode.string))
  use born <- decode.optional_field("born", None, decode.optional(decode.string))
  use born_in <- decode.optional_field("bornIn", None, decode.optional(decode.string))
  use died <- decode.optional_field("died", None, decode.optional(decode.string))
  use genres <- decode.optional_field("genres", None, decode.optional(decode.list(decode.string)))
  use curator_did <- decode.optional_field("curatorDid", None, decode.optional(decode.string))
  use curator_handle <- decode.optional_field("curatorHandle", None, decode.optional(decode.string))
  use curator_name <- decode.optional_field("curatorName", None, decode.optional(decode.string))
  use curator_avatar_url <- decode.optional_field("curatorAvatarUrl", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use cover_image_url <- decode.optional_field("coverImageUrl", None, decode.optional(decode.string))
  use track_count <- decode.optional_field("trackCount", None, decode.optional(decode.int))
  use track_arts <- decode.optional_field("trackArts", None, decode.optional(decode.list(decode.string)))
  use curator_d_id <- decode.optional_field("curatorDId", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use federation <- decode.optional_field("_federation", None, decode.optional(feed_search_federation_decoder()))
  use bpm <- decode.optional_field("bpm", None, decode.optional(float_decoder()))
  decode.success(FeedSearchHit(id: id, title: title, artist: artist, album_artist: album_artist, album_art: album_art, uri: uri, album: album, duration: duration, track_number: track_number, disc_number: disc_number, play_count: play_count, likes_count: likes_count, liked: liked, unique_listeners: unique_listeners, album_uri: album_uri, artist_uri: artist_uri, sha256: sha256, mbid: mbid, isrc: isrc, tags: tags, created_at: created_at, updated_at: updated_at, mb_id: mb_id, youtube_link: youtube_link, spotify_link: spotify_link, apple_music_link: apple_music_link, tidal_link: tidal_link, lyrics: lyrics, composer: composer, genre: genre, label: label, copyright_message: copyright_message, key: key, acoustid_fingerprint: acoustid_fingerprint, xata_version: xata_version, year: year, release_date: release_date, discogs_release_id: discogs_release_id, name: name, picture: picture, biography: biography, born: born, born_in: born_in, died: died, genres: genres, curator_did: curator_did, curator_handle: curator_handle, curator_name: curator_name, curator_avatar_url: curator_avatar_url, description: description, cover_image_url: cover_image_url, track_count: track_count, track_arts: track_arts, curator_d_id: curator_d_id, did: did, handle: handle, display_name: display_name, avatar: avatar, federation: federation, bpm: bpm))
}

pub fn encode_feed_search_hit(value: FeedSearchHit) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album_artist { Some(v) -> [#("albumArtist", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.duration { Some(v) -> [#("duration", json.int(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
    case value.likes_count { Some(v) -> [#("likesCount", json.int(v))] None -> [] },
    case value.liked { Some(v) -> [#("liked", json.bool(v))] None -> [] },
    case value.unique_listeners { Some(v) -> [#("uniqueListeners", json.int(v))] None -> [] },
    case value.album_uri { Some(v) -> [#("albumUri", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.sha256 { Some(v) -> [#("sha256", json.string(v))] None -> [] },
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.mb_id { Some(v) -> [#("mbId", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.lyrics { Some(v) -> [#("lyrics", json.string(v))] None -> [] },
    case value.composer { Some(v) -> [#("composer", json.string(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.label { Some(v) -> [#("label", json.string(v))] None -> [] },
    case value.copyright_message { Some(v) -> [#("copyrightMessage", json.string(v))] None -> [] },
    case value.key { Some(v) -> [#("key", json.string(v))] None -> [] },
    case value.acoustid_fingerprint { Some(v) -> [#("acoustidFingerprint", json.string(v))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.discogs_release_id { Some(v) -> [#("discogsReleaseId", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.picture { Some(v) -> [#("picture", json.string(v))] None -> [] },
    case value.biography { Some(v) -> [#("biography", json.string(v))] None -> [] },
    case value.born { Some(v) -> [#("born", json.string(v))] None -> [] },
    case value.born_in { Some(v) -> [#("bornIn", json.string(v))] None -> [] },
    case value.died { Some(v) -> [#("died", json.string(v))] None -> [] },
    case value.genres { Some(v) -> [#("genres", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.curator_did { Some(v) -> [#("curatorDid", json.string(v))] None -> [] },
    case value.curator_handle { Some(v) -> [#("curatorHandle", json.string(v))] None -> [] },
    case value.curator_name { Some(v) -> [#("curatorName", json.string(v))] None -> [] },
    case value.curator_avatar_url { Some(v) -> [#("curatorAvatarUrl", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.cover_image_url { Some(v) -> [#("coverImageUrl", json.string(v))] None -> [] },
    case value.track_count { Some(v) -> [#("trackCount", json.int(v))] None -> [] },
    case value.track_arts { Some(v) -> [#("trackArts", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.curator_d_id { Some(v) -> [#("curatorDId", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.federation { Some(v) -> [#("_federation", encode_feed_search_federation(v))] None -> [] },
    case value.bpm { Some(v) -> [#("bpm", json.float(v))] None -> [] },
  ]))
}

pub type FeedSearchParams {
  FeedSearchParams(query: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_search_params(query: String) -> FeedSearchParams {
  FeedSearchParams(query: query)
}

pub fn feed_search_params_decoder() -> decode.Decoder(FeedSearchParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use query <- decode.field("query", decode.string)
  decode.success(FeedSearchParams(query: query))
}

pub fn encode_feed_search_params(value: FeedSearchParams) -> json.Json {
  json.object(list.flatten([
    [#("query", json.string(value.query))],
  ]))
}

pub type FeedSearchResultsView {
  FeedSearchResultsView(hits: Option(List(FeedSearchHit)), processing_time_ms: Option(Int), limit: Option(Int), offset: Option(Int), estimated_total_hits: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_search_results_view() -> FeedSearchResultsView {
  FeedSearchResultsView(hits: None, processing_time_ms: None, limit: None, offset: None, estimated_total_hits: None)
}

pub fn feed_search_results_view_decoder() -> decode.Decoder(FeedSearchResultsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use hits <- decode.optional_field("hits", None, decode.optional(decode.list(feed_search_hit_decoder())))
  use processing_time_ms <- decode.optional_field("processingTimeMs", None, decode.optional(decode.int))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use estimated_total_hits <- decode.optional_field("estimatedTotalHits", None, decode.optional(decode.int))
  decode.success(FeedSearchResultsView(hits: hits, processing_time_ms: processing_time_ms, limit: limit, offset: offset, estimated_total_hits: estimated_total_hits))
}

pub fn encode_feed_search_results_view(value: FeedSearchResultsView) -> json.Json {
  json.object(list.flatten([
    case value.hits { Some(v) -> [#("hits", json.array(v, fn(item) { encode_feed_search_hit(item) }))] None -> [] },
    case value.processing_time_ms { Some(v) -> [#("processingTimeMs", json.int(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.estimated_total_hits { Some(v) -> [#("estimatedTotalHits", json.int(v))] None -> [] },
  ]))
}

pub type FeedStoriesView {
  FeedStoriesView(stories: Option(List(FeedStoryView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_stories_view() -> FeedStoriesView {
  FeedStoriesView(stories: None)
}

pub fn feed_stories_view_decoder() -> decode.Decoder(FeedStoriesView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use stories <- decode.optional_field("stories", None, decode.optional(decode.list(feed_story_view_decoder())))
  decode.success(FeedStoriesView(stories: stories))
}

pub fn encode_feed_stories_view(value: FeedStoriesView) -> json.Json {
  json.object(list.flatten([
    case value.stories { Some(v) -> [#("stories", json.array(v, fn(item) { encode_feed_story_view(item) }))] None -> [] },
  ]))
}

pub type FeedStoryView {
  FeedStoryView(album: Option(String), album_art: Option(String), album_artist: Option(String), album_uri: Option(String), artist: Option(String), artist_uri: Option(String), avatar: Option(String), created_at: Option(String), did: Option(String), handle: Option(String), id: Option(String), title: Option(String), track_id: Option(String), track_uri: Option(String), uri: Option(String), liked: Option(Bool), likes_count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_story_view() -> FeedStoryView {
  FeedStoryView(album: None, album_art: None, album_artist: None, album_uri: None, artist: None, artist_uri: None, avatar: None, created_at: None, did: None, handle: None, id: None, title: None, track_id: None, track_uri: None, uri: None, liked: None, likes_count: None)
}

pub fn feed_story_view_decoder() -> decode.Decoder(FeedStoryView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use album_artist <- decode.optional_field("albumArtist", None, decode.optional(decode.string))
  use album_uri <- decode.optional_field("albumUri", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use track_id <- decode.optional_field("trackId", None, decode.optional(decode.string))
  use track_uri <- decode.optional_field("trackUri", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use liked <- decode.optional_field("liked", None, decode.optional(decode.bool))
  use likes_count <- decode.optional_field("likesCount", None, decode.optional(decode.int))
  decode.success(FeedStoryView(album: album, album_art: album_art, album_artist: album_artist, album_uri: album_uri, artist: artist, artist_uri: artist_uri, avatar: avatar, created_at: created_at, did: did, handle: handle, id: id, title: title, track_id: track_id, track_uri: track_uri, uri: uri, liked: liked, likes_count: likes_count))
}

pub fn encode_feed_story_view(value: FeedStoryView) -> json.Json {
  json.object(list.flatten([
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.album_artist { Some(v) -> [#("albumArtist", json.string(v))] None -> [] },
    case value.album_uri { Some(v) -> [#("albumUri", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.track_id { Some(v) -> [#("trackId", json.string(v))] None -> [] },
    case value.track_uri { Some(v) -> [#("trackUri", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.liked { Some(v) -> [#("liked", json.bool(v))] None -> [] },
    case value.likes_count { Some(v) -> [#("likesCount", json.int(v))] None -> [] },
  ]))
}

pub type FeedUriView {
  FeedUriView(uri: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_uri_view() -> FeedUriView {
  FeedUriView(uri: None)
}

pub fn feed_uri_view_decoder() -> decode.Decoder(FeedUriView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  decode.success(FeedUriView(uri: uri))
}

pub fn encode_feed_uri_view(value: FeedUriView) -> json.Json {
  json.object(list.flatten([
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
  ]))
}

pub type FeedView {
  FeedView(feed: Option(List(FeedItemView)), cursor: Option(String), scrobbles: Option(List(ScrobbleViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_feed_view() -> FeedView {
  FeedView(feed: None, cursor: None, scrobbles: None)
}

pub fn feed_view_decoder() -> decode.Decoder(FeedView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use feed <- decode.optional_field("feed", None, decode.optional(decode.list(feed_item_view_decoder())))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.list(scrobble_view_basic_decoder())))
  decode.success(FeedView(feed: feed, cursor: cursor, scrobbles: scrobbles))
}

pub fn encode_feed_view(value: FeedView) -> json.Json {
  json.object(list.flatten([
    case value.feed { Some(v) -> [#("feed", json.array(v, fn(item) { encode_feed_item_view(item) }))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
    case value.scrobbles { Some(v) -> [#("scrobbles", json.array(v, fn(item) { encode_scrobble_view_basic(item) }))] None -> [] },
  ]))
}

pub type FollowAccountOutput {
  FollowAccountOutput(subject: ActorProfileViewBasic, followers: List(ActorProfileViewBasic), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_follow_account_output(subject: ActorProfileViewBasic, followers: List(ActorProfileViewBasic)) -> FollowAccountOutput {
  FollowAccountOutput(subject: subject, followers: followers, cursor: None)
}

pub fn follow_account_output_decoder() -> decode.Decoder(FollowAccountOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use subject <- decode.field("subject", actor_profile_view_basic_decoder())
  use followers <- decode.field("followers", decode.list(actor_profile_view_basic_decoder()))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(FollowAccountOutput(subject: subject, followers: followers, cursor: cursor))
}

pub fn encode_follow_account_output(value: FollowAccountOutput) -> json.Json {
  json.object(list.flatten([
    [#("subject", encode_actor_profile_view_basic(value.subject))],
    [#("followers", json.array(value.followers, fn(item) { encode_actor_profile_view_basic(item) }))],
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type FollowAccountParams {
  FollowAccountParams(account: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_follow_account_params(account: String) -> FollowAccountParams {
  FollowAccountParams(account: account)
}

pub fn follow_account_params_decoder() -> decode.Decoder(FollowAccountParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use account <- decode.field("account", decode.string)
  decode.success(FollowAccountParams(account: account))
}

pub fn encode_follow_account_params(value: FollowAccountParams) -> json.Json {
  json.object(list.flatten([
    [#("account", json.string(value.account))],
  ]))
}

pub type FollowRecord {
  FollowRecord(created_at: String, subject: String, via: Option(StrongRef))
}

/// Construct with required fields; optional fields default to None.
pub fn new_follow_record(created_at: String, subject: String) -> FollowRecord {
  FollowRecord(created_at: created_at, subject: subject, via: None)
}

pub fn follow_record_decoder() -> decode.Decoder(FollowRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use created_at <- decode.field("createdAt", decode.string)
  use subject <- decode.field("subject", decode.string)
  use via <- decode.optional_field("via", None, decode.optional(strong_ref_decoder()))
  decode.success(FollowRecord(created_at: created_at, subject: subject, via: via))
}

pub fn encode_follow_record(value: FollowRecord) -> json.Json {
  json.object(list.flatten([
    [#("createdAt", json.string(value.created_at))],
    [#("subject", json.string(value.subject))],
    case value.via { Some(v) -> [#("via", encode_strong_ref(v))] None -> [] },
  ]))
}

pub type GeneratorRecord {
  GeneratorRecord(did: String, avatar: Option(BlobRef), display_name: String, description: Option(String), created_at: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_generator_record(did: String, display_name: String, created_at: String) -> GeneratorRecord {
  GeneratorRecord(did: did, avatar: None, display_name: display_name, description: None, created_at: created_at)
}

pub fn generator_record_decoder() -> decode.Decoder(GeneratorRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use avatar <- decode.optional_field("avatar", None, decode.optional(blob_ref_decoder()))
  use display_name <- decode.field("displayName", decode.string)
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use created_at <- decode.field("createdAt", decode.string)
  decode.success(GeneratorRecord(did: did, avatar: avatar, display_name: display_name, description: description, created_at: created_at))
}

pub fn encode_generator_record(value: GeneratorRecord) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.avatar { Some(v) -> [#("avatar", encode_blob_ref(v))] None -> [] },
    [#("displayName", json.string(value.display_name))],
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
  ]))
}

pub type GetActorAlbumsOutput {
  GetActorAlbumsOutput(albums: Option(List(AlbumViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_albums_output() -> GetActorAlbumsOutput {
  GetActorAlbumsOutput(albums: None)
}

pub fn get_actor_albums_output_decoder() -> decode.Decoder(GetActorAlbumsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use albums <- decode.optional_field("albums", None, decode.optional(decode.list(album_view_basic_decoder())))
  decode.success(GetActorAlbumsOutput(albums: albums))
}

pub fn encode_get_actor_albums_output(value: GetActorAlbumsOutput) -> json.Json {
  json.object(list.flatten([
    case value.albums { Some(v) -> [#("albums", json.array(v, fn(item) { encode_album_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetActorAlbumsParams {
  GetActorAlbumsParams(did: String, limit: Option(Int), offset: Option(Int), start_date: Option(String), end_date: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_albums_params(did: String) -> GetActorAlbumsParams {
  GetActorAlbumsParams(did: did, limit: None, offset: None, start_date: None, end_date: None)
}

pub fn get_actor_albums_params_decoder() -> decode.Decoder(GetActorAlbumsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use start_date <- decode.optional_field("startDate", None, decode.optional(decode.string))
  use end_date <- decode.optional_field("endDate", None, decode.optional(decode.string))
  decode.success(GetActorAlbumsParams(did: did, limit: limit, offset: offset, start_date: start_date, end_date: end_date))
}

pub fn encode_get_actor_albums_params(value: GetActorAlbumsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.start_date { Some(v) -> [#("startDate", json.string(v))] None -> [] },
    case value.end_date { Some(v) -> [#("endDate", json.string(v))] None -> [] },
  ]))
}

pub type GetActorArtistsOutput {
  GetActorArtistsOutput(artists: Option(List(ArtistViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_artists_output() -> GetActorArtistsOutput {
  GetActorArtistsOutput(artists: None)
}

pub fn get_actor_artists_output_decoder() -> decode.Decoder(GetActorArtistsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use artists <- decode.optional_field("artists", None, decode.optional(decode.list(artist_view_basic_decoder())))
  decode.success(GetActorArtistsOutput(artists: artists))
}

pub fn encode_get_actor_artists_output(value: GetActorArtistsOutput) -> json.Json {
  json.object(list.flatten([
    case value.artists { Some(v) -> [#("artists", json.array(v, fn(item) { encode_artist_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetActorArtistsParams {
  GetActorArtistsParams(did: String, limit: Option(Int), offset: Option(Int), start_date: Option(String), end_date: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_artists_params(did: String) -> GetActorArtistsParams {
  GetActorArtistsParams(did: did, limit: None, offset: None, start_date: None, end_date: None)
}

pub fn get_actor_artists_params_decoder() -> decode.Decoder(GetActorArtistsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use start_date <- decode.optional_field("startDate", None, decode.optional(decode.string))
  use end_date <- decode.optional_field("endDate", None, decode.optional(decode.string))
  decode.success(GetActorArtistsParams(did: did, limit: limit, offset: offset, start_date: start_date, end_date: end_date))
}

pub fn encode_get_actor_artists_params(value: GetActorArtistsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.start_date { Some(v) -> [#("startDate", json.string(v))] None -> [] },
    case value.end_date { Some(v) -> [#("endDate", json.string(v))] None -> [] },
  ]))
}

pub type GetActorCompatibilityOutput {
  GetActorCompatibilityOutput(compatibility: Option(ActorCompatibilityViewBasic))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_compatibility_output() -> GetActorCompatibilityOutput {
  GetActorCompatibilityOutput(compatibility: None)
}

pub fn get_actor_compatibility_output_decoder() -> decode.Decoder(GetActorCompatibilityOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use compatibility <- decode.optional_field("compatibility", None, decode.optional(actor_compatibility_view_basic_decoder()))
  decode.success(GetActorCompatibilityOutput(compatibility: compatibility))
}

pub fn encode_get_actor_compatibility_output(value: GetActorCompatibilityOutput) -> json.Json {
  json.object(list.flatten([
    case value.compatibility { Some(v) -> [#("compatibility", encode_actor_compatibility_view_basic(v))] None -> [] },
  ]))
}

pub type GetActorCompatibilityParams {
  GetActorCompatibilityParams(did: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_compatibility_params(did: String) -> GetActorCompatibilityParams {
  GetActorCompatibilityParams(did: did)
}

pub fn get_actor_compatibility_params_decoder() -> decode.Decoder(GetActorCompatibilityParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  decode.success(GetActorCompatibilityParams(did: did))
}

pub fn encode_get_actor_compatibility_params(value: GetActorCompatibilityParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
  ]))
}

pub type GetActorLovedSongsOutput {
  GetActorLovedSongsOutput(tracks: Option(List(SongViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_loved_songs_output() -> GetActorLovedSongsOutput {
  GetActorLovedSongsOutput(tracks: None)
}

pub fn get_actor_loved_songs_output_decoder() -> decode.Decoder(GetActorLovedSongsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.list(song_view_basic_decoder())))
  decode.success(GetActorLovedSongsOutput(tracks: tracks))
}

pub fn encode_get_actor_loved_songs_output(value: GetActorLovedSongsOutput) -> json.Json {
  json.object(list.flatten([
    case value.tracks { Some(v) -> [#("tracks", json.array(v, fn(item) { encode_song_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetActorLovedSongsParams {
  GetActorLovedSongsParams(did: String, limit: Option(Int), offset: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_loved_songs_params(did: String) -> GetActorLovedSongsParams {
  GetActorLovedSongsParams(did: did, limit: None, offset: None)
}

pub fn get_actor_loved_songs_params_decoder() -> decode.Decoder(GetActorLovedSongsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  decode.success(GetActorLovedSongsParams(did: did, limit: limit, offset: offset))
}

pub fn encode_get_actor_loved_songs_params(value: GetActorLovedSongsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
  ]))
}

pub type GetActorNeighboursOutput {
  GetActorNeighboursOutput(neighbours: Option(List(ActorNeighbourViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_neighbours_output() -> GetActorNeighboursOutput {
  GetActorNeighboursOutput(neighbours: None)
}

pub fn get_actor_neighbours_output_decoder() -> decode.Decoder(GetActorNeighboursOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use neighbours <- decode.optional_field("neighbours", None, decode.optional(decode.list(actor_neighbour_view_basic_decoder())))
  decode.success(GetActorNeighboursOutput(neighbours: neighbours))
}

pub fn encode_get_actor_neighbours_output(value: GetActorNeighboursOutput) -> json.Json {
  json.object(list.flatten([
    case value.neighbours { Some(v) -> [#("neighbours", json.array(v, fn(item) { encode_actor_neighbour_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetActorNeighboursParams {
  GetActorNeighboursParams(did: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_neighbours_params(did: String) -> GetActorNeighboursParams {
  GetActorNeighboursParams(did: did)
}

pub fn get_actor_neighbours_params_decoder() -> decode.Decoder(GetActorNeighboursParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  decode.success(GetActorNeighboursParams(did: did))
}

pub fn encode_get_actor_neighbours_params(value: GetActorNeighboursParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
  ]))
}

pub type GetActorPlaylistsOutput {
  GetActorPlaylistsOutput(playlists: Option(List(PlaylistViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_playlists_output() -> GetActorPlaylistsOutput {
  GetActorPlaylistsOutput(playlists: None)
}

pub fn get_actor_playlists_output_decoder() -> decode.Decoder(GetActorPlaylistsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use playlists <- decode.optional_field("playlists", None, decode.optional(decode.list(playlist_view_basic_decoder())))
  decode.success(GetActorPlaylistsOutput(playlists: playlists))
}

pub fn encode_get_actor_playlists_output(value: GetActorPlaylistsOutput) -> json.Json {
  json.object(list.flatten([
    case value.playlists { Some(v) -> [#("playlists", json.array(v, fn(item) { encode_playlist_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetActorPlaylistsParams {
  GetActorPlaylistsParams(did: String, limit: Option(Int), offset: Option(Int), filter: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_playlists_params(did: String) -> GetActorPlaylistsParams {
  GetActorPlaylistsParams(did: did, limit: None, offset: None, filter: None)
}

pub fn get_actor_playlists_params_decoder() -> decode.Decoder(GetActorPlaylistsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use filter <- decode.optional_field("filter", None, decode.optional(decode.string))
  decode.success(GetActorPlaylistsParams(did: did, limit: limit, offset: offset, filter: filter))
}

pub fn encode_get_actor_playlists_params(value: GetActorPlaylistsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.filter { Some(v) -> [#("filter", json.string(v))] None -> [] },
  ]))
}

pub type GetActorScrobblesOutput {
  GetActorScrobblesOutput(scrobbles: Option(List(ScrobbleViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_scrobbles_output() -> GetActorScrobblesOutput {
  GetActorScrobblesOutput(scrobbles: None)
}

pub fn get_actor_scrobbles_output_decoder() -> decode.Decoder(GetActorScrobblesOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.list(scrobble_view_basic_decoder())))
  decode.success(GetActorScrobblesOutput(scrobbles: scrobbles))
}

pub fn encode_get_actor_scrobbles_output(value: GetActorScrobblesOutput) -> json.Json {
  json.object(list.flatten([
    case value.scrobbles { Some(v) -> [#("scrobbles", json.array(v, fn(item) { encode_scrobble_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetActorScrobblesParams {
  GetActorScrobblesParams(did: String, limit: Option(Int), offset: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_scrobbles_params(did: String) -> GetActorScrobblesParams {
  GetActorScrobblesParams(did: did, limit: None, offset: None)
}

pub fn get_actor_scrobbles_params_decoder() -> decode.Decoder(GetActorScrobblesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  decode.success(GetActorScrobblesParams(did: did, limit: limit, offset: offset))
}

pub fn encode_get_actor_scrobbles_params(value: GetActorScrobblesParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
  ]))
}

pub type GetActorSongsOutput {
  GetActorSongsOutput(tracks: Option(List(SongViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_songs_output() -> GetActorSongsOutput {
  GetActorSongsOutput(tracks: None)
}

pub fn get_actor_songs_output_decoder() -> decode.Decoder(GetActorSongsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.list(song_view_basic_decoder())))
  decode.success(GetActorSongsOutput(tracks: tracks))
}

pub fn encode_get_actor_songs_output(value: GetActorSongsOutput) -> json.Json {
  json.object(list.flatten([
    case value.tracks { Some(v) -> [#("tracks", json.array(v, fn(item) { encode_song_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetActorSongsParams {
  GetActorSongsParams(did: String, limit: Option(Int), offset: Option(Int), start_date: Option(String), end_date: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_actor_songs_params(did: String) -> GetActorSongsParams {
  GetActorSongsParams(did: did, limit: None, offset: None, start_date: None, end_date: None)
}

pub fn get_actor_songs_params_decoder() -> decode.Decoder(GetActorSongsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use start_date <- decode.optional_field("startDate", None, decode.optional(decode.string))
  use end_date <- decode.optional_field("endDate", None, decode.optional(decode.string))
  decode.success(GetActorSongsParams(did: did, limit: limit, offset: offset, start_date: start_date, end_date: end_date))
}

pub fn encode_get_actor_songs_params(value: GetActorSongsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.start_date { Some(v) -> [#("startDate", json.string(v))] None -> [] },
    case value.end_date { Some(v) -> [#("endDate", json.string(v))] None -> [] },
  ]))
}

pub type GetAlbumInfoOutput {
  GetAlbumInfoOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), album_info: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_album_info_output() -> GetAlbumInfoOutput {
  GetAlbumInfoOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, album_info: None)
}

pub fn get_album_info_output_decoder() -> decode.Decoder(GetAlbumInfoOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use album_info <- decode.optional_field("albumInfo", None, decode.optional(json_value.decoder()))
  decode.success(GetAlbumInfoOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, album_info: album_info))
}

pub fn encode_get_album_info_output(value: GetAlbumInfoOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.album_info { Some(v) -> [#("albumInfo", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetAlbumInfoParams {
  GetAlbumInfoParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_album_info_params(id: String) -> GetAlbumInfoParams {
  GetAlbumInfoParams(id: id)
}

pub fn get_album_info_params_decoder() -> decode.Decoder(GetAlbumInfoParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(GetAlbumInfoParams(id: id))
}

pub fn encode_get_album_info_params(value: GetAlbumInfoParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type GetAlbumListOutput {
  GetAlbumListOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), album_list2: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_album_list_output() -> GetAlbumListOutput {
  GetAlbumListOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, album_list2: None)
}

pub fn get_album_list_output_decoder() -> decode.Decoder(GetAlbumListOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use album_list2 <- decode.optional_field("albumList2", None, decode.optional(json_value.decoder()))
  decode.success(GetAlbumListOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, album_list2: album_list2))
}

pub fn encode_get_album_list_output(value: GetAlbumListOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.album_list2 { Some(v) -> [#("albumList2", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetAlbumListParams {
  GetAlbumListParams(type_: String, size: Option(Int), offset: Option(Int), from_year: Option(Int), to_year: Option(Int), genre: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_album_list_params(type_: String) -> GetAlbumListParams {
  GetAlbumListParams(type_: type_, size: None, offset: None, from_year: None, to_year: None, genre: None)
}

pub fn get_album_list_params_decoder() -> decode.Decoder(GetAlbumListParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use type_ <- decode.field("type", decode.string)
  use size <- decode.optional_field("size", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use from_year <- decode.optional_field("fromYear", None, decode.optional(decode.int))
  use to_year <- decode.optional_field("toYear", None, decode.optional(decode.int))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  decode.success(GetAlbumListParams(type_: type_, size: size, offset: offset, from_year: from_year, to_year: to_year, genre: genre))
}

pub fn encode_get_album_list_params(value: GetAlbumListParams) -> json.Json {
  json.object(list.flatten([
    [#("type", json.string(value.type_))],
    case value.size { Some(v) -> [#("size", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.from_year { Some(v) -> [#("fromYear", json.int(v))] None -> [] },
    case value.to_year { Some(v) -> [#("toYear", json.int(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
  ]))
}

pub type GetAlbumRecommendationsParams {
  GetAlbumRecommendationsParams(did: String, limit: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_album_recommendations_params(did: String) -> GetAlbumRecommendationsParams {
  GetAlbumRecommendationsParams(did: did, limit: None)
}

pub fn get_album_recommendations_params_decoder() -> decode.Decoder(GetAlbumRecommendationsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  decode.success(GetAlbumRecommendationsParams(did: did, limit: limit))
}

pub fn encode_get_album_recommendations_params(value: GetAlbumRecommendationsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
  ]))
}

pub type GetAlbumShoutsOutput {
  GetAlbumShoutsOutput(shouts: Option(List(ShoutView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_album_shouts_output() -> GetAlbumShoutsOutput {
  GetAlbumShoutsOutput(shouts: None)
}

pub fn get_album_shouts_output_decoder() -> decode.Decoder(GetAlbumShoutsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use shouts <- decode.optional_field("shouts", None, decode.optional(decode.list(shout_view_decoder())))
  decode.success(GetAlbumShoutsOutput(shouts: shouts))
}

pub fn encode_get_album_shouts_output(value: GetAlbumShoutsOutput) -> json.Json {
  json.object(list.flatten([
    case value.shouts { Some(v) -> [#("shouts", json.array(v, fn(item) { encode_shout_view(item) }))] None -> [] },
  ]))
}

pub type GetAlbumShoutsParams {
  GetAlbumShoutsParams(uri: String, limit: Option(Int), offset: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_album_shouts_params(uri: String) -> GetAlbumShoutsParams {
  GetAlbumShoutsParams(uri: uri, limit: None, offset: None)
}

pub fn get_album_shouts_params_decoder() -> decode.Decoder(GetAlbumShoutsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  decode.success(GetAlbumShoutsParams(uri: uri, limit: limit, offset: offset))
}

pub fn encode_get_album_shouts_params(value: GetAlbumShoutsParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
  ]))
}

pub type GetAlbumsOutput {
  GetAlbumsOutput(albums: Option(List(AlbumViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_albums_output() -> GetAlbumsOutput {
  GetAlbumsOutput(albums: None)
}

pub fn get_albums_output_decoder() -> decode.Decoder(GetAlbumsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use albums <- decode.optional_field("albums", None, decode.optional(decode.list(album_view_basic_decoder())))
  decode.success(GetAlbumsOutput(albums: albums))
}

pub fn encode_get_albums_output(value: GetAlbumsOutput) -> json.Json {
  json.object(list.flatten([
    case value.albums { Some(v) -> [#("albums", json.array(v, fn(item) { encode_album_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetAlbumsParams {
  GetAlbumsParams(limit: Option(Int), offset: Option(Int), genre: Option(String), filter: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_albums_params() -> GetAlbumsParams {
  GetAlbumsParams(limit: None, offset: None, genre: None, filter: None)
}

pub fn get_albums_params_decoder() -> decode.Decoder(GetAlbumsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use filter <- decode.optional_field("filter", None, decode.optional(decode.string))
  decode.success(GetAlbumsParams(limit: limit, offset: offset, genre: genre, filter: filter))
}

pub fn encode_get_albums_params(value: GetAlbumsParams) -> json.Json {
  json.object(list.flatten([
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.filter { Some(v) -> [#("filter", json.string(v))] None -> [] },
  ]))
}

pub type GetAlbumTracksOutput {
  GetAlbumTracksOutput(tracks: Option(List(SongViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_album_tracks_output() -> GetAlbumTracksOutput {
  GetAlbumTracksOutput(tracks: None)
}

pub fn get_album_tracks_output_decoder() -> decode.Decoder(GetAlbumTracksOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.list(song_view_basic_decoder())))
  decode.success(GetAlbumTracksOutput(tracks: tracks))
}

pub fn encode_get_album_tracks_output(value: GetAlbumTracksOutput) -> json.Json {
  json.object(list.flatten([
    case value.tracks { Some(v) -> [#("tracks", json.array(v, fn(item) { encode_song_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetAlbumTracksParams {
  GetAlbumTracksParams(uri: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_album_tracks_params(uri: String) -> GetAlbumTracksParams {
  GetAlbumTracksParams(uri: uri)
}

pub fn get_album_tracks_params_decoder() -> decode.Decoder(GetAlbumTracksParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  decode.success(GetAlbumTracksParams(uri: uri))
}

pub fn encode_get_album_tracks_params(value: GetAlbumTracksParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
  ]))
}

pub type GetApikeysOutput {
  GetApikeysOutput(apikeys: Option(List(ApiKeyView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_apikeys_output() -> GetApikeysOutput {
  GetApikeysOutput(apikeys: None)
}

pub fn get_apikeys_output_decoder() -> decode.Decoder(GetApikeysOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use apikeys <- decode.optional_field("apikeys", None, decode.optional(decode.list(api_key_view_decoder())))
  decode.success(GetApikeysOutput(apikeys: apikeys))
}

pub fn encode_get_apikeys_output(value: GetApikeysOutput) -> json.Json {
  json.object(list.flatten([
    case value.apikeys { Some(v) -> [#("apikeys", json.array(v, fn(item) { encode_api_key_view(item) }))] None -> [] },
  ]))
}

pub type GetApikeysParams {
  GetApikeysParams(offset: Option(Int), limit: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_apikeys_params() -> GetApikeysParams {
  GetApikeysParams(offset: None, limit: None)
}

pub fn get_apikeys_params_decoder() -> decode.Decoder(GetApikeysParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  decode.success(GetApikeysParams(offset: offset, limit: limit))
}

pub fn encode_get_apikeys_params(value: GetApikeysParams) -> json.Json {
  json.object(list.flatten([
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
  ]))
}

pub type GetArtistAlbumsOutput {
  GetArtistAlbumsOutput(albums: Option(List(AlbumViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_albums_output() -> GetArtistAlbumsOutput {
  GetArtistAlbumsOutput(albums: None)
}

pub fn get_artist_albums_output_decoder() -> decode.Decoder(GetArtistAlbumsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use albums <- decode.optional_field("albums", None, decode.optional(decode.list(album_view_basic_decoder())))
  decode.success(GetArtistAlbumsOutput(albums: albums))
}

pub fn encode_get_artist_albums_output(value: GetArtistAlbumsOutput) -> json.Json {
  json.object(list.flatten([
    case value.albums { Some(v) -> [#("albums", json.array(v, fn(item) { encode_album_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetArtistAlbumsParams {
  GetArtistAlbumsParams(uri: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_albums_params(uri: String) -> GetArtistAlbumsParams {
  GetArtistAlbumsParams(uri: uri)
}

pub fn get_artist_albums_params_decoder() -> decode.Decoder(GetArtistAlbumsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  decode.success(GetArtistAlbumsParams(uri: uri))
}

pub fn encode_get_artist_albums_params(value: GetArtistAlbumsParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
  ]))
}

pub type GetArtistInfoOutput {
  GetArtistInfoOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), artist_info2: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_info_output() -> GetArtistInfoOutput {
  GetArtistInfoOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, artist_info2: None)
}

pub fn get_artist_info_output_decoder() -> decode.Decoder(GetArtistInfoOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use artist_info2 <- decode.optional_field("artistInfo2", None, decode.optional(json_value.decoder()))
  decode.success(GetArtistInfoOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, artist_info2: artist_info2))
}

pub fn encode_get_artist_info_output(value: GetArtistInfoOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.artist_info2 { Some(v) -> [#("artistInfo2", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetArtistInfoParams {
  GetArtistInfoParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_info_params(id: String) -> GetArtistInfoParams {
  GetArtistInfoParams(id: id)
}

pub fn get_artist_info_params_decoder() -> decode.Decoder(GetArtistInfoParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(GetArtistInfoParams(id: id))
}

pub fn encode_get_artist_info_params(value: GetArtistInfoParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type GetArtistListenersOutput {
  GetArtistListenersOutput(listeners: Option(List(ArtistListenerViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_listeners_output() -> GetArtistListenersOutput {
  GetArtistListenersOutput(listeners: None)
}

pub fn get_artist_listeners_output_decoder() -> decode.Decoder(GetArtistListenersOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use listeners <- decode.optional_field("listeners", None, decode.optional(decode.list(artist_listener_view_basic_decoder())))
  decode.success(GetArtistListenersOutput(listeners: listeners))
}

pub fn encode_get_artist_listeners_output(value: GetArtistListenersOutput) -> json.Json {
  json.object(list.flatten([
    case value.listeners { Some(v) -> [#("listeners", json.array(v, fn(item) { encode_artist_listener_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetArtistListenersParams {
  GetArtistListenersParams(uri: String, offset: Option(Int), limit: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_listeners_params(uri: String) -> GetArtistListenersParams {
  GetArtistListenersParams(uri: uri, offset: None, limit: None)
}

pub fn get_artist_listeners_params_decoder() -> decode.Decoder(GetArtistListenersParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  decode.success(GetArtistListenersParams(uri: uri, offset: offset, limit: limit))
}

pub fn encode_get_artist_listeners_params(value: GetArtistListenersParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
  ]))
}

pub type GetArtistRecentListenersOutput {
  GetArtistRecentListenersOutput(listeners: Option(List(ArtistRecentListenerView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_recent_listeners_output() -> GetArtistRecentListenersOutput {
  GetArtistRecentListenersOutput(listeners: None)
}

pub fn get_artist_recent_listeners_output_decoder() -> decode.Decoder(GetArtistRecentListenersOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use listeners <- decode.optional_field("listeners", None, decode.optional(decode.list(artist_recent_listener_view_decoder())))
  decode.success(GetArtistRecentListenersOutput(listeners: listeners))
}

pub fn encode_get_artist_recent_listeners_output(value: GetArtistRecentListenersOutput) -> json.Json {
  json.object(list.flatten([
    case value.listeners { Some(v) -> [#("listeners", json.array(v, fn(item) { encode_artist_recent_listener_view(item) }))] None -> [] },
  ]))
}

pub type GetArtistRecentListenersParams {
  GetArtistRecentListenersParams(uri: String, offset: Option(Int), limit: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_recent_listeners_params(uri: String) -> GetArtistRecentListenersParams {
  GetArtistRecentListenersParams(uri: uri, offset: None, limit: None)
}

pub fn get_artist_recent_listeners_params_decoder() -> decode.Decoder(GetArtistRecentListenersParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  decode.success(GetArtistRecentListenersParams(uri: uri, offset: offset, limit: limit))
}

pub fn encode_get_artist_recent_listeners_params(value: GetArtistRecentListenersParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
  ]))
}

pub type GetArtistRecommendationsParams {
  GetArtistRecommendationsParams(did: String, limit: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_recommendations_params(did: String) -> GetArtistRecommendationsParams {
  GetArtistRecommendationsParams(did: did, limit: None)
}

pub fn get_artist_recommendations_params_decoder() -> decode.Decoder(GetArtistRecommendationsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  decode.success(GetArtistRecommendationsParams(did: did, limit: limit))
}

pub fn encode_get_artist_recommendations_params(value: GetArtistRecommendationsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
  ]))
}

pub type GetArtistShoutsOutput {
  GetArtistShoutsOutput(shouts: Option(List(ShoutView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_shouts_output() -> GetArtistShoutsOutput {
  GetArtistShoutsOutput(shouts: None)
}

pub fn get_artist_shouts_output_decoder() -> decode.Decoder(GetArtistShoutsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use shouts <- decode.optional_field("shouts", None, decode.optional(decode.list(shout_view_decoder())))
  decode.success(GetArtistShoutsOutput(shouts: shouts))
}

pub fn encode_get_artist_shouts_output(value: GetArtistShoutsOutput) -> json.Json {
  json.object(list.flatten([
    case value.shouts { Some(v) -> [#("shouts", json.array(v, fn(item) { encode_shout_view(item) }))] None -> [] },
  ]))
}

pub type GetArtistShoutsParams {
  GetArtistShoutsParams(uri: String, limit: Option(Int), offset: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_shouts_params(uri: String) -> GetArtistShoutsParams {
  GetArtistShoutsParams(uri: uri, limit: None, offset: None)
}

pub fn get_artist_shouts_params_decoder() -> decode.Decoder(GetArtistShoutsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  decode.success(GetArtistShoutsParams(uri: uri, limit: limit, offset: offset))
}

pub fn encode_get_artist_shouts_params(value: GetArtistShoutsParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
  ]))
}

pub type GetArtistTracksOutput {
  GetArtistTracksOutput(tracks: Option(List(SongViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_tracks_output() -> GetArtistTracksOutput {
  GetArtistTracksOutput(tracks: None)
}

pub fn get_artist_tracks_output_decoder() -> decode.Decoder(GetArtistTracksOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.list(song_view_basic_decoder())))
  decode.success(GetArtistTracksOutput(tracks: tracks))
}

pub fn encode_get_artist_tracks_output(value: GetArtistTracksOutput) -> json.Json {
  json.object(list.flatten([
    case value.tracks { Some(v) -> [#("tracks", json.array(v, fn(item) { encode_song_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetArtistTracksParams {
  GetArtistTracksParams(uri: Option(String), limit: Option(Int), offset: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_artist_tracks_params() -> GetArtistTracksParams {
  GetArtistTracksParams(uri: None, limit: None, offset: None)
}

pub fn get_artist_tracks_params_decoder() -> decode.Decoder(GetArtistTracksParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  decode.success(GetArtistTracksParams(uri: uri, limit: limit, offset: offset))
}

pub fn encode_get_artist_tracks_params(value: GetArtistTracksParams) -> json.Json {
  json.object(list.flatten([
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
  ]))
}

pub type GetAudioSettingsParams {
  GetAudioSettingsParams(did: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_audio_settings_params() -> GetAudioSettingsParams {
  GetAudioSettingsParams(did: None)
}

pub fn get_audio_settings_params_decoder() -> decode.Decoder(GetAudioSettingsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  decode.success(GetAudioSettingsParams(did: did))
}

pub fn encode_get_audio_settings_params(value: GetAudioSettingsParams) -> json.Json {
  json.object(list.flatten([
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
  ]))
}

pub type GetCoverArtUrlOutput {
  GetCoverArtUrlOutput(url: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_cover_art_url_output(url: String) -> GetCoverArtUrlOutput {
  GetCoverArtUrlOutput(url: url)
}

pub fn get_cover_art_url_output_decoder() -> decode.Decoder(GetCoverArtUrlOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use url <- decode.field("url", decode.string)
  decode.success(GetCoverArtUrlOutput(url: url))
}

pub fn encode_get_cover_art_url_output(value: GetCoverArtUrlOutput) -> json.Json {
  json.object(list.flatten([
    [#("url", json.string(value.url))],
  ]))
}

pub type GetCoverArtUrlParams {
  GetCoverArtUrlParams(id: String, size: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_cover_art_url_params(id: String) -> GetCoverArtUrlParams {
  GetCoverArtUrlParams(id: id, size: None)
}

pub fn get_cover_art_url_params_decoder() -> decode.Decoder(GetCoverArtUrlParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  use size <- decode.optional_field("size", None, decode.optional(decode.int))
  decode.success(GetCoverArtUrlParams(id: id, size: size))
}

pub fn encode_get_cover_art_url_params(value: GetCoverArtUrlParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
    case value.size { Some(v) -> [#("size", json.int(v))] None -> [] },
  ]))
}

pub type GetDecadesOutput {
  GetDecadesOutput(decades: Option(List(ChartsDecadeViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_decades_output() -> GetDecadesOutput {
  GetDecadesOutput(decades: None)
}

pub fn get_decades_output_decoder() -> decode.Decoder(GetDecadesOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use decades <- decode.optional_field("decades", None, decode.optional(decode.list(charts_decade_view_basic_decoder())))
  decode.success(GetDecadesOutput(decades: decades))
}

pub fn encode_get_decades_output(value: GetDecadesOutput) -> json.Json {
  json.object(list.flatten([
    case value.decades { Some(v) -> [#("decades", json.array(v, fn(item) { encode_charts_decade_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetDecadesParams {
  GetDecadesParams(did: Option(String), start_date: Option(String), end_date: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_decades_params() -> GetDecadesParams {
  GetDecadesParams(did: None, start_date: None, end_date: None)
}

pub fn get_decades_params_decoder() -> decode.Decoder(GetDecadesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use start_date <- decode.optional_field("startDate", None, decode.optional(decode.string))
  use end_date <- decode.optional_field("endDate", None, decode.optional(decode.string))
  decode.success(GetDecadesParams(did: did, start_date: start_date, end_date: end_date))
}

pub fn encode_get_decades_params(value: GetDecadesParams) -> json.Json {
  json.object(list.flatten([
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.start_date { Some(v) -> [#("startDate", json.string(v))] None -> [] },
    case value.end_date { Some(v) -> [#("endDate", json.string(v))] None -> [] },
  ]))
}

pub type GetDownloadUrlOutput {
  GetDownloadUrlOutput(url: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_download_url_output(url: String) -> GetDownloadUrlOutput {
  GetDownloadUrlOutput(url: url)
}

pub fn get_download_url_output_decoder() -> decode.Decoder(GetDownloadUrlOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use url <- decode.field("url", decode.string)
  decode.success(GetDownloadUrlOutput(url: url))
}

pub fn encode_get_download_url_output(value: GetDownloadUrlOutput) -> json.Json {
  json.object(list.flatten([
    [#("url", json.string(value.url))],
  ]))
}

pub type GetDownloadUrlParams {
  GetDownloadUrlParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_download_url_params(id: String) -> GetDownloadUrlParams {
  GetDownloadUrlParams(id: id)
}

pub fn get_download_url_params_decoder() -> decode.Decoder(GetDownloadUrlParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(GetDownloadUrlParams(id: id))
}

pub fn encode_get_download_url_params(value: GetDownloadUrlParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type GetFeedGeneratorOutput {
  GetFeedGeneratorOutput(view: Option(FeedGeneratorView))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_feed_generator_output() -> GetFeedGeneratorOutput {
  GetFeedGeneratorOutput(view: None)
}

pub fn get_feed_generator_output_decoder() -> decode.Decoder(GetFeedGeneratorOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use view <- decode.optional_field("view", None, decode.optional(feed_generator_view_decoder()))
  decode.success(GetFeedGeneratorOutput(view: view))
}

pub fn encode_get_feed_generator_output(value: GetFeedGeneratorOutput) -> json.Json {
  json.object(list.flatten([
    case value.view { Some(v) -> [#("view", encode_feed_generator_view(v))] None -> [] },
  ]))
}

pub type GetFeedGeneratorParams {
  GetFeedGeneratorParams(feed: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_feed_generator_params(feed: String) -> GetFeedGeneratorParams {
  GetFeedGeneratorParams(feed: feed)
}

pub fn get_feed_generator_params_decoder() -> decode.Decoder(GetFeedGeneratorParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use feed <- decode.field("feed", decode.string)
  decode.success(GetFeedGeneratorParams(feed: feed))
}

pub fn encode_get_feed_generator_params(value: GetFeedGeneratorParams) -> json.Json {
  json.object(list.flatten([
    [#("feed", json.string(value.feed))],
  ]))
}

pub type GetFeedGeneratorsParams {
  GetFeedGeneratorsParams(size: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_feed_generators_params() -> GetFeedGeneratorsParams {
  GetFeedGeneratorsParams(size: None)
}

pub fn get_feed_generators_params_decoder() -> decode.Decoder(GetFeedGeneratorsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use size <- decode.optional_field("size", None, decode.optional(decode.int))
  decode.success(GetFeedGeneratorsParams(size: size))
}

pub fn encode_get_feed_generators_params(value: GetFeedGeneratorsParams) -> json.Json {
  json.object(list.flatten([
    case value.size { Some(v) -> [#("size", json.int(v))] None -> [] },
  ]))
}

pub type GetFeedParams {
  GetFeedParams(feed: String, limit: Option(Int), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_feed_params(feed: String) -> GetFeedParams {
  GetFeedParams(feed: feed, limit: None, cursor: None)
}

pub fn get_feed_params_decoder() -> decode.Decoder(GetFeedParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use feed <- decode.field("feed", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(GetFeedParams(feed: feed, limit: limit, cursor: cursor))
}

pub fn encode_get_feed_params(value: GetFeedParams) -> json.Json {
  json.object(list.flatten([
    [#("feed", json.string(value.feed))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type GetFeedSkeletonOutput {
  GetFeedSkeletonOutput(scrobbles: Option(List(ScrobbleViewBasic)), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_feed_skeleton_output() -> GetFeedSkeletonOutput {
  GetFeedSkeletonOutput(scrobbles: None, cursor: None)
}

pub fn get_feed_skeleton_output_decoder() -> decode.Decoder(GetFeedSkeletonOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.list(scrobble_view_basic_decoder())))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(GetFeedSkeletonOutput(scrobbles: scrobbles, cursor: cursor))
}

pub fn encode_get_feed_skeleton_output(value: GetFeedSkeletonOutput) -> json.Json {
  json.object(list.flatten([
    case value.scrobbles { Some(v) -> [#("scrobbles", json.array(v, fn(item) { encode_scrobble_view_basic(item) }))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type GetFeedSkeletonParams {
  GetFeedSkeletonParams(feed: String, limit: Option(Int), offset: Option(Int), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_feed_skeleton_params(feed: String) -> GetFeedSkeletonParams {
  GetFeedSkeletonParams(feed: feed, limit: None, offset: None, cursor: None)
}

pub fn get_feed_skeleton_params_decoder() -> decode.Decoder(GetFeedSkeletonParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use feed <- decode.field("feed", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(GetFeedSkeletonParams(feed: feed, limit: limit, offset: offset, cursor: cursor))
}

pub fn encode_get_feed_skeleton_params(value: GetFeedSkeletonParams) -> json.Json {
  json.object(list.flatten([
    [#("feed", json.string(value.feed))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type GetFileParams {
  GetFileParams(file_id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_file_params(file_id: String) -> GetFileParams {
  GetFileParams(file_id: file_id)
}

pub fn get_file_params_decoder() -> decode.Decoder(GetFileParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use file_id <- decode.field("fileId", decode.string)
  decode.success(GetFileParams(file_id: file_id))
}

pub fn encode_get_file_params(value: GetFileParams) -> json.Json {
  json.object(list.flatten([
    [#("fileId", json.string(value.file_id))],
  ]))
}

pub type GetFollowersOutput {
  GetFollowersOutput(subject: ActorProfileViewBasic, followers: List(ActorProfileViewBasic), cursor: Option(String), count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_followers_output(subject: ActorProfileViewBasic, followers: List(ActorProfileViewBasic)) -> GetFollowersOutput {
  GetFollowersOutput(subject: subject, followers: followers, cursor: None, count: None)
}

pub fn get_followers_output_decoder() -> decode.Decoder(GetFollowersOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use subject <- decode.field("subject", actor_profile_view_basic_decoder())
  use followers <- decode.field("followers", decode.list(actor_profile_view_basic_decoder()))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  use count <- decode.optional_field("count", None, decode.optional(decode.int))
  decode.success(GetFollowersOutput(subject: subject, followers: followers, cursor: cursor, count: count))
}

pub fn encode_get_followers_output(value: GetFollowersOutput) -> json.Json {
  json.object(list.flatten([
    [#("subject", encode_actor_profile_view_basic(value.subject))],
    [#("followers", json.array(value.followers, fn(item) { encode_actor_profile_view_basic(item) }))],
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
    case value.count { Some(v) -> [#("count", json.int(v))] None -> [] },
  ]))
}

pub type GetFollowersParams {
  GetFollowersParams(actor: String, limit: Option(Int), dids: Option(List(String)), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_followers_params(actor: String) -> GetFollowersParams {
  GetFollowersParams(actor: actor, limit: None, dids: None, cursor: None)
}

pub fn get_followers_params_decoder() -> decode.Decoder(GetFollowersParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use actor <- decode.field("actor", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use dids <- decode.optional_field("dids", None, decode.optional(decode.list(decode.string)))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(GetFollowersParams(actor: actor, limit: limit, dids: dids, cursor: cursor))
}

pub fn encode_get_followers_params(value: GetFollowersParams) -> json.Json {
  json.object(list.flatten([
    [#("actor", json.string(value.actor))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.dids { Some(v) -> [#("dids", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type GetFollowsOutput {
  GetFollowsOutput(subject: ActorProfileViewBasic, follows: List(ActorProfileViewBasic), cursor: Option(String), count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_follows_output(subject: ActorProfileViewBasic, follows: List(ActorProfileViewBasic)) -> GetFollowsOutput {
  GetFollowsOutput(subject: subject, follows: follows, cursor: None, count: None)
}

pub fn get_follows_output_decoder() -> decode.Decoder(GetFollowsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use subject <- decode.field("subject", actor_profile_view_basic_decoder())
  use follows <- decode.field("follows", decode.list(actor_profile_view_basic_decoder()))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  use count <- decode.optional_field("count", None, decode.optional(decode.int))
  decode.success(GetFollowsOutput(subject: subject, follows: follows, cursor: cursor, count: count))
}

pub fn encode_get_follows_output(value: GetFollowsOutput) -> json.Json {
  json.object(list.flatten([
    [#("subject", encode_actor_profile_view_basic(value.subject))],
    [#("follows", json.array(value.follows, fn(item) { encode_actor_profile_view_basic(item) }))],
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
    case value.count { Some(v) -> [#("count", json.int(v))] None -> [] },
  ]))
}

pub type GetFollowsParams {
  GetFollowsParams(actor: String, limit: Option(Int), dids: Option(List(String)), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_follows_params(actor: String) -> GetFollowsParams {
  GetFollowsParams(actor: actor, limit: None, dids: None, cursor: None)
}

pub fn get_follows_params_decoder() -> decode.Decoder(GetFollowsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use actor <- decode.field("actor", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use dids <- decode.optional_field("dids", None, decode.optional(decode.list(decode.string)))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(GetFollowsParams(actor: actor, limit: limit, dids: dids, cursor: cursor))
}

pub fn encode_get_follows_params(value: GetFollowsParams) -> json.Json {
  json.object(list.flatten([
    [#("actor", json.string(value.actor))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.dids { Some(v) -> [#("dids", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type GetGenresOutput {
  GetGenresOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), genres: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_genres_output() -> GetGenresOutput {
  GetGenresOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, genres: None)
}

pub fn get_genres_output_decoder() -> decode.Decoder(GetGenresOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use genres <- decode.optional_field("genres", None, decode.optional(json_value.decoder()))
  decode.success(GetGenresOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, genres: genres))
}

pub fn encode_get_genres_output(value: GetGenresOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.genres { Some(v) -> [#("genres", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetGenresParams {
  GetGenresParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_genres_params() -> GetGenresParams {
  GetGenresParams
}

pub fn get_genres_params_decoder() -> decode.Decoder(GetGenresParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetGenresParams)
}

pub fn encode_get_genres_params(_value: GetGenresParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetGlobalStatsParams {
  GetGlobalStatsParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_global_stats_params() -> GetGlobalStatsParams {
  GetGlobalStatsParams
}

pub fn get_global_stats_params_decoder() -> decode.Decoder(GetGlobalStatsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetGlobalStatsParams)
}

pub fn encode_get_global_stats_params(_value: GetGlobalStatsParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetIndexesOutput {
  GetIndexesOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), indexes: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_indexes_output() -> GetIndexesOutput {
  GetIndexesOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, indexes: None)
}

pub fn get_indexes_output_decoder() -> decode.Decoder(GetIndexesOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use indexes <- decode.optional_field("indexes", None, decode.optional(json_value.decoder()))
  decode.success(GetIndexesOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, indexes: indexes))
}

pub fn encode_get_indexes_output(value: GetIndexesOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.indexes { Some(v) -> [#("indexes", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetIndexesParams {
  GetIndexesParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_indexes_params() -> GetIndexesParams {
  GetIndexesParams
}

pub fn get_indexes_params_decoder() -> decode.Decoder(GetIndexesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetIndexesParams)
}

pub fn encode_get_indexes_params(_value: GetIndexesParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetInternetRadioStationsOutput {
  GetInternetRadioStationsOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), internet_radio_stations: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_internet_radio_stations_output() -> GetInternetRadioStationsOutput {
  GetInternetRadioStationsOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, internet_radio_stations: None)
}

pub fn get_internet_radio_stations_output_decoder() -> decode.Decoder(GetInternetRadioStationsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use internet_radio_stations <- decode.optional_field("internetRadioStations", None, decode.optional(json_value.decoder()))
  decode.success(GetInternetRadioStationsOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, internet_radio_stations: internet_radio_stations))
}

pub fn encode_get_internet_radio_stations_output(value: GetInternetRadioStationsOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.internet_radio_stations { Some(v) -> [#("internetRadioStations", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetInternetRadioStationsParams {
  GetInternetRadioStationsParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_internet_radio_stations_params() -> GetInternetRadioStationsParams {
  GetInternetRadioStationsParams
}

pub fn get_internet_radio_stations_params_decoder() -> decode.Decoder(GetInternetRadioStationsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetInternetRadioStationsParams)
}

pub fn encode_get_internet_radio_stations_params(_value: GetInternetRadioStationsParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetKnownFollowersOutput {
  GetKnownFollowersOutput(subject: ActorProfileViewBasic, followers: List(ActorProfileViewBasic), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_known_followers_output(subject: ActorProfileViewBasic, followers: List(ActorProfileViewBasic)) -> GetKnownFollowersOutput {
  GetKnownFollowersOutput(subject: subject, followers: followers, cursor: None)
}

pub fn get_known_followers_output_decoder() -> decode.Decoder(GetKnownFollowersOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use subject <- decode.field("subject", actor_profile_view_basic_decoder())
  use followers <- decode.field("followers", decode.list(actor_profile_view_basic_decoder()))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(GetKnownFollowersOutput(subject: subject, followers: followers, cursor: cursor))
}

pub fn encode_get_known_followers_output(value: GetKnownFollowersOutput) -> json.Json {
  json.object(list.flatten([
    [#("subject", encode_actor_profile_view_basic(value.subject))],
    [#("followers", json.array(value.followers, fn(item) { encode_actor_profile_view_basic(item) }))],
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type GetKnownFollowersParams {
  GetKnownFollowersParams(actor: String, limit: Option(Int), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_known_followers_params(actor: String) -> GetKnownFollowersParams {
  GetKnownFollowersParams(actor: actor, limit: None, cursor: None)
}

pub fn get_known_followers_params_decoder() -> decode.Decoder(GetKnownFollowersParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use actor <- decode.field("actor", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(GetKnownFollowersParams(actor: actor, limit: limit, cursor: cursor))
}

pub fn encode_get_known_followers_params(value: GetKnownFollowersParams) -> json.Json {
  json.object(list.flatten([
    [#("actor", json.string(value.actor))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type GetLicenseOutput {
  GetLicenseOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), license: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_license_output() -> GetLicenseOutput {
  GetLicenseOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, license: None)
}

pub fn get_license_output_decoder() -> decode.Decoder(GetLicenseOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use license <- decode.optional_field("license", None, decode.optional(json_value.decoder()))
  decode.success(GetLicenseOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, license: license))
}

pub fn encode_get_license_output(value: GetLicenseOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.license { Some(v) -> [#("license", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetLicenseParams {
  GetLicenseParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_license_params() -> GetLicenseParams {
  GetLicenseParams
}

pub fn get_license_params_decoder() -> decode.Decoder(GetLicenseParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetLicenseParams)
}

pub fn encode_get_license_params(_value: GetLicenseParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetLyricsOutput {
  GetLyricsOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), lyrics: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_lyrics_output() -> GetLyricsOutput {
  GetLyricsOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, lyrics: None)
}

pub fn get_lyrics_output_decoder() -> decode.Decoder(GetLyricsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use lyrics <- decode.optional_field("lyrics", None, decode.optional(json_value.decoder()))
  decode.success(GetLyricsOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, lyrics: lyrics))
}

pub fn encode_get_lyrics_output(value: GetLyricsOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.lyrics { Some(v) -> [#("lyrics", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetLyricsParams {
  GetLyricsParams(artist: Option(String), title: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_lyrics_params() -> GetLyricsParams {
  GetLyricsParams(artist: None, title: None)
}

pub fn get_lyrics_params_decoder() -> decode.Decoder(GetLyricsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  decode.success(GetLyricsParams(artist: artist, title: title))
}

pub fn encode_get_lyrics_params(value: GetLyricsParams) -> json.Json {
  json.object(list.flatten([
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
  ]))
}

pub type GetMetadataOutput {
  GetMetadataOutput(metadata: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_metadata_output() -> GetMetadataOutput {
  GetMetadataOutput(metadata: None)
}

pub fn get_metadata_output_decoder() -> decode.Decoder(GetMetadataOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use metadata <- decode.optional_field("metadata", None, decode.optional(json_value.decoder()))
  decode.success(GetMetadataOutput(metadata: metadata))
}

pub fn encode_get_metadata_output(value: GetMetadataOutput) -> json.Json {
  json.object(list.flatten([
    case value.metadata { Some(v) -> [#("metadata", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetMetadataParams {
  GetMetadataParams(path: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_metadata_params(path: String) -> GetMetadataParams {
  GetMetadataParams(path: path)
}

pub fn get_metadata_params_decoder() -> decode.Decoder(GetMetadataParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use path <- decode.field("path", decode.string)
  decode.success(GetMetadataParams(path: path))
}

pub fn encode_get_metadata_params(value: GetMetadataParams) -> json.Json {
  json.object(list.flatten([
    [#("path", json.string(value.path))],
  ]))
}

pub type GetMirrorSourcesOutput {
  GetMirrorSourcesOutput(sources: List(MirrorSourceView))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_mirror_sources_output(sources: List(MirrorSourceView)) -> GetMirrorSourcesOutput {
  GetMirrorSourcesOutput(sources: sources)
}

pub fn get_mirror_sources_output_decoder() -> decode.Decoder(GetMirrorSourcesOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use sources <- decode.field("sources", decode.list(mirror_source_view_decoder()))
  decode.success(GetMirrorSourcesOutput(sources: sources))
}

pub fn encode_get_mirror_sources_output(value: GetMirrorSourcesOutput) -> json.Json {
  json.object(list.flatten([
    [#("sources", json.array(value.sources, fn(item) { encode_mirror_source_view(item) }))],
  ]))
}

pub type GetMirrorSourcesParams {
  GetMirrorSourcesParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_mirror_sources_params() -> GetMirrorSourcesParams {
  GetMirrorSourcesParams
}

pub fn get_mirror_sources_params_decoder() -> decode.Decoder(GetMirrorSourcesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetMirrorSourcesParams)
}

pub fn encode_get_mirror_sources_params(_value: GetMirrorSourcesParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetMusicDirectoryOutput {
  GetMusicDirectoryOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), directory: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_music_directory_output() -> GetMusicDirectoryOutput {
  GetMusicDirectoryOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, directory: None)
}

pub fn get_music_directory_output_decoder() -> decode.Decoder(GetMusicDirectoryOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use directory <- decode.optional_field("directory", None, decode.optional(json_value.decoder()))
  decode.success(GetMusicDirectoryOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, directory: directory))
}

pub fn encode_get_music_directory_output(value: GetMusicDirectoryOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.directory { Some(v) -> [#("directory", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetMusicDirectoryParams {
  GetMusicDirectoryParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_music_directory_params(id: String) -> GetMusicDirectoryParams {
  GetMusicDirectoryParams(id: id)
}

pub fn get_music_directory_params_decoder() -> decode.Decoder(GetMusicDirectoryParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(GetMusicDirectoryParams(id: id))
}

pub fn encode_get_music_directory_params(value: GetMusicDirectoryParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type GetMusicFoldersOutput {
  GetMusicFoldersOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), music_folders: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_music_folders_output() -> GetMusicFoldersOutput {
  GetMusicFoldersOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, music_folders: None)
}

pub fn get_music_folders_output_decoder() -> decode.Decoder(GetMusicFoldersOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use music_folders <- decode.optional_field("musicFolders", None, decode.optional(json_value.decoder()))
  decode.success(GetMusicFoldersOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, music_folders: music_folders))
}

pub fn encode_get_music_folders_output(value: GetMusicFoldersOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.music_folders { Some(v) -> [#("musicFolders", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetMusicFoldersParams {
  GetMusicFoldersParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_music_folders_params() -> GetMusicFoldersParams {
  GetMusicFoldersParams
}

pub fn get_music_folders_params_decoder() -> decode.Decoder(GetMusicFoldersParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetMusicFoldersParams)
}

pub fn encode_get_music_folders_params(_value: GetMusicFoldersParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetNowPlayingOutput {
  GetNowPlayingOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), now_playing: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_now_playing_output() -> GetNowPlayingOutput {
  GetNowPlayingOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, now_playing: None)
}

pub fn get_now_playing_output_decoder() -> decode.Decoder(GetNowPlayingOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use now_playing <- decode.optional_field("nowPlaying", None, decode.optional(json_value.decoder()))
  decode.success(GetNowPlayingOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, now_playing: now_playing))
}

pub fn encode_get_now_playing_output(value: GetNowPlayingOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.now_playing { Some(v) -> [#("nowPlaying", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetNowPlayingParams {
  GetNowPlayingParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_now_playing_params() -> GetNowPlayingParams {
  GetNowPlayingParams
}

pub fn get_now_playing_params_decoder() -> decode.Decoder(GetNowPlayingParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetNowPlayingParams)
}

pub fn encode_get_now_playing_params(_value: GetNowPlayingParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetPlaybackQueueParams {
  GetPlaybackQueueParams(player_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_playback_queue_params() -> GetPlaybackQueueParams {
  GetPlaybackQueueParams(player_id: None)
}

pub fn get_playback_queue_params_decoder() -> decode.Decoder(GetPlaybackQueueParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  decode.success(GetPlaybackQueueParams(player_id: player_id))
}

pub fn encode_get_playback_queue_params(value: GetPlaybackQueueParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
  ]))
}

pub type GetPlayQueueOutput {
  GetPlayQueueOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), play_queue: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_play_queue_output() -> GetPlayQueueOutput {
  GetPlayQueueOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, play_queue: None)
}

pub fn get_play_queue_output_decoder() -> decode.Decoder(GetPlayQueueOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use play_queue <- decode.optional_field("playQueue", None, decode.optional(json_value.decoder()))
  decode.success(GetPlayQueueOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, play_queue: play_queue))
}

pub fn encode_get_play_queue_output(value: GetPlayQueueOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.play_queue { Some(v) -> [#("playQueue", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetPlayQueueParams {
  GetPlayQueueParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_play_queue_params() -> GetPlayQueueParams {
  GetPlayQueueParams
}

pub fn get_play_queue_params_decoder() -> decode.Decoder(GetPlayQueueParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetPlayQueueParams)
}

pub fn encode_get_play_queue_params(_value: GetPlayQueueParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetProfileParams {
  GetProfileParams(did: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_profile_params() -> GetProfileParams {
  GetProfileParams(did: None)
}

pub fn get_profile_params_decoder() -> decode.Decoder(GetProfileParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  decode.success(GetProfileParams(did: did))
}

pub fn encode_get_profile_params(value: GetProfileParams) -> json.Json {
  json.object(list.flatten([
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
  ]))
}

pub type GetProfileShoutsOutput {
  GetProfileShoutsOutput(shouts: Option(List(ShoutView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_profile_shouts_output() -> GetProfileShoutsOutput {
  GetProfileShoutsOutput(shouts: None)
}

pub fn get_profile_shouts_output_decoder() -> decode.Decoder(GetProfileShoutsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use shouts <- decode.optional_field("shouts", None, decode.optional(decode.list(shout_view_decoder())))
  decode.success(GetProfileShoutsOutput(shouts: shouts))
}

pub fn encode_get_profile_shouts_output(value: GetProfileShoutsOutput) -> json.Json {
  json.object(list.flatten([
    case value.shouts { Some(v) -> [#("shouts", json.array(v, fn(item) { encode_shout_view(item) }))] None -> [] },
  ]))
}

pub type GetProfileShoutsParams {
  GetProfileShoutsParams(did: String, offset: Option(Int), limit: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_profile_shouts_params(did: String) -> GetProfileShoutsParams {
  GetProfileShoutsParams(did: did, offset: None, limit: None)
}

pub fn get_profile_shouts_params_decoder() -> decode.Decoder(GetProfileShoutsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  decode.success(GetProfileShoutsParams(did: did, offset: offset, limit: limit))
}

pub fn encode_get_profile_shouts_params(value: GetProfileShoutsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
  ]))
}

pub type GetRandomSongsOutput {
  GetRandomSongsOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), random_songs: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_random_songs_output() -> GetRandomSongsOutput {
  GetRandomSongsOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, random_songs: None)
}

pub fn get_random_songs_output_decoder() -> decode.Decoder(GetRandomSongsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use random_songs <- decode.optional_field("randomSongs", None, decode.optional(json_value.decoder()))
  decode.success(GetRandomSongsOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, random_songs: random_songs))
}

pub fn encode_get_random_songs_output(value: GetRandomSongsOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.random_songs { Some(v) -> [#("randomSongs", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetRandomSongsParams {
  GetRandomSongsParams(size: Option(Int), genre: Option(String), from_year: Option(Int), to_year: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_random_songs_params() -> GetRandomSongsParams {
  GetRandomSongsParams(size: None, genre: None, from_year: None, to_year: None)
}

pub fn get_random_songs_params_decoder() -> decode.Decoder(GetRandomSongsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use size <- decode.optional_field("size", None, decode.optional(decode.int))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use from_year <- decode.optional_field("fromYear", None, decode.optional(decode.int))
  use to_year <- decode.optional_field("toYear", None, decode.optional(decode.int))
  decode.success(GetRandomSongsParams(size: size, genre: genre, from_year: from_year, to_year: to_year))
}

pub fn encode_get_random_songs_params(value: GetRandomSongsParams) -> json.Json {
  json.object(list.flatten([
    case value.size { Some(v) -> [#("size", json.int(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.from_year { Some(v) -> [#("fromYear", json.int(v))] None -> [] },
    case value.to_year { Some(v) -> [#("toYear", json.int(v))] None -> [] },
  ]))
}

pub type GetRecommendationsParams {
  GetRecommendationsParams(did: String, limit: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_recommendations_params(did: String) -> GetRecommendationsParams {
  GetRecommendationsParams(did: did, limit: None)
}

pub fn get_recommendations_params_decoder() -> decode.Decoder(GetRecommendationsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  decode.success(GetRecommendationsParams(did: did, limit: limit))
}

pub fn encode_get_recommendations_params(value: GetRecommendationsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
  ]))
}

pub type GetScanStatusOutput {
  GetScanStatusOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), scan_status: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_scan_status_output() -> GetScanStatusOutput {
  GetScanStatusOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, scan_status: None)
}

pub fn get_scan_status_output_decoder() -> decode.Decoder(GetScanStatusOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use scan_status <- decode.optional_field("scanStatus", None, decode.optional(json_value.decoder()))
  decode.success(GetScanStatusOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, scan_status: scan_status))
}

pub fn encode_get_scan_status_output(value: GetScanStatusOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.scan_status { Some(v) -> [#("scanStatus", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetScanStatusParams {
  GetScanStatusParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_scan_status_params() -> GetScanStatusParams {
  GetScanStatusParams
}

pub fn get_scan_status_params_decoder() -> decode.Decoder(GetScanStatusParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetScanStatusParams)
}

pub fn encode_get_scan_status_params(_value: GetScanStatusParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetScrobbleParams {
  GetScrobbleParams(uri: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_scrobble_params(uri: String) -> GetScrobbleParams {
  GetScrobbleParams(uri: uri)
}

pub fn get_scrobble_params_decoder() -> decode.Decoder(GetScrobbleParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  decode.success(GetScrobbleParams(uri: uri))
}

pub fn encode_get_scrobble_params(value: GetScrobbleParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
  ]))
}

pub type GetScrobblesChartParams {
  GetScrobblesChartParams(did: Option(String), artisturi: Option(String), albumuri: Option(String), songuri: Option(String), genre: Option(String), from: Option(String), to: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_scrobbles_chart_params() -> GetScrobblesChartParams {
  GetScrobblesChartParams(did: None, artisturi: None, albumuri: None, songuri: None, genre: None, from: None, to: None)
}

pub fn get_scrobbles_chart_params_decoder() -> decode.Decoder(GetScrobblesChartParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use artisturi <- decode.optional_field("artisturi", None, decode.optional(decode.string))
  use albumuri <- decode.optional_field("albumuri", None, decode.optional(decode.string))
  use songuri <- decode.optional_field("songuri", None, decode.optional(decode.string))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use from <- decode.optional_field("from", None, decode.optional(decode.string))
  use to <- decode.optional_field("to", None, decode.optional(decode.string))
  decode.success(GetScrobblesChartParams(did: did, artisturi: artisturi, albumuri: albumuri, songuri: songuri, genre: genre, from: from, to: to))
}

pub fn encode_get_scrobbles_chart_params(value: GetScrobblesChartParams) -> json.Json {
  json.object(list.flatten([
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.artisturi { Some(v) -> [#("artisturi", json.string(v))] None -> [] },
    case value.albumuri { Some(v) -> [#("albumuri", json.string(v))] None -> [] },
    case value.songuri { Some(v) -> [#("songuri", json.string(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.from { Some(v) -> [#("from", json.string(v))] None -> [] },
    case value.to { Some(v) -> [#("to", json.string(v))] None -> [] },
  ]))
}

pub type GetScrobblesOutput {
  GetScrobblesOutput(scrobbles: Option(List(ScrobbleViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_scrobbles_output() -> GetScrobblesOutput {
  GetScrobblesOutput(scrobbles: None)
}

pub fn get_scrobbles_output_decoder() -> decode.Decoder(GetScrobblesOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.list(scrobble_view_basic_decoder())))
  decode.success(GetScrobblesOutput(scrobbles: scrobbles))
}

pub fn encode_get_scrobbles_output(value: GetScrobblesOutput) -> json.Json {
  json.object(list.flatten([
    case value.scrobbles { Some(v) -> [#("scrobbles", json.array(v, fn(item) { encode_scrobble_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetScrobblesParams {
  GetScrobblesParams(did: Option(String), following: Option(Bool), limit: Option(Int), offset: Option(Int), filter: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_scrobbles_params() -> GetScrobblesParams {
  GetScrobblesParams(did: None, following: None, limit: None, offset: None, filter: None)
}

pub fn get_scrobbles_params_decoder() -> decode.Decoder(GetScrobblesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use following <- decode.optional_field("following", None, decode.optional(decode.bool))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use filter <- decode.optional_field("filter", None, decode.optional(decode.string))
  decode.success(GetScrobblesParams(did: did, following: following, limit: limit, offset: offset, filter: filter))
}

pub fn encode_get_scrobbles_params(value: GetScrobblesParams) -> json.Json {
  json.object(list.flatten([
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.following { Some(v) -> [#("following", json.bool(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.filter { Some(v) -> [#("filter", json.string(v))] None -> [] },
  ]))
}

pub type GetShoutRepliesOutput {
  GetShoutRepliesOutput(shouts: Option(List(ShoutView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_shout_replies_output() -> GetShoutRepliesOutput {
  GetShoutRepliesOutput(shouts: None)
}

pub fn get_shout_replies_output_decoder() -> decode.Decoder(GetShoutRepliesOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use shouts <- decode.optional_field("shouts", None, decode.optional(decode.list(shout_view_decoder())))
  decode.success(GetShoutRepliesOutput(shouts: shouts))
}

pub fn encode_get_shout_replies_output(value: GetShoutRepliesOutput) -> json.Json {
  json.object(list.flatten([
    case value.shouts { Some(v) -> [#("shouts", json.array(v, fn(item) { encode_shout_view(item) }))] None -> [] },
  ]))
}

pub type GetShoutRepliesParams {
  GetShoutRepliesParams(uri: String, limit: Option(Int), offset: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_shout_replies_params(uri: String) -> GetShoutRepliesParams {
  GetShoutRepliesParams(uri: uri, limit: None, offset: None)
}

pub fn get_shout_replies_params_decoder() -> decode.Decoder(GetShoutRepliesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  decode.success(GetShoutRepliesParams(uri: uri, limit: limit, offset: offset))
}

pub fn encode_get_shout_replies_params(value: GetShoutRepliesParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
  ]))
}

pub type GetSimilarSongsOutput {
  GetSimilarSongsOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), similar_songs2: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_similar_songs_output() -> GetSimilarSongsOutput {
  GetSimilarSongsOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, similar_songs2: None)
}

pub fn get_similar_songs_output_decoder() -> decode.Decoder(GetSimilarSongsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use similar_songs2 <- decode.optional_field("similarSongs2", None, decode.optional(json_value.decoder()))
  decode.success(GetSimilarSongsOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, similar_songs2: similar_songs2))
}

pub fn encode_get_similar_songs_output(value: GetSimilarSongsOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.similar_songs2 { Some(v) -> [#("similarSongs2", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetSimilarSongsParams {
  GetSimilarSongsParams(id: String, count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_similar_songs_params(id: String) -> GetSimilarSongsParams {
  GetSimilarSongsParams(id: id, count: None)
}

pub fn get_similar_songs_params_decoder() -> decode.Decoder(GetSimilarSongsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  use count <- decode.optional_field("count", None, decode.optional(decode.int))
  decode.success(GetSimilarSongsParams(id: id, count: count))
}

pub fn encode_get_similar_songs_params(value: GetSimilarSongsParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
    case value.count { Some(v) -> [#("count", json.int(v))] None -> [] },
  ]))
}

pub type GetSongRecentListenersOutput {
  GetSongRecentListenersOutput(listeners: Option(List(SongRecentListenerView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_song_recent_listeners_output() -> GetSongRecentListenersOutput {
  GetSongRecentListenersOutput(listeners: None)
}

pub fn get_song_recent_listeners_output_decoder() -> decode.Decoder(GetSongRecentListenersOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use listeners <- decode.optional_field("listeners", None, decode.optional(decode.list(song_recent_listener_view_decoder())))
  decode.success(GetSongRecentListenersOutput(listeners: listeners))
}

pub fn encode_get_song_recent_listeners_output(value: GetSongRecentListenersOutput) -> json.Json {
  json.object(list.flatten([
    case value.listeners { Some(v) -> [#("listeners", json.array(v, fn(item) { encode_song_recent_listener_view(item) }))] None -> [] },
  ]))
}

pub type GetSongRecentListenersParams {
  GetSongRecentListenersParams(uri: String, offset: Option(Int), limit: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_song_recent_listeners_params(uri: String) -> GetSongRecentListenersParams {
  GetSongRecentListenersParams(uri: uri, offset: None, limit: None)
}

pub fn get_song_recent_listeners_params_decoder() -> decode.Decoder(GetSongRecentListenersParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  decode.success(GetSongRecentListenersParams(uri: uri, offset: offset, limit: limit))
}

pub fn encode_get_song_recent_listeners_params(value: GetSongRecentListenersParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
  ]))
}

pub type GetSongsByGenreOutput {
  GetSongsByGenreOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), songs_by_genre: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_songs_by_genre_output() -> GetSongsByGenreOutput {
  GetSongsByGenreOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, songs_by_genre: None)
}

pub fn get_songs_by_genre_output_decoder() -> decode.Decoder(GetSongsByGenreOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use songs_by_genre <- decode.optional_field("songsByGenre", None, decode.optional(json_value.decoder()))
  decode.success(GetSongsByGenreOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, songs_by_genre: songs_by_genre))
}

pub fn encode_get_songs_by_genre_output(value: GetSongsByGenreOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.songs_by_genre { Some(v) -> [#("songsByGenre", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetSongsByGenreParams {
  GetSongsByGenreParams(genre: String, count: Option(Int), offset: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_songs_by_genre_params(genre: String) -> GetSongsByGenreParams {
  GetSongsByGenreParams(genre: genre, count: None, offset: None)
}

pub fn get_songs_by_genre_params_decoder() -> decode.Decoder(GetSongsByGenreParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use genre <- decode.field("genre", decode.string)
  use count <- decode.optional_field("count", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  decode.success(GetSongsByGenreParams(genre: genre, count: count, offset: offset))
}

pub fn encode_get_songs_by_genre_params(value: GetSongsByGenreParams) -> json.Json {
  json.object(list.flatten([
    [#("genre", json.string(value.genre))],
    case value.count { Some(v) -> [#("count", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
  ]))
}

pub type GetSongsOutput {
  GetSongsOutput(tracks: Option(List(SongViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_songs_output() -> GetSongsOutput {
  GetSongsOutput(tracks: None)
}

pub fn get_songs_output_decoder() -> decode.Decoder(GetSongsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.list(song_view_basic_decoder())))
  decode.success(GetSongsOutput(tracks: tracks))
}

pub fn encode_get_songs_output(value: GetSongsOutput) -> json.Json {
  json.object(list.flatten([
    case value.tracks { Some(v) -> [#("tracks", json.array(v, fn(item) { encode_song_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetSongsParams {
  GetSongsParams(limit: Option(Int), offset: Option(Int), genre: Option(String), mbid: Option(String), isrc: Option(String), spotify_id: Option(String), filter: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_songs_params() -> GetSongsParams {
  GetSongsParams(limit: None, offset: None, genre: None, mbid: None, isrc: None, spotify_id: None, filter: None)
}

pub fn get_songs_params_decoder() -> decode.Decoder(GetSongsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use spotify_id <- decode.optional_field("spotifyId", None, decode.optional(decode.string))
  use filter <- decode.optional_field("filter", None, decode.optional(decode.string))
  decode.success(GetSongsParams(limit: limit, offset: offset, genre: genre, mbid: mbid, isrc: isrc, spotify_id: spotify_id, filter: filter))
}

pub fn encode_get_songs_params(value: GetSongsParams) -> json.Json {
  json.object(list.flatten([
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.spotify_id { Some(v) -> [#("spotifyId", json.string(v))] None -> [] },
    case value.filter { Some(v) -> [#("filter", json.string(v))] None -> [] },
  ]))
}

pub type GetStarredOutput {
  GetStarredOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), starred2: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_starred_output() -> GetStarredOutput {
  GetStarredOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, starred2: None)
}

pub fn get_starred_output_decoder() -> decode.Decoder(GetStarredOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use starred2 <- decode.optional_field("starred2", None, decode.optional(json_value.decoder()))
  decode.success(GetStarredOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, starred2: starred2))
}

pub fn encode_get_starred_output(value: GetStarredOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.starred2 { Some(v) -> [#("starred2", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetStarredParams {
  GetStarredParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_starred_params() -> GetStarredParams {
  GetStarredParams
}

pub fn get_starred_params_decoder() -> decode.Decoder(GetStarredParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetStarredParams)
}

pub fn encode_get_starred_params(_value: GetStarredParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetStatsParams {
  GetStatsParams(did: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_stats_params(did: String) -> GetStatsParams {
  GetStatsParams(did: did)
}

pub fn get_stats_params_decoder() -> decode.Decoder(GetStatsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  decode.success(GetStatsParams(did: did))
}

pub fn encode_get_stats_params(value: GetStatsParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
  ]))
}

pub type GetStoriesParams {
  GetStoriesParams(size: Option(Int), feed: Option(String), following: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_stories_params() -> GetStoriesParams {
  GetStoriesParams(size: None, feed: None, following: None)
}

pub fn get_stories_params_decoder() -> decode.Decoder(GetStoriesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use size <- decode.optional_field("size", None, decode.optional(decode.int))
  use feed <- decode.optional_field("feed", None, decode.optional(decode.string))
  use following <- decode.optional_field("following", None, decode.optional(decode.bool))
  decode.success(GetStoriesParams(size: size, feed: feed, following: following))
}

pub fn encode_get_stories_params(value: GetStoriesParams) -> json.Json {
  json.object(list.flatten([
    case value.size { Some(v) -> [#("size", json.int(v))] None -> [] },
    case value.feed { Some(v) -> [#("feed", json.string(v))] None -> [] },
    case value.following { Some(v) -> [#("following", json.bool(v))] None -> [] },
  ]))
}

pub type GetStreamUrlOutput {
  GetStreamUrlOutput(url: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_stream_url_output(url: String) -> GetStreamUrlOutput {
  GetStreamUrlOutput(url: url)
}

pub fn get_stream_url_output_decoder() -> decode.Decoder(GetStreamUrlOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use url <- decode.field("url", decode.string)
  decode.success(GetStreamUrlOutput(url: url))
}

pub fn encode_get_stream_url_output(value: GetStreamUrlOutput) -> json.Json {
  json.object(list.flatten([
    [#("url", json.string(value.url))],
  ]))
}

pub type GetStreamUrlParams {
  GetStreamUrlParams(id: String, max_bit_rate: Option(Int), format: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_stream_url_params(id: String) -> GetStreamUrlParams {
  GetStreamUrlParams(id: id, max_bit_rate: None, format: None)
}

pub fn get_stream_url_params_decoder() -> decode.Decoder(GetStreamUrlParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  use max_bit_rate <- decode.optional_field("maxBitRate", None, decode.optional(decode.int))
  use format <- decode.optional_field("format", None, decode.optional(decode.string))
  decode.success(GetStreamUrlParams(id: id, max_bit_rate: max_bit_rate, format: format))
}

pub fn encode_get_stream_url_params(value: GetStreamUrlParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
    case value.max_bit_rate { Some(v) -> [#("maxBitRate", json.int(v))] None -> [] },
    case value.format { Some(v) -> [#("format", json.string(v))] None -> [] },
  ]))
}

pub type GetTemporaryLinkParams {
  GetTemporaryLinkParams(path: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_temporary_link_params(path: String) -> GetTemporaryLinkParams {
  GetTemporaryLinkParams(path: path)
}

pub fn get_temporary_link_params_decoder() -> decode.Decoder(GetTemporaryLinkParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use path <- decode.field("path", decode.string)
  decode.success(GetTemporaryLinkParams(path: path))
}

pub fn encode_get_temporary_link_params(value: GetTemporaryLinkParams) -> json.Json {
  json.object(list.flatten([
    [#("path", json.string(value.path))],
  ]))
}

pub type GetTopArtistsOutput {
  GetTopArtistsOutput(artists: Option(List(ArtistViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_top_artists_output() -> GetTopArtistsOutput {
  GetTopArtistsOutput(artists: None)
}

pub fn get_top_artists_output_decoder() -> decode.Decoder(GetTopArtistsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use artists <- decode.optional_field("artists", None, decode.optional(decode.list(artist_view_basic_decoder())))
  decode.success(GetTopArtistsOutput(artists: artists))
}

pub fn encode_get_top_artists_output(value: GetTopArtistsOutput) -> json.Json {
  json.object(list.flatten([
    case value.artists { Some(v) -> [#("artists", json.array(v, fn(item) { encode_artist_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetTopArtistsParams {
  GetTopArtistsParams(did: Option(String), limit: Option(Int), offset: Option(Int), start_date: Option(String), end_date: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_top_artists_params() -> GetTopArtistsParams {
  GetTopArtistsParams(did: None, limit: None, offset: None, start_date: None, end_date: None)
}

pub fn get_top_artists_params_decoder() -> decode.Decoder(GetTopArtistsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use start_date <- decode.optional_field("startDate", None, decode.optional(decode.string))
  use end_date <- decode.optional_field("endDate", None, decode.optional(decode.string))
  decode.success(GetTopArtistsParams(did: did, limit: limit, offset: offset, start_date: start_date, end_date: end_date))
}

pub fn encode_get_top_artists_params(value: GetTopArtistsParams) -> json.Json {
  json.object(list.flatten([
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.start_date { Some(v) -> [#("startDate", json.string(v))] None -> [] },
    case value.end_date { Some(v) -> [#("endDate", json.string(v))] None -> [] },
  ]))
}

pub type GetTopScrobblersOutput {
  GetTopScrobblersOutput(scrobblers: Option(List(ChartsScrobblerViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_top_scrobblers_output() -> GetTopScrobblersOutput {
  GetTopScrobblersOutput(scrobblers: None)
}

pub fn get_top_scrobblers_output_decoder() -> decode.Decoder(GetTopScrobblersOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use scrobblers <- decode.optional_field("scrobblers", None, decode.optional(decode.list(charts_scrobbler_view_basic_decoder())))
  decode.success(GetTopScrobblersOutput(scrobblers: scrobblers))
}

pub fn encode_get_top_scrobblers_output(value: GetTopScrobblersOutput) -> json.Json {
  json.object(list.flatten([
    case value.scrobblers { Some(v) -> [#("scrobblers", json.array(v, fn(item) { encode_charts_scrobbler_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetTopScrobblersParams {
  GetTopScrobblersParams(limit: Option(Int), offset: Option(Int), start_date: Option(String), end_date: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_top_scrobblers_params() -> GetTopScrobblersParams {
  GetTopScrobblersParams(limit: None, offset: None, start_date: None, end_date: None)
}

pub fn get_top_scrobblers_params_decoder() -> decode.Decoder(GetTopScrobblersParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use start_date <- decode.optional_field("startDate", None, decode.optional(decode.string))
  use end_date <- decode.optional_field("endDate", None, decode.optional(decode.string))
  decode.success(GetTopScrobblersParams(limit: limit, offset: offset, start_date: start_date, end_date: end_date))
}

pub fn encode_get_top_scrobblers_params(value: GetTopScrobblersParams) -> json.Json {
  json.object(list.flatten([
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.start_date { Some(v) -> [#("startDate", json.string(v))] None -> [] },
    case value.end_date { Some(v) -> [#("endDate", json.string(v))] None -> [] },
  ]))
}

pub type GetTopSongsOutput {
  GetTopSongsOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), top_songs: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_top_songs_output() -> GetTopSongsOutput {
  GetTopSongsOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, top_songs: None)
}

pub fn get_top_songs_output_decoder() -> decode.Decoder(GetTopSongsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use top_songs <- decode.optional_field("topSongs", None, decode.optional(json_value.decoder()))
  decode.success(GetTopSongsOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, top_songs: top_songs))
}

pub fn encode_get_top_songs_output(value: GetTopSongsOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.top_songs { Some(v) -> [#("topSongs", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetTopSongsParams {
  GetTopSongsParams(artist: String, count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_top_songs_params(artist: String) -> GetTopSongsParams {
  GetTopSongsParams(artist: artist, count: None)
}

pub fn get_top_songs_params_decoder() -> decode.Decoder(GetTopSongsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use artist <- decode.field("artist", decode.string)
  use count <- decode.optional_field("count", None, decode.optional(decode.int))
  decode.success(GetTopSongsParams(artist: artist, count: count))
}

pub fn encode_get_top_songs_params(value: GetTopSongsParams) -> json.Json {
  json.object(list.flatten([
    [#("artist", json.string(value.artist))],
    case value.count { Some(v) -> [#("count", json.int(v))] None -> [] },
  ]))
}

pub type GetTopTracksOutput {
  GetTopTracksOutput(tracks: Option(List(SongViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_top_tracks_output() -> GetTopTracksOutput {
  GetTopTracksOutput(tracks: None)
}

pub fn get_top_tracks_output_decoder() -> decode.Decoder(GetTopTracksOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.list(song_view_basic_decoder())))
  decode.success(GetTopTracksOutput(tracks: tracks))
}

pub fn encode_get_top_tracks_output(value: GetTopTracksOutput) -> json.Json {
  json.object(list.flatten([
    case value.tracks { Some(v) -> [#("tracks", json.array(v, fn(item) { encode_song_view_basic(item) }))] None -> [] },
  ]))
}

pub type GetTopTracksParams {
  GetTopTracksParams(did: Option(String), limit: Option(Int), offset: Option(Int), start_date: Option(String), end_date: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_top_tracks_params() -> GetTopTracksParams {
  GetTopTracksParams(did: None, limit: None, offset: None, start_date: None, end_date: None)
}

pub fn get_top_tracks_params_decoder() -> decode.Decoder(GetTopTracksParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use start_date <- decode.optional_field("startDate", None, decode.optional(decode.string))
  use end_date <- decode.optional_field("endDate", None, decode.optional(decode.string))
  decode.success(GetTopTracksParams(did: did, limit: limit, offset: offset, start_date: start_date, end_date: end_date))
}

pub fn encode_get_top_tracks_params(value: GetTopTracksParams) -> json.Json {
  json.object(list.flatten([
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.start_date { Some(v) -> [#("startDate", json.string(v))] None -> [] },
    case value.end_date { Some(v) -> [#("endDate", json.string(v))] None -> [] },
  ]))
}

pub type GetTrackShoutsOutput {
  GetTrackShoutsOutput(shouts: Option(List(ShoutView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_track_shouts_output() -> GetTrackShoutsOutput {
  GetTrackShoutsOutput(shouts: None)
}

pub fn get_track_shouts_output_decoder() -> decode.Decoder(GetTrackShoutsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use shouts <- decode.optional_field("shouts", None, decode.optional(decode.list(shout_view_decoder())))
  decode.success(GetTrackShoutsOutput(shouts: shouts))
}

pub fn encode_get_track_shouts_output(value: GetTrackShoutsOutput) -> json.Json {
  json.object(list.flatten([
    case value.shouts { Some(v) -> [#("shouts", json.array(v, fn(item) { encode_shout_view(item) }))] None -> [] },
  ]))
}

pub type GetTrackShoutsParams {
  GetTrackShoutsParams(uri: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_track_shouts_params(uri: String) -> GetTrackShoutsParams {
  GetTrackShoutsParams(uri: uri)
}

pub fn get_track_shouts_params_decoder() -> decode.Decoder(GetTrackShoutsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  decode.success(GetTrackShoutsParams(uri: uri))
}

pub fn encode_get_track_shouts_params(value: GetTrackShoutsParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
  ]))
}

pub type GetUnreadCountOutput {
  GetUnreadCountOutput(count: Int)
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_unread_count_output(count: Int) -> GetUnreadCountOutput {
  GetUnreadCountOutput(count: count)
}

pub fn get_unread_count_output_decoder() -> decode.Decoder(GetUnreadCountOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use count <- decode.field("count", decode.int)
  decode.success(GetUnreadCountOutput(count: count))
}

pub fn encode_get_unread_count_output(value: GetUnreadCountOutput) -> json.Json {
  json.object(list.flatten([
    [#("count", json.int(value.count))],
  ]))
}

pub type GetUserOutput {
  GetUserOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), user: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_user_output() -> GetUserOutput {
  GetUserOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, user: None)
}

pub fn get_user_output_decoder() -> decode.Decoder(GetUserOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use user <- decode.optional_field("user", None, decode.optional(json_value.decoder()))
  decode.success(GetUserOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, user: user))
}

pub fn encode_get_user_output(value: GetUserOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.user { Some(v) -> [#("user", json_value.encode(v))] None -> [] },
  ]))
}

pub type GetUserParams {
  GetUserParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_user_params() -> GetUserParams {
  GetUserParams
}

pub fn get_user_params_decoder() -> decode.Decoder(GetUserParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GetUserParams)
}

pub fn encode_get_user_params(_value: GetUserParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GetWrappedParams {
  GetWrappedParams(did: String, year: Option(Int), period: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_get_wrapped_params(did: String) -> GetWrappedParams {
  GetWrappedParams(did: did, year: None, period: None)
}

pub fn get_wrapped_params_decoder() -> decode.Decoder(GetWrappedParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use period <- decode.optional_field("period", None, decode.optional(decode.string))
  decode.success(GetWrappedParams(did: did, year: year, period: period))
}

pub fn encode_get_wrapped_params(value: GetWrappedParams) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.period { Some(v) -> [#("period", json.string(v))] None -> [] },
  ]))
}

pub type GoogledriveDownloadFileParams {
  GoogledriveDownloadFileParams(file_id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_googledrive_download_file_params(file_id: String) -> GoogledriveDownloadFileParams {
  GoogledriveDownloadFileParams(file_id: file_id)
}

pub fn googledrive_download_file_params_decoder() -> decode.Decoder(GoogledriveDownloadFileParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use file_id <- decode.field("fileId", decode.string)
  decode.success(GoogledriveDownloadFileParams(file_id: file_id))
}

pub fn encode_googledrive_download_file_params(value: GoogledriveDownloadFileParams) -> json.Json {
  json.object(list.flatten([
    [#("fileId", json.string(value.file_id))],
  ]))
}

pub type GoogledriveFileListView {
  GoogledriveFileListView(files: Option(List(GoogledriveFileView)), directory: Option(GoogledriveResponseDirectoryView), parent_directory: Option(GoogledriveResponseParentDirectoryView), directories: Option(List(GoogledriveResponseDirectoriesItemView)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_googledrive_file_list_view() -> GoogledriveFileListView {
  GoogledriveFileListView(files: None, directory: None, parent_directory: None, directories: None)
}

pub fn googledrive_file_list_view_decoder() -> decode.Decoder(GoogledriveFileListView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use files <- decode.optional_field("files", None, decode.optional(decode.list(googledrive_file_view_decoder())))
  use directory <- decode.optional_field("directory", None, decode.optional(googledrive_response_directory_view_decoder()))
  use parent_directory <- decode.optional_field("parentDirectory", None, decode.optional(googledrive_response_parent_directory_view_decoder()))
  use directories <- decode.optional_field("directories", None, decode.optional(decode.list(googledrive_response_directories_item_view_decoder())))
  decode.success(GoogledriveFileListView(files: files, directory: directory, parent_directory: parent_directory, directories: directories))
}

pub fn encode_googledrive_file_list_view(value: GoogledriveFileListView) -> json.Json {
  json.object(list.flatten([
    case value.files { Some(v) -> [#("files", json.array(v, fn(item) { encode_googledrive_file_view(item) }))] None -> [] },
    case value.directory { Some(v) -> [#("directory", encode_googledrive_response_directory_view(v))] None -> [] },
    case value.parent_directory { Some(v) -> [#("parentDirectory", encode_googledrive_response_parent_directory_view(v))] None -> [] },
    case value.directories { Some(v) -> [#("directories", json.array(v, fn(item) { encode_googledrive_response_directories_item_view(item) }))] None -> [] },
  ]))
}

pub type GoogledriveFileView {
  GoogledriveFileView(id: Option(String), name: Option(String), file_id: Option(String), directory_id: Option(String), track_id: Option(String), created_at: Option(String), updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_googledrive_file_view() -> GoogledriveFileView {
  GoogledriveFileView(id: None, name: None, file_id: None, directory_id: None, track_id: None, created_at: None, updated_at: None)
}

pub fn googledrive_file_view_decoder() -> decode.Decoder(GoogledriveFileView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use file_id <- decode.optional_field("fileId", None, decode.optional(decode.string))
  use directory_id <- decode.optional_field("directoryId", None, decode.optional(decode.string))
  use track_id <- decode.optional_field("trackId", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(GoogledriveFileView(id: id, name: name, file_id: file_id, directory_id: directory_id, track_id: track_id, created_at: created_at, updated_at: updated_at))
}

pub fn encode_googledrive_file_view(value: GoogledriveFileView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.file_id { Some(v) -> [#("fileId", json.string(v))] None -> [] },
    case value.directory_id { Some(v) -> [#("directoryId", json.string(v))] None -> [] },
    case value.track_id { Some(v) -> [#("trackId", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type GoogledriveGetFilesParams {
  GoogledriveGetFilesParams(at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_googledrive_get_files_params() -> GoogledriveGetFilesParams {
  GoogledriveGetFilesParams(at: None)
}

pub fn googledrive_get_files_params_decoder() -> decode.Decoder(GoogledriveGetFilesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use at <- decode.optional_field("at", None, decode.optional(decode.string))
  decode.success(GoogledriveGetFilesParams(at: at))
}

pub fn encode_googledrive_get_files_params(value: GoogledriveGetFilesParams) -> json.Json {
  json.object(list.flatten([
    case value.at { Some(v) -> [#("at", json.string(v))] None -> [] },
  ]))
}

pub type GoogledriveResponseDirectoriesItemView {
  GoogledriveResponseDirectoriesItemView(id: Option(String), name: Option(String), file_id: Option(String), path: Option(String), parent_id: Option(String), created_at: Option(String), updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_googledrive_response_directories_item_view() -> GoogledriveResponseDirectoriesItemView {
  GoogledriveResponseDirectoriesItemView(id: None, name: None, file_id: None, path: None, parent_id: None, created_at: None, updated_at: None)
}

pub fn googledrive_response_directories_item_view_decoder() -> decode.Decoder(GoogledriveResponseDirectoriesItemView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use file_id <- decode.optional_field("fileId", None, decode.optional(decode.string))
  use path <- decode.optional_field("path", None, decode.optional(decode.string))
  use parent_id <- decode.optional_field("parentId", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(GoogledriveResponseDirectoriesItemView(id: id, name: name, file_id: file_id, path: path, parent_id: parent_id, created_at: created_at, updated_at: updated_at))
}

pub fn encode_googledrive_response_directories_item_view(value: GoogledriveResponseDirectoriesItemView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.file_id { Some(v) -> [#("fileId", json.string(v))] None -> [] },
    case value.path { Some(v) -> [#("path", json.string(v))] None -> [] },
    case value.parent_id { Some(v) -> [#("parentId", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type GoogledriveResponseDirectoryView {
  GoogledriveResponseDirectoryView
}

/// Construct with required fields; optional fields default to None.
pub fn new_googledrive_response_directory_view() -> GoogledriveResponseDirectoryView {
  GoogledriveResponseDirectoryView
}

pub fn googledrive_response_directory_view_decoder() -> decode.Decoder(GoogledriveResponseDirectoryView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GoogledriveResponseDirectoryView)
}

pub fn encode_googledrive_response_directory_view(_value: GoogledriveResponseDirectoryView) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GoogledriveResponseParentDirectoryView {
  GoogledriveResponseParentDirectoryView
}

/// Construct with required fields; optional fields default to None.
pub fn new_googledrive_response_parent_directory_view() -> GoogledriveResponseParentDirectoryView {
  GoogledriveResponseParentDirectoryView
}

pub fn googledrive_response_parent_directory_view_decoder() -> decode.Decoder(GoogledriveResponseParentDirectoryView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(GoogledriveResponseParentDirectoryView)
}

pub fn encode_googledrive_response_parent_directory_view(_value: GoogledriveResponseParentDirectoryView) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type GraphNotFoundActor {
  GraphNotFoundActor(actor: String, not_found: Bool)
}

/// Construct with required fields; optional fields default to None.
pub fn new_graph_not_found_actor(actor: String, not_found: Bool) -> GraphNotFoundActor {
  GraphNotFoundActor(actor: actor, not_found: not_found)
}

pub fn graph_not_found_actor_decoder() -> decode.Decoder(GraphNotFoundActor) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use actor <- decode.field("actor", decode.string)
  use not_found <- decode.field("notFound", decode.bool)
  decode.success(GraphNotFoundActor(actor: actor, not_found: not_found))
}

pub fn encode_graph_not_found_actor(value: GraphNotFoundActor) -> json.Json {
  json.object(list.flatten([
    [#("actor", json.string(value.actor))],
    [#("notFound", json.bool(value.not_found))],
  ]))
}

pub type GraphRelationship {
  GraphRelationship(did: String, following: Option(String), followed_by: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_graph_relationship(did: String) -> GraphRelationship {
  GraphRelationship(did: did, following: None, followed_by: None)
}

pub fn graph_relationship_decoder() -> decode.Decoder(GraphRelationship) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use following <- decode.optional_field("following", None, decode.optional(decode.string))
  use followed_by <- decode.optional_field("followedBy", None, decode.optional(decode.string))
  decode.success(GraphRelationship(did: did, following: following, followed_by: followed_by))
}

pub fn encode_graph_relationship(value: GraphRelationship) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    case value.following { Some(v) -> [#("following", json.string(v))] None -> [] },
    case value.followed_by { Some(v) -> [#("followedBy", json.string(v))] None -> [] },
  ]))
}

pub type InsertDirectoryParams {
  InsertDirectoryParams(uri: String, directory: String, position: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_insert_directory_params(uri: String, directory: String) -> InsertDirectoryParams {
  InsertDirectoryParams(uri: uri, directory: directory, position: None)
}

pub fn insert_directory_params_decoder() -> decode.Decoder(InsertDirectoryParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use directory <- decode.field("directory", decode.string)
  use position <- decode.optional_field("position", None, decode.optional(decode.int))
  decode.success(InsertDirectoryParams(uri: uri, directory: directory, position: position))
}

pub fn encode_insert_directory_params(value: InsertDirectoryParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    [#("directory", json.string(value.directory))],
    case value.position { Some(v) -> [#("position", json.int(v))] None -> [] },
  ]))
}

pub type InsertFilesParams {
  InsertFilesParams(uri: String, files: List(String), position: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_insert_files_params(uri: String, files: List(String)) -> InsertFilesParams {
  InsertFilesParams(uri: uri, files: files, position: None)
}

pub fn insert_files_params_decoder() -> decode.Decoder(InsertFilesParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use files <- decode.field("files", decode.list(decode.string))
  use position <- decode.optional_field("position", None, decode.optional(decode.int))
  decode.success(InsertFilesParams(uri: uri, files: files, position: position))
}

pub fn encode_insert_files_params(value: InsertFilesParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    [#("files", json.array(value.files, fn(item) { json.string(item) }))],
    case value.position { Some(v) -> [#("position", json.int(v))] None -> [] },
  ]))
}

pub type LibraryCreatePlaylistInput {
  LibraryCreatePlaylistInput(name: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_create_playlist_input(name: String) -> LibraryCreatePlaylistInput {
  LibraryCreatePlaylistInput(name: name)
}

pub fn library_create_playlist_input_decoder() -> decode.Decoder(LibraryCreatePlaylistInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use name <- decode.field("name", decode.string)
  decode.success(LibraryCreatePlaylistInput(name: name))
}

pub fn encode_library_create_playlist_input(value: LibraryCreatePlaylistInput) -> json.Json {
  json.object(list.flatten([
    [#("name", json.string(value.name))],
  ]))
}

pub type LibraryCreatePlaylistOutput {
  LibraryCreatePlaylistOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), playlist: Option(json_value.JsonValue), atproto_error: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_create_playlist_output() -> LibraryCreatePlaylistOutput {
  LibraryCreatePlaylistOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, playlist: None, atproto_error: None)
}

pub fn library_create_playlist_output_decoder() -> decode.Decoder(LibraryCreatePlaylistOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use playlist <- decode.optional_field("playlist", None, decode.optional(json_value.decoder()))
  use atproto_error <- decode.optional_field("atprotoError", None, decode.optional(decode.string))
  decode.success(LibraryCreatePlaylistOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, playlist: playlist, atproto_error: atproto_error))
}

pub fn encode_library_create_playlist_output(value: LibraryCreatePlaylistOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.playlist { Some(v) -> [#("playlist", json_value.encode(v))] None -> [] },
    case value.atproto_error { Some(v) -> [#("atprotoError", json.string(v))] None -> [] },
  ]))
}

pub type LibraryGetAlbumOutput {
  LibraryGetAlbumOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), album: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_album_output() -> LibraryGetAlbumOutput {
  LibraryGetAlbumOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, album: None)
}

pub fn library_get_album_output_decoder() -> decode.Decoder(LibraryGetAlbumOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use album <- decode.optional_field("album", None, decode.optional(json_value.decoder()))
  decode.success(LibraryGetAlbumOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, album: album))
}

pub fn encode_library_get_album_output(value: LibraryGetAlbumOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.album { Some(v) -> [#("album", json_value.encode(v))] None -> [] },
  ]))
}

pub type LibraryGetAlbumParams {
  LibraryGetAlbumParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_album_params(id: String) -> LibraryGetAlbumParams {
  LibraryGetAlbumParams(id: id)
}

pub fn library_get_album_params_decoder() -> decode.Decoder(LibraryGetAlbumParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(LibraryGetAlbumParams(id: id))
}

pub fn encode_library_get_album_params(value: LibraryGetAlbumParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type LibraryGetArtistOutput {
  LibraryGetArtistOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), artist: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_artist_output() -> LibraryGetArtistOutput {
  LibraryGetArtistOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, artist: None)
}

pub fn library_get_artist_output_decoder() -> decode.Decoder(LibraryGetArtistOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use artist <- decode.optional_field("artist", None, decode.optional(json_value.decoder()))
  decode.success(LibraryGetArtistOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, artist: artist))
}

pub fn encode_library_get_artist_output(value: LibraryGetArtistOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json_value.encode(v))] None -> [] },
  ]))
}

pub type LibraryGetArtistParams {
  LibraryGetArtistParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_artist_params(id: String) -> LibraryGetArtistParams {
  LibraryGetArtistParams(id: id)
}

pub fn library_get_artist_params_decoder() -> decode.Decoder(LibraryGetArtistParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(LibraryGetArtistParams(id: id))
}

pub fn encode_library_get_artist_params(value: LibraryGetArtistParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type LibraryGetArtistsOutput {
  LibraryGetArtistsOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), artists: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_artists_output() -> LibraryGetArtistsOutput {
  LibraryGetArtistsOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, artists: None)
}

pub fn library_get_artists_output_decoder() -> decode.Decoder(LibraryGetArtistsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use artists <- decode.optional_field("artists", None, decode.optional(json_value.decoder()))
  decode.success(LibraryGetArtistsOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, artists: artists))
}

pub fn encode_library_get_artists_output(value: LibraryGetArtistsOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.artists { Some(v) -> [#("artists", json_value.encode(v))] None -> [] },
  ]))
}

pub type LibraryGetArtistsParams {
  LibraryGetArtistsParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_artists_params() -> LibraryGetArtistsParams {
  LibraryGetArtistsParams
}

pub fn library_get_artists_params_decoder() -> decode.Decoder(LibraryGetArtistsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(LibraryGetArtistsParams)
}

pub fn encode_library_get_artists_params(_value: LibraryGetArtistsParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type LibraryGetPlaylistOutput {
  LibraryGetPlaylistOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), playlist: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_playlist_output() -> LibraryGetPlaylistOutput {
  LibraryGetPlaylistOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, playlist: None)
}

pub fn library_get_playlist_output_decoder() -> decode.Decoder(LibraryGetPlaylistOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use playlist <- decode.optional_field("playlist", None, decode.optional(json_value.decoder()))
  decode.success(LibraryGetPlaylistOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, playlist: playlist))
}

pub fn encode_library_get_playlist_output(value: LibraryGetPlaylistOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.playlist { Some(v) -> [#("playlist", json_value.encode(v))] None -> [] },
  ]))
}

pub type LibraryGetPlaylistParams {
  LibraryGetPlaylistParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_playlist_params(id: String) -> LibraryGetPlaylistParams {
  LibraryGetPlaylistParams(id: id)
}

pub fn library_get_playlist_params_decoder() -> decode.Decoder(LibraryGetPlaylistParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(LibraryGetPlaylistParams(id: id))
}

pub fn encode_library_get_playlist_params(value: LibraryGetPlaylistParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type LibraryGetPlaylistsOutput {
  LibraryGetPlaylistsOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), playlists: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_playlists_output() -> LibraryGetPlaylistsOutput {
  LibraryGetPlaylistsOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, playlists: None)
}

pub fn library_get_playlists_output_decoder() -> decode.Decoder(LibraryGetPlaylistsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use playlists <- decode.optional_field("playlists", None, decode.optional(json_value.decoder()))
  decode.success(LibraryGetPlaylistsOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, playlists: playlists))
}

pub fn encode_library_get_playlists_output(value: LibraryGetPlaylistsOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.playlists { Some(v) -> [#("playlists", json_value.encode(v))] None -> [] },
  ]))
}

pub type LibraryGetPlaylistsParams {
  LibraryGetPlaylistsParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_playlists_params() -> LibraryGetPlaylistsParams {
  LibraryGetPlaylistsParams
}

pub fn library_get_playlists_params_decoder() -> decode.Decoder(LibraryGetPlaylistsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(LibraryGetPlaylistsParams)
}

pub fn encode_library_get_playlists_params(_value: LibraryGetPlaylistsParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type LibraryGetSongOutput {
  LibraryGetSongOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), song: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_song_output() -> LibraryGetSongOutput {
  LibraryGetSongOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, song: None)
}

pub fn library_get_song_output_decoder() -> decode.Decoder(LibraryGetSongOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use song <- decode.optional_field("song", None, decode.optional(json_value.decoder()))
  decode.success(LibraryGetSongOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, song: song))
}

pub fn encode_library_get_song_output(value: LibraryGetSongOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.song { Some(v) -> [#("song", json_value.encode(v))] None -> [] },
  ]))
}

pub type LibraryGetSongParams {
  LibraryGetSongParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_get_song_params(id: String) -> LibraryGetSongParams {
  LibraryGetSongParams(id: id)
}

pub fn library_get_song_params_decoder() -> decode.Decoder(LibraryGetSongParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(LibraryGetSongParams(id: id))
}

pub fn encode_library_get_song_params(value: LibraryGetSongParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type LibrarySearchOutput {
  LibrarySearchOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), search_result3: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_search_output() -> LibrarySearchOutput {
  LibrarySearchOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, search_result3: None)
}

pub fn library_search_output_decoder() -> decode.Decoder(LibrarySearchOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use search_result3 <- decode.optional_field("searchResult3", None, decode.optional(json_value.decoder()))
  decode.success(LibrarySearchOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, search_result3: search_result3))
}

pub fn encode_library_search_output(value: LibrarySearchOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.search_result3 { Some(v) -> [#("searchResult3", json_value.encode(v))] None -> [] },
  ]))
}

pub type LibrarySearchParams {
  LibrarySearchParams(query: String, artist_count: Option(Int), artist_offset: Option(Int), album_count: Option(Int), album_offset: Option(Int), song_count: Option(Int), song_offset: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_search_params(query: String) -> LibrarySearchParams {
  LibrarySearchParams(query: query, artist_count: None, artist_offset: None, album_count: None, album_offset: None, song_count: None, song_offset: None)
}

pub fn library_search_params_decoder() -> decode.Decoder(LibrarySearchParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use query <- decode.field("query", decode.string)
  use artist_count <- decode.optional_field("artistCount", None, decode.optional(decode.int))
  use artist_offset <- decode.optional_field("artistOffset", None, decode.optional(decode.int))
  use album_count <- decode.optional_field("albumCount", None, decode.optional(decode.int))
  use album_offset <- decode.optional_field("albumOffset", None, decode.optional(decode.int))
  use song_count <- decode.optional_field("songCount", None, decode.optional(decode.int))
  use song_offset <- decode.optional_field("songOffset", None, decode.optional(decode.int))
  decode.success(LibrarySearchParams(query: query, artist_count: artist_count, artist_offset: artist_offset, album_count: album_count, album_offset: album_offset, song_count: song_count, song_offset: song_offset))
}

pub fn encode_library_search_params(value: LibrarySearchParams) -> json.Json {
  json.object(list.flatten([
    [#("query", json.string(value.query))],
    case value.artist_count { Some(v) -> [#("artistCount", json.int(v))] None -> [] },
    case value.artist_offset { Some(v) -> [#("artistOffset", json.int(v))] None -> [] },
    case value.album_count { Some(v) -> [#("albumCount", json.int(v))] None -> [] },
    case value.album_offset { Some(v) -> [#("albumOffset", json.int(v))] None -> [] },
    case value.song_count { Some(v) -> [#("songCount", json.int(v))] None -> [] },
    case value.song_offset { Some(v) -> [#("songOffset", json.int(v))] None -> [] },
  ]))
}

pub type LibraryUpdatePlaylistInput {
  LibraryUpdatePlaylistInput(playlist_id: String, name: Option(String), comment: Option(String), song_id_to_add: Option(String), song_index_to_remove: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_update_playlist_input(playlist_id: String) -> LibraryUpdatePlaylistInput {
  LibraryUpdatePlaylistInput(playlist_id: playlist_id, name: None, comment: None, song_id_to_add: None, song_index_to_remove: None)
}

pub fn library_update_playlist_input_decoder() -> decode.Decoder(LibraryUpdatePlaylistInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use playlist_id <- decode.field("playlistId", decode.string)
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use comment <- decode.optional_field("comment", None, decode.optional(decode.string))
  use song_id_to_add <- decode.optional_field("songIdToAdd", None, decode.optional(decode.string))
  use song_index_to_remove <- decode.optional_field("songIndexToRemove", None, decode.optional(decode.int))
  decode.success(LibraryUpdatePlaylistInput(playlist_id: playlist_id, name: name, comment: comment, song_id_to_add: song_id_to_add, song_index_to_remove: song_index_to_remove))
}

pub fn encode_library_update_playlist_input(value: LibraryUpdatePlaylistInput) -> json.Json {
  json.object(list.flatten([
    [#("playlistId", json.string(value.playlist_id))],
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.comment { Some(v) -> [#("comment", json.string(v))] None -> [] },
    case value.song_id_to_add { Some(v) -> [#("songIdToAdd", json.string(v))] None -> [] },
    case value.song_index_to_remove { Some(v) -> [#("songIndexToRemove", json.int(v))] None -> [] },
  ]))
}

pub type LibraryUpdatePlaylistOutput {
  LibraryUpdatePlaylistOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), atproto_error: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_library_update_playlist_output() -> LibraryUpdatePlaylistOutput {
  LibraryUpdatePlaylistOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, atproto_error: None)
}

pub fn library_update_playlist_output_decoder() -> decode.Decoder(LibraryUpdatePlaylistOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use atproto_error <- decode.optional_field("atprotoError", None, decode.optional(decode.string))
  decode.success(LibraryUpdatePlaylistOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, atproto_error: atproto_error))
}

pub fn encode_library_update_playlist_output(value: LibraryUpdatePlaylistOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.atproto_error { Some(v) -> [#("atprotoError", json.string(v))] None -> [] },
  ]))
}

pub type LikeRecord {
  LikeRecord(created_at: String, subject: StrongRef)
}

/// Construct with required fields; optional fields default to None.
pub fn new_like_record(created_at: String, subject: StrongRef) -> LikeRecord {
  LikeRecord(created_at: created_at, subject: subject)
}

pub fn like_record_decoder() -> decode.Decoder(LikeRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use created_at <- decode.field("createdAt", decode.string)
  use subject <- decode.field("subject", strong_ref_decoder())
  decode.success(LikeRecord(created_at: created_at, subject: subject))
}

pub fn encode_like_record(value: LikeRecord) -> json.Json {
  json.object(list.flatten([
    [#("createdAt", json.string(value.created_at))],
    [#("subject", encode_strong_ref(value.subject))],
  ]))
}

pub type LikeShoutInput {
  LikeShoutInput(uri: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_like_shout_input() -> LikeShoutInput {
  LikeShoutInput(uri: None)
}

pub fn like_shout_input_decoder() -> decode.Decoder(LikeShoutInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  decode.success(LikeShoutInput(uri: uri))
}

pub fn encode_like_shout_input(value: LikeShoutInput) -> json.Json {
  json.object(list.flatten([
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
  ]))
}

pub type LikeSongInput {
  LikeSongInput(uri: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_like_song_input() -> LikeSongInput {
  LikeSongInput(uri: None)
}

pub fn like_song_input_decoder() -> decode.Decoder(LikeSongInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  decode.success(LikeSongInput(uri: uri))
}

pub fn encode_like_song_input(value: LikeSongInput) -> json.Json {
  json.object(list.flatten([
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
  ]))
}

pub type ListNotificationsOutput {
  ListNotificationsOutput(notifications: List(NotificationView), unread_count: Int, cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_list_notifications_output(notifications: List(NotificationView), unread_count: Int) -> ListNotificationsOutput {
  ListNotificationsOutput(notifications: notifications, unread_count: unread_count, cursor: None)
}

pub fn list_notifications_output_decoder() -> decode.Decoder(ListNotificationsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use notifications <- decode.field("notifications", decode.list(notification_view_decoder()))
  use unread_count <- decode.field("unreadCount", decode.int)
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(ListNotificationsOutput(notifications: notifications, unread_count: unread_count, cursor: cursor))
}

pub fn encode_list_notifications_output(value: ListNotificationsOutput) -> json.Json {
  json.object(list.flatten([
    [#("notifications", json.array(value.notifications, fn(item) { encode_notification_view(item) }))],
    [#("unreadCount", json.int(value.unread_count))],
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type ListNotificationsParams {
  ListNotificationsParams(limit: Option(Int), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_list_notifications_params() -> ListNotificationsParams {
  ListNotificationsParams(limit: None, cursor: None)
}

pub fn list_notifications_params_decoder() -> decode.Decoder(ListNotificationsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(ListNotificationsParams(limit: limit, cursor: cursor))
}

pub fn encode_list_notifications_params(value: ListNotificationsParams) -> json.Json {
  json.object(list.flatten([
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type ListPresetsOutput {
  ListPresetsOutput(presets: List(EqualizerPresetView))
}

/// Construct with required fields; optional fields default to None.
pub fn new_list_presets_output(presets: List(EqualizerPresetView)) -> ListPresetsOutput {
  ListPresetsOutput(presets: presets)
}

pub fn list_presets_output_decoder() -> decode.Decoder(ListPresetsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use presets <- decode.field("presets", decode.list(equalizer_preset_view_decoder()))
  decode.success(ListPresetsOutput(presets: presets))
}

pub fn encode_list_presets_output(value: ListPresetsOutput) -> json.Json {
  json.object(list.flatten([
    [#("presets", json.array(value.presets, fn(item) { encode_equalizer_preset_view(item) }))],
  ]))
}

pub type ListPresetsParams {
  ListPresetsParams(did: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_list_presets_params() -> ListPresetsParams {
  ListPresetsParams(did: None)
}

pub fn list_presets_params_decoder() -> decode.Decoder(ListPresetsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  decode.success(ListPresetsParams(did: did))
}

pub fn encode_list_presets_params(value: ListPresetsParams) -> json.Json {
  json.object(list.flatten([
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
  ]))
}

pub type MatchSongParams {
  MatchSongParams(title: String, artist: String, album: Option(String), mb_id: Option(String), isrc: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_match_song_params(title: String, artist: String) -> MatchSongParams {
  MatchSongParams(title: title, artist: artist, album: None, mb_id: None, isrc: None)
}

pub fn match_song_params_decoder() -> decode.Decoder(MatchSongParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use mb_id <- decode.optional_field("mbId", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  decode.success(MatchSongParams(title: title, artist: artist, album: album, mb_id: mb_id, isrc: isrc))
}

pub fn encode_match_song_params(value: MatchSongParams) -> json.Json {
  json.object(list.flatten([
    [#("title", json.string(value.title))],
    [#("artist", json.string(value.artist))],
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.mb_id { Some(v) -> [#("mbId", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
  ]))
}

pub type MirrorSourceView {
  MirrorSourceView(provider: String, enabled: Bool, push_enabled: Option(Bool), external_username: Option(String), has_credentials: Bool, last_polled_at: Option(String), last_scrobble_seen_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_mirror_source_view(provider: String, enabled: Bool, has_credentials: Bool) -> MirrorSourceView {
  MirrorSourceView(provider: provider, enabled: enabled, push_enabled: None, external_username: None, has_credentials: has_credentials, last_polled_at: None, last_scrobble_seen_at: None)
}

pub fn mirror_source_view_decoder() -> decode.Decoder(MirrorSourceView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use provider <- decode.field("provider", decode.string)
  use enabled <- decode.field("enabled", decode.bool)
  use push_enabled <- decode.optional_field("pushEnabled", None, decode.optional(decode.bool))
  use external_username <- decode.optional_field("externalUsername", None, decode.optional(decode.string))
  use has_credentials <- decode.field("hasCredentials", decode.bool)
  use last_polled_at <- decode.optional_field("lastPolledAt", None, decode.optional(decode.string))
  use last_scrobble_seen_at <- decode.optional_field("lastScrobbleSeenAt", None, decode.optional(decode.string))
  decode.success(MirrorSourceView(provider: provider, enabled: enabled, push_enabled: push_enabled, external_username: external_username, has_credentials: has_credentials, last_polled_at: last_polled_at, last_scrobble_seen_at: last_scrobble_seen_at))
}

pub fn encode_mirror_source_view(value: MirrorSourceView) -> json.Json {
  json.object(list.flatten([
    [#("provider", json.string(value.provider))],
    [#("enabled", json.bool(value.enabled))],
    case value.push_enabled { Some(v) -> [#("pushEnabled", json.bool(v))] None -> [] },
    case value.external_username { Some(v) -> [#("externalUsername", json.string(v))] None -> [] },
    [#("hasCredentials", json.bool(value.has_credentials))],
    case value.last_polled_at { Some(v) -> [#("lastPolledAt", json.string(v))] None -> [] },
    case value.last_scrobble_seen_at { Some(v) -> [#("lastScrobbleSeenAt", json.string(v))] None -> [] },
  ]))
}

pub type NotificationActor {
  NotificationActor(id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_notification_actor() -> NotificationActor {
  NotificationActor(id: None, did: None, handle: None, display_name: None, avatar: None)
}

pub fn notification_actor_decoder() -> decode.Decoder(NotificationActor) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  decode.success(NotificationActor(id: id, did: did, handle: handle, display_name: display_name, avatar: avatar))
}

pub fn encode_notification_actor(value: NotificationActor) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
  ]))
}

pub type NotificationSubjectView {
  NotificationSubjectView(uri: String, title: Option(String), artist: Option(String), album_art: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_notification_subject_view(uri: String) -> NotificationSubjectView {
  NotificationSubjectView(uri: uri, title: None, artist: None, album_art: None)
}

pub fn notification_subject_view_decoder() -> decode.Decoder(NotificationSubjectView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  decode.success(NotificationSubjectView(uri: uri, title: title, artist: artist, album_art: album_art))
}

pub fn encode_notification_subject_view(value: NotificationSubjectView) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
  ]))
}

pub type NotificationView {
  NotificationView(id: String, type_: String, read: Bool, created_at: String, subject_uri: Option(String), shout_id: Option(String), shout_content: Option(String), actor: Option(NotificationActor), subject: Option(NotificationSubjectView))
}

/// Construct with required fields; optional fields default to None.
pub fn new_notification_view(id: String, type_: String, read: Bool, created_at: String) -> NotificationView {
  NotificationView(id: id, type_: type_, read: read, created_at: created_at, subject_uri: None, shout_id: None, shout_content: None, actor: None, subject: None)
}

pub fn notification_view_decoder() -> decode.Decoder(NotificationView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  use type_ <- decode.field("type", decode.string)
  use read <- decode.field("read", decode.bool)
  use created_at <- decode.field("createdAt", decode.string)
  use subject_uri <- decode.optional_field("subjectUri", None, decode.optional(decode.string))
  use shout_id <- decode.optional_field("shoutId", None, decode.optional(decode.string))
  use shout_content <- decode.optional_field("shoutContent", None, decode.optional(decode.string))
  use actor <- decode.optional_field("actor", None, decode.optional(notification_actor_decoder()))
  use subject <- decode.optional_field("subject", None, decode.optional(notification_subject_view_decoder()))
  decode.success(NotificationView(id: id, type_: type_, read: read, created_at: created_at, subject_uri: subject_uri, shout_id: shout_id, shout_content: shout_content, actor: actor, subject: subject))
}

pub fn encode_notification_view(value: NotificationView) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
    [#("type", json.string(value.type_))],
    [#("read", json.bool(value.read))],
    [#("createdAt", json.string(value.created_at))],
    case value.subject_uri { Some(v) -> [#("subjectUri", json.string(v))] None -> [] },
    case value.shout_id { Some(v) -> [#("shoutId", json.string(v))] None -> [] },
    case value.shout_content { Some(v) -> [#("shoutContent", json.string(v))] None -> [] },
    case value.actor { Some(v) -> [#("actor", encode_notification_actor(v))] None -> [] },
    case value.subject { Some(v) -> [#("subject", encode_notification_subject_view(v))] None -> [] },
  ]))
}

pub type PingOutput {
  PingOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_ping_output() -> PingOutput {
  PingOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None)
}

pub fn ping_output_decoder() -> decode.Decoder(PingOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  decode.success(PingOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic))
}

pub fn encode_ping_output(value: PingOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
  ]))
}

pub type PingParams {
  PingParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_ping_params() -> PingParams {
  PingParams
}

pub fn ping_params_decoder() -> decode.Decoder(PingParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(PingParams)
}

pub fn encode_ping_params(_value: PingParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type PlayDirectoryParams {
  PlayDirectoryParams(player_id: Option(String), directory_id: String, shuffle: Option(Bool), recurse: Option(Bool), position: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_play_directory_params(directory_id: String) -> PlayDirectoryParams {
  PlayDirectoryParams(player_id: None, directory_id: directory_id, shuffle: None, recurse: None, position: None)
}

pub fn play_directory_params_decoder() -> decode.Decoder(PlayDirectoryParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  use directory_id <- decode.field("directoryId", decode.string)
  use shuffle <- decode.optional_field("shuffle", None, decode.optional(decode.bool))
  use recurse <- decode.optional_field("recurse", None, decode.optional(decode.bool))
  use position <- decode.optional_field("position", None, decode.optional(decode.int))
  decode.success(PlayDirectoryParams(player_id: player_id, directory_id: directory_id, shuffle: shuffle, recurse: recurse, position: position))
}

pub fn encode_play_directory_params(value: PlayDirectoryParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
    [#("directoryId", json.string(value.directory_id))],
    case value.shuffle { Some(v) -> [#("shuffle", json.bool(v))] None -> [] },
    case value.recurse { Some(v) -> [#("recurse", json.bool(v))] None -> [] },
    case value.position { Some(v) -> [#("position", json.int(v))] None -> [] },
  ]))
}

pub type PlayerCurrentlyPlayingViewDetailed {
  PlayerCurrentlyPlayingViewDetailed(title: Option(String), device: Option(json_value.JsonValue), shuffle_state: Option(Bool), repeat_state: Option(String), timestamp: Option(Int), context: Option(json_value.JsonValue), progress_ms: Option(Int), item: Option(json_value.JsonValue), currently_playing_type: Option(String), actions: Option(json_value.JsonValue), is_playing: Option(Bool), uri: Option(String), album_uri: Option(String), artist_uri: Option(String), liked: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_player_currently_playing_view_detailed() -> PlayerCurrentlyPlayingViewDetailed {
  PlayerCurrentlyPlayingViewDetailed(title: None, device: None, shuffle_state: None, repeat_state: None, timestamp: None, context: None, progress_ms: None, item: None, currently_playing_type: None, actions: None, is_playing: None, uri: None, album_uri: None, artist_uri: None, liked: None)
}

pub fn player_currently_playing_view_detailed_decoder() -> decode.Decoder(PlayerCurrentlyPlayingViewDetailed) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use device <- decode.optional_field("device", None, decode.optional(json_value.decoder()))
  use shuffle_state <- decode.optional_field("shuffle_state", None, decode.optional(decode.bool))
  use repeat_state <- decode.optional_field("repeat_state", None, decode.optional(decode.string))
  use timestamp <- decode.optional_field("timestamp", None, decode.optional(decode.int))
  use context <- decode.optional_field("context", None, decode.optional(json_value.decoder()))
  use progress_ms <- decode.optional_field("progress_ms", None, decode.optional(decode.int))
  use item <- decode.optional_field("item", None, decode.optional(json_value.decoder()))
  use currently_playing_type <- decode.optional_field("currently_playing_type", None, decode.optional(decode.string))
  use actions <- decode.optional_field("actions", None, decode.optional(json_value.decoder()))
  use is_playing <- decode.optional_field("is_playing", None, decode.optional(decode.bool))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use album_uri <- decode.optional_field("albumUri", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use liked <- decode.optional_field("liked", None, decode.optional(decode.bool))
  decode.success(PlayerCurrentlyPlayingViewDetailed(title: title, device: device, shuffle_state: shuffle_state, repeat_state: repeat_state, timestamp: timestamp, context: context, progress_ms: progress_ms, item: item, currently_playing_type: currently_playing_type, actions: actions, is_playing: is_playing, uri: uri, album_uri: album_uri, artist_uri: artist_uri, liked: liked))
}

pub fn encode_player_currently_playing_view_detailed(value: PlayerCurrentlyPlayingViewDetailed) -> json.Json {
  json.object(list.flatten([
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.device { Some(v) -> [#("device", json_value.encode(v))] None -> [] },
    case value.shuffle_state { Some(v) -> [#("shuffle_state", json.bool(v))] None -> [] },
    case value.repeat_state { Some(v) -> [#("repeat_state", json.string(v))] None -> [] },
    case value.timestamp { Some(v) -> [#("timestamp", json.int(v))] None -> [] },
    case value.context { Some(v) -> [#("context", json_value.encode(v))] None -> [] },
    case value.progress_ms { Some(v) -> [#("progress_ms", json.int(v))] None -> [] },
    case value.item { Some(v) -> [#("item", json_value.encode(v))] None -> [] },
    case value.currently_playing_type { Some(v) -> [#("currently_playing_type", json.string(v))] None -> [] },
    case value.actions { Some(v) -> [#("actions", json_value.encode(v))] None -> [] },
    case value.is_playing { Some(v) -> [#("is_playing", json.bool(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.album_uri { Some(v) -> [#("albumUri", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.liked { Some(v) -> [#("liked", json.bool(v))] None -> [] },
  ]))
}

pub type PlayerGetCurrentlyPlayingParams {
  PlayerGetCurrentlyPlayingParams(player_id: Option(String), actor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_player_get_currently_playing_params() -> PlayerGetCurrentlyPlayingParams {
  PlayerGetCurrentlyPlayingParams(player_id: None, actor: None)
}

pub fn player_get_currently_playing_params_decoder() -> decode.Decoder(PlayerGetCurrentlyPlayingParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  use actor <- decode.optional_field("actor", None, decode.optional(decode.string))
  decode.success(PlayerGetCurrentlyPlayingParams(player_id: player_id, actor: actor))
}

pub fn encode_player_get_currently_playing_params(value: PlayerGetCurrentlyPlayingParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
    case value.actor { Some(v) -> [#("actor", json.string(v))] None -> [] },
  ]))
}

pub type PlayerNextParams {
  PlayerNextParams(player_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_player_next_params() -> PlayerNextParams {
  PlayerNextParams(player_id: None)
}

pub fn player_next_params_decoder() -> decode.Decoder(PlayerNextParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  decode.success(PlayerNextParams(player_id: player_id))
}

pub fn encode_player_next_params(value: PlayerNextParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
  ]))
}

pub type PlayerPauseParams {
  PlayerPauseParams(player_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_player_pause_params() -> PlayerPauseParams {
  PlayerPauseParams(player_id: None)
}

pub fn player_pause_params_decoder() -> decode.Decoder(PlayerPauseParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  decode.success(PlayerPauseParams(player_id: player_id))
}

pub fn encode_player_pause_params(value: PlayerPauseParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
  ]))
}

pub type PlayerPlaybackQueueViewDetailed {
  PlayerPlaybackQueueViewDetailed(tracks: Option(List(SongViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_player_playback_queue_view_detailed() -> PlayerPlaybackQueueViewDetailed {
  PlayerPlaybackQueueViewDetailed(tracks: None)
}

pub fn player_playback_queue_view_detailed_decoder() -> decode.Decoder(PlayerPlaybackQueueViewDetailed) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.list(song_view_basic_decoder())))
  decode.success(PlayerPlaybackQueueViewDetailed(tracks: tracks))
}

pub fn encode_player_playback_queue_view_detailed(value: PlayerPlaybackQueueViewDetailed) -> json.Json {
  json.object(list.flatten([
    case value.tracks { Some(v) -> [#("tracks", json.array(v, fn(item) { encode_song_view_basic(item) }))] None -> [] },
  ]))
}

pub type PlayerPlayParams {
  PlayerPlayParams(player_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_player_play_params() -> PlayerPlayParams {
  PlayerPlayParams(player_id: None)
}

pub fn player_play_params_decoder() -> decode.Decoder(PlayerPlayParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  decode.success(PlayerPlayParams(player_id: player_id))
}

pub fn encode_player_play_params(value: PlayerPlayParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
  ]))
}

pub type PlayerPreviousParams {
  PlayerPreviousParams(player_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_player_previous_params() -> PlayerPreviousParams {
  PlayerPreviousParams(player_id: None)
}

pub fn player_previous_params_decoder() -> decode.Decoder(PlayerPreviousParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  decode.success(PlayerPreviousParams(player_id: player_id))
}

pub fn encode_player_previous_params(value: PlayerPreviousParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
  ]))
}

pub type PlayerSeekParams {
  PlayerSeekParams(player_id: Option(String), position: Int)
}

/// Construct with required fields; optional fields default to None.
pub fn new_player_seek_params(position: Int) -> PlayerSeekParams {
  PlayerSeekParams(player_id: None, position: position)
}

pub fn player_seek_params_decoder() -> decode.Decoder(PlayerSeekParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  use position <- decode.field("position", decode.int)
  decode.success(PlayerSeekParams(player_id: player_id, position: position))
}

pub fn encode_player_seek_params(value: PlayerSeekParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
    [#("position", json.int(value.position))],
  ]))
}

pub type PlayFileParams {
  PlayFileParams(player_id: Option(String), file_id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_play_file_params(file_id: String) -> PlayFileParams {
  PlayFileParams(player_id: None, file_id: file_id)
}

pub fn play_file_params_decoder() -> decode.Decoder(PlayFileParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use player_id <- decode.optional_field("playerId", None, decode.optional(decode.string))
  use file_id <- decode.field("fileId", decode.string)
  decode.success(PlayFileParams(player_id: player_id, file_id: file_id))
}

pub fn encode_play_file_params(value: PlayFileParams) -> json.Json {
  json.object(list.flatten([
    case value.player_id { Some(v) -> [#("playerId", json.string(v))] None -> [] },
    [#("fileId", json.string(value.file_id))],
  ]))
}

pub type PlaylistCreatePlaylistOutput {
  PlaylistCreatePlaylistOutput(uri: String, cid: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_create_playlist_output(uri: String, cid: String) -> PlaylistCreatePlaylistOutput {
  PlaylistCreatePlaylistOutput(uri: uri, cid: cid)
}

pub fn playlist_create_playlist_output_decoder() -> decode.Decoder(PlaylistCreatePlaylistOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use cid <- decode.field("cid", decode.string)
  decode.success(PlaylistCreatePlaylistOutput(uri: uri, cid: cid))
}

pub fn encode_playlist_create_playlist_output(value: PlaylistCreatePlaylistOutput) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    [#("cid", json.string(value.cid))],
  ]))
}

pub type PlaylistCreatePlaylistParams {
  PlaylistCreatePlaylistParams(name: String, description: Option(String), picture_url: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_create_playlist_params(name: String) -> PlaylistCreatePlaylistParams {
  PlaylistCreatePlaylistParams(name: name, description: None, picture_url: None)
}

pub fn playlist_create_playlist_params_decoder() -> decode.Decoder(PlaylistCreatePlaylistParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use name <- decode.field("name", decode.string)
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use picture_url <- decode.optional_field("pictureUrl", None, decode.optional(decode.string))
  decode.success(PlaylistCreatePlaylistParams(name: name, description: description, picture_url: picture_url))
}

pub fn encode_playlist_create_playlist_params(value: PlaylistCreatePlaylistParams) -> json.Json {
  json.object(list.flatten([
    [#("name", json.string(value.name))],
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.picture_url { Some(v) -> [#("pictureUrl", json.string(v))] None -> [] },
  ]))
}

pub type PlaylistGetPlaylistParams {
  PlaylistGetPlaylistParams(uri: String, filter: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_get_playlist_params(uri: String) -> PlaylistGetPlaylistParams {
  PlaylistGetPlaylistParams(uri: uri, filter: None)
}

pub fn playlist_get_playlist_params_decoder() -> decode.Decoder(PlaylistGetPlaylistParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use filter <- decode.optional_field("filter", None, decode.optional(decode.string))
  decode.success(PlaylistGetPlaylistParams(uri: uri, filter: filter))
}

pub fn encode_playlist_get_playlist_params(value: PlaylistGetPlaylistParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.filter { Some(v) -> [#("filter", json.string(v))] None -> [] },
  ]))
}

pub type PlaylistGetPlaylistsOutput {
  PlaylistGetPlaylistsOutput(playlists: Option(List(PlaylistViewBasic)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_get_playlists_output() -> PlaylistGetPlaylistsOutput {
  PlaylistGetPlaylistsOutput(playlists: None)
}

pub fn playlist_get_playlists_output_decoder() -> decode.Decoder(PlaylistGetPlaylistsOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use playlists <- decode.optional_field("playlists", None, decode.optional(decode.list(playlist_view_basic_decoder())))
  decode.success(PlaylistGetPlaylistsOutput(playlists: playlists))
}

pub fn encode_playlist_get_playlists_output(value: PlaylistGetPlaylistsOutput) -> json.Json {
  json.object(list.flatten([
    case value.playlists { Some(v) -> [#("playlists", json.array(v, fn(item) { encode_playlist_view_basic(item) }))] None -> [] },
  ]))
}

pub type PlaylistGetPlaylistsParams {
  PlaylistGetPlaylistsParams(limit: Option(Int), offset: Option(Int), filter: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_get_playlists_params() -> PlaylistGetPlaylistsParams {
  PlaylistGetPlaylistsParams(limit: None, offset: None, filter: None)
}

pub fn playlist_get_playlists_params_decoder() -> decode.Decoder(PlaylistGetPlaylistsParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use limit <- decode.optional_field("limit", None, decode.optional(decode.int))
  use offset <- decode.optional_field("offset", None, decode.optional(decode.int))
  use filter <- decode.optional_field("filter", None, decode.optional(decode.string))
  decode.success(PlaylistGetPlaylistsParams(limit: limit, offset: offset, filter: filter))
}

pub fn encode_playlist_get_playlists_params(value: PlaylistGetPlaylistsParams) -> json.Json {
  json.object(list.flatten([
    case value.limit { Some(v) -> [#("limit", json.int(v))] None -> [] },
    case value.offset { Some(v) -> [#("offset", json.int(v))] None -> [] },
    case value.filter { Some(v) -> [#("filter", json.string(v))] None -> [] },
  ]))
}

pub type PlaylistRecord {
  PlaylistRecord(name: String, description: Option(String), picture: Option(BlobRef), picture_url: Option(String), created_at: String, spotify_link: Option(String), tidal_link: Option(String), youtube_link: Option(String), apple_music_link: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_record(name: String, created_at: String) -> PlaylistRecord {
  PlaylistRecord(name: name, description: None, picture: None, picture_url: None, created_at: created_at, spotify_link: None, tidal_link: None, youtube_link: None, apple_music_link: None)
}

pub fn playlist_record_decoder() -> decode.Decoder(PlaylistRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use name <- decode.field("name", decode.string)
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use picture <- decode.optional_field("picture", None, decode.optional(blob_ref_decoder()))
  use picture_url <- decode.optional_field("pictureUrl", None, decode.optional(decode.string))
  use created_at <- decode.field("createdAt", decode.string)
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  decode.success(PlaylistRecord(name: name, description: description, picture: picture, picture_url: picture_url, created_at: created_at, spotify_link: spotify_link, tidal_link: tidal_link, youtube_link: youtube_link, apple_music_link: apple_music_link))
}

pub fn encode_playlist_record(value: PlaylistRecord) -> json.Json {
  json.object(list.flatten([
    [#("name", json.string(value.name))],
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.picture { Some(v) -> [#("picture", encode_blob_ref(v))] None -> [] },
    case value.picture_url { Some(v) -> [#("pictureUrl", json.string(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
  ]))
}

pub type PlaylistSongRecord {
  PlaylistSongRecord(playlist: StrongRef, song: StrongRef, title: String, artist: String, album: String, album_artist: String, duration: Int, album_art_url: Option(String), added_at: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_song_record(playlist: StrongRef, song: StrongRef, title: String, artist: String, album: String, album_artist: String, duration: Int, added_at: String) -> PlaylistSongRecord {
  PlaylistSongRecord(playlist: playlist, song: song, title: title, artist: artist, album: album, album_artist: album_artist, duration: duration, album_art_url: None, added_at: added_at)
}

pub fn playlist_song_record_decoder() -> decode.Decoder(PlaylistSongRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use playlist <- decode.field("playlist", strong_ref_decoder())
  use song <- decode.field("song", strong_ref_decoder())
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use album <- decode.field("album", decode.string)
  use album_artist <- decode.field("albumArtist", decode.string)
  use duration <- decode.field("duration", decode.int)
  use album_art_url <- decode.optional_field("albumArtUrl", None, decode.optional(decode.string))
  use added_at <- decode.field("addedAt", decode.string)
  decode.success(PlaylistSongRecord(playlist: playlist, song: song, title: title, artist: artist, album: album, album_artist: album_artist, duration: duration, album_art_url: album_art_url, added_at: added_at))
}

pub fn encode_playlist_song_record(value: PlaylistSongRecord) -> json.Json {
  json.object(list.flatten([
    [#("playlist", encode_strong_ref(value.playlist))],
    [#("song", encode_strong_ref(value.song))],
    [#("title", json.string(value.title))],
    [#("artist", json.string(value.artist))],
    [#("album", json.string(value.album))],
    [#("albumArtist", json.string(value.album_artist))],
    [#("duration", json.int(value.duration))],
    case value.album_art_url { Some(v) -> [#("albumArtUrl", json.string(v))] None -> [] },
    [#("addedAt", json.string(value.added_at))],
  ]))
}

pub type PlaylistUpdatePlaylistOutput {
  PlaylistUpdatePlaylistOutput(uri: String, cid: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_update_playlist_output(uri: String, cid: String) -> PlaylistUpdatePlaylistOutput {
  PlaylistUpdatePlaylistOutput(uri: uri, cid: cid)
}

pub fn playlist_update_playlist_output_decoder() -> decode.Decoder(PlaylistUpdatePlaylistOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use cid <- decode.field("cid", decode.string)
  decode.success(PlaylistUpdatePlaylistOutput(uri: uri, cid: cid))
}

pub fn encode_playlist_update_playlist_output(value: PlaylistUpdatePlaylistOutput) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    [#("cid", json.string(value.cid))],
  ]))
}

pub type PlaylistUpdatePlaylistParams {
  PlaylistUpdatePlaylistParams(uri: String, name: Option(String), description: Option(String), picture_url: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_update_playlist_params(uri: String) -> PlaylistUpdatePlaylistParams {
  PlaylistUpdatePlaylistParams(uri: uri, name: None, description: None, picture_url: None)
}

pub fn playlist_update_playlist_params_decoder() -> decode.Decoder(PlaylistUpdatePlaylistParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use picture_url <- decode.optional_field("pictureUrl", None, decode.optional(decode.string))
  decode.success(PlaylistUpdatePlaylistParams(uri: uri, name: name, description: description, picture_url: picture_url))
}

pub fn encode_playlist_update_playlist_params(value: PlaylistUpdatePlaylistParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.picture_url { Some(v) -> [#("pictureUrl", json.string(v))] None -> [] },
  ]))
}

pub type PlaylistViewBasic {
  PlaylistViewBasic(id: Option(String), title: Option(String), uri: Option(String), curator_did: Option(String), curator_handle: Option(String), curator_name: Option(String), curator_avatar_url: Option(String), description: Option(String), cover_image_url: Option(String), created_at: Option(String), track_count: Option(Int), track_arts: Option(List(String)), updated_at: Option(String), curator_d_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_view_basic() -> PlaylistViewBasic {
  PlaylistViewBasic(id: None, title: None, uri: None, curator_did: None, curator_handle: None, curator_name: None, curator_avatar_url: None, description: None, cover_image_url: None, created_at: None, track_count: None, track_arts: None, updated_at: None, curator_d_id: None)
}

pub fn playlist_view_basic_decoder() -> decode.Decoder(PlaylistViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use curator_did <- decode.optional_field("curatorDid", None, decode.optional(decode.string))
  use curator_handle <- decode.optional_field("curatorHandle", None, decode.optional(decode.string))
  use curator_name <- decode.optional_field("curatorName", None, decode.optional(decode.string))
  use curator_avatar_url <- decode.optional_field("curatorAvatarUrl", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use cover_image_url <- decode.optional_field("coverImageUrl", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use track_count <- decode.optional_field("trackCount", None, decode.optional(decode.int))
  use track_arts <- decode.optional_field("trackArts", None, decode.optional(decode.list(decode.string)))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use curator_d_id <- decode.optional_field("curatorDId", None, decode.optional(decode.string))
  decode.success(PlaylistViewBasic(id: id, title: title, uri: uri, curator_did: curator_did, curator_handle: curator_handle, curator_name: curator_name, curator_avatar_url: curator_avatar_url, description: description, cover_image_url: cover_image_url, created_at: created_at, track_count: track_count, track_arts: track_arts, updated_at: updated_at, curator_d_id: curator_d_id))
}

pub fn encode_playlist_view_basic(value: PlaylistViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.curator_did { Some(v) -> [#("curatorDid", json.string(v))] None -> [] },
    case value.curator_handle { Some(v) -> [#("curatorHandle", json.string(v))] None -> [] },
    case value.curator_name { Some(v) -> [#("curatorName", json.string(v))] None -> [] },
    case value.curator_avatar_url { Some(v) -> [#("curatorAvatarUrl", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.cover_image_url { Some(v) -> [#("coverImageUrl", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.track_count { Some(v) -> [#("trackCount", json.int(v))] None -> [] },
    case value.track_arts { Some(v) -> [#("trackArts", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.curator_d_id { Some(v) -> [#("curatorDId", json.string(v))] None -> [] },
  ]))
}

pub type PlaylistViewDetailed {
  PlaylistViewDetailed(id: Option(String), title: Option(String), uri: Option(String), curator_did: Option(String), curator_handle: Option(String), curator_name: Option(String), curator_avatar_url: Option(String), description: Option(String), cover_image_url: Option(String), created_at: Option(String), tracks: Option(List(SongViewBasic)), curator_d_id: Option(String), updated_at: Option(String), track_count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_playlist_view_detailed() -> PlaylistViewDetailed {
  PlaylistViewDetailed(id: None, title: None, uri: None, curator_did: None, curator_handle: None, curator_name: None, curator_avatar_url: None, description: None, cover_image_url: None, created_at: None, tracks: None, curator_d_id: None, updated_at: None, track_count: None)
}

pub fn playlist_view_detailed_decoder() -> decode.Decoder(PlaylistViewDetailed) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use curator_did <- decode.optional_field("curatorDid", None, decode.optional(decode.string))
  use curator_handle <- decode.optional_field("curatorHandle", None, decode.optional(decode.string))
  use curator_name <- decode.optional_field("curatorName", None, decode.optional(decode.string))
  use curator_avatar_url <- decode.optional_field("curatorAvatarUrl", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use cover_image_url <- decode.optional_field("coverImageUrl", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.list(song_view_basic_decoder())))
  use curator_d_id <- decode.optional_field("curatorDId", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use track_count <- decode.optional_field("trackCount", None, decode.optional(decode.int))
  decode.success(PlaylistViewDetailed(id: id, title: title, uri: uri, curator_did: curator_did, curator_handle: curator_handle, curator_name: curator_name, curator_avatar_url: curator_avatar_url, description: description, cover_image_url: cover_image_url, created_at: created_at, tracks: tracks, curator_d_id: curator_d_id, updated_at: updated_at, track_count: track_count))
}

pub fn encode_playlist_view_detailed(value: PlaylistViewDetailed) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.curator_did { Some(v) -> [#("curatorDid", json.string(v))] None -> [] },
    case value.curator_handle { Some(v) -> [#("curatorHandle", json.string(v))] None -> [] },
    case value.curator_name { Some(v) -> [#("curatorName", json.string(v))] None -> [] },
    case value.curator_avatar_url { Some(v) -> [#("curatorAvatarUrl", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.cover_image_url { Some(v) -> [#("coverImageUrl", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.tracks { Some(v) -> [#("tracks", json.array(v, fn(item) { encode_song_view_basic(item) }))] None -> [] },
    case value.curator_d_id { Some(v) -> [#("curatorDId", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.track_count { Some(v) -> [#("trackCount", json.int(v))] None -> [] },
  ]))
}

pub type ProfileRecord {
  ProfileRecord(display_name: Option(String), description: Option(String), avatar: Option(BlobRef), banner: Option(BlobRef), labels: Option(json_value.JsonValue), joined_via_starter_pack: Option(StrongRef), created_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_profile_record() -> ProfileRecord {
  ProfileRecord(display_name: None, description: None, avatar: None, banner: None, labels: None, joined_via_starter_pack: None, created_at: None)
}

pub fn profile_record_decoder() -> decode.Decoder(ProfileRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(blob_ref_decoder()))
  use banner <- decode.optional_field("banner", None, decode.optional(blob_ref_decoder()))
  use labels <- decode.optional_field("labels", None, decode.optional(json_value.decoder()))
  use joined_via_starter_pack <- decode.optional_field("joinedViaStarterPack", None, decode.optional(strong_ref_decoder()))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  decode.success(ProfileRecord(display_name: display_name, description: description, avatar: avatar, banner: banner, labels: labels, joined_via_starter_pack: joined_via_starter_pack, created_at: created_at))
}

pub fn encode_profile_record(value: ProfileRecord) -> json.Json {
  json.object(list.flatten([
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", encode_blob_ref(v))] None -> [] },
    case value.banner { Some(v) -> [#("banner", encode_blob_ref(v))] None -> [] },
    case value.labels { Some(v) -> [#("labels", json_value.encode(v))] None -> [] },
    case value.joined_via_starter_pack { Some(v) -> [#("joinedViaStarterPack", encode_strong_ref(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
  ]))
}

pub type PutAudioSettingsInput {
  PutAudioSettingsInput(crossfade: Option(RockboxCrossfadeSettings), equalizer: Option(RockboxEqualizerSettings), replay_gain: Option(RockboxReplayGainSettings), tone: Option(RockboxToneSettings))
}

/// Construct with required fields; optional fields default to None.
pub fn new_put_audio_settings_input() -> PutAudioSettingsInput {
  PutAudioSettingsInput(crossfade: None, equalizer: None, replay_gain: None, tone: None)
}

pub fn put_audio_settings_input_decoder() -> decode.Decoder(PutAudioSettingsInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use crossfade <- decode.optional_field("crossfade", None, decode.optional(rockbox_crossfade_settings_decoder()))
  use equalizer <- decode.optional_field("equalizer", None, decode.optional(rockbox_equalizer_settings_decoder()))
  use replay_gain <- decode.optional_field("replayGain", None, decode.optional(rockbox_replay_gain_settings_decoder()))
  use tone <- decode.optional_field("tone", None, decode.optional(rockbox_tone_settings_decoder()))
  decode.success(PutAudioSettingsInput(crossfade: crossfade, equalizer: equalizer, replay_gain: replay_gain, tone: tone))
}

pub fn encode_put_audio_settings_input(value: PutAudioSettingsInput) -> json.Json {
  json.object(list.flatten([
    case value.crossfade { Some(v) -> [#("crossfade", encode_rockbox_crossfade_settings(v))] None -> [] },
    case value.equalizer { Some(v) -> [#("equalizer", encode_rockbox_equalizer_settings(v))] None -> [] },
    case value.replay_gain { Some(v) -> [#("replayGain", encode_rockbox_replay_gain_settings(v))] None -> [] },
    case value.tone { Some(v) -> [#("tone", encode_rockbox_tone_settings(v))] None -> [] },
  ]))
}

pub type PutMirrorSourceInput {
  PutMirrorSourceInput(provider: String, enabled: Option(Bool), push_enabled: Option(Bool), external_username: Option(String), api_key: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_put_mirror_source_input(provider: String) -> PutMirrorSourceInput {
  PutMirrorSourceInput(provider: provider, enabled: None, push_enabled: None, external_username: None, api_key: None)
}

pub fn put_mirror_source_input_decoder() -> decode.Decoder(PutMirrorSourceInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use provider <- decode.field("provider", decode.string)
  use enabled <- decode.optional_field("enabled", None, decode.optional(decode.bool))
  use push_enabled <- decode.optional_field("pushEnabled", None, decode.optional(decode.bool))
  use external_username <- decode.optional_field("externalUsername", None, decode.optional(decode.string))
  use api_key <- decode.optional_field("apiKey", None, decode.optional(decode.string))
  decode.success(PutMirrorSourceInput(provider: provider, enabled: enabled, push_enabled: push_enabled, external_username: external_username, api_key: api_key))
}

pub fn encode_put_mirror_source_input(value: PutMirrorSourceInput) -> json.Json {
  json.object(list.flatten([
    [#("provider", json.string(value.provider))],
    case value.enabled { Some(v) -> [#("enabled", json.bool(v))] None -> [] },
    case value.push_enabled { Some(v) -> [#("pushEnabled", json.bool(v))] None -> [] },
    case value.external_username { Some(v) -> [#("externalUsername", json.string(v))] None -> [] },
    case value.api_key { Some(v) -> [#("apiKey", json.string(v))] None -> [] },
  ]))
}

pub type PutPresetInput {
  PutPresetInput(name: String, precut: Option(Int), bands: List(RockboxEqualizerBand))
}

/// Construct with required fields; optional fields default to None.
pub fn new_put_preset_input(name: String, bands: List(RockboxEqualizerBand)) -> PutPresetInput {
  PutPresetInput(name: name, precut: None, bands: bands)
}

pub fn put_preset_input_decoder() -> decode.Decoder(PutPresetInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use name <- decode.field("name", decode.string)
  use precut <- decode.optional_field("precut", None, decode.optional(decode.int))
  use bands <- decode.field("bands", decode.list(rockbox_equalizer_band_decoder()))
  decode.success(PutPresetInput(name: name, precut: precut, bands: bands))
}

pub fn encode_put_preset_input(value: PutPresetInput) -> json.Json {
  json.object(list.flatten([
    [#("name", json.string(value.name))],
    case value.precut { Some(v) -> [#("precut", json.int(v))] None -> [] },
    [#("bands", json.array(value.bands, fn(item) { encode_rockbox_equalizer_band(item) }))],
  ]))
}

pub type RadioRecord {
  RadioRecord(name: String, url: String, description: Option(String), genre: Option(String), logo: Option(BlobRef), website: Option(String), created_at: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_radio_record(name: String, url: String, created_at: String) -> RadioRecord {
  RadioRecord(name: name, url: url, description: None, genre: None, logo: None, website: None, created_at: created_at)
}

pub fn radio_record_decoder() -> decode.Decoder(RadioRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use name <- decode.field("name", decode.string)
  use url <- decode.field("url", decode.string)
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use logo <- decode.optional_field("logo", None, decode.optional(blob_ref_decoder()))
  use website <- decode.optional_field("website", None, decode.optional(decode.string))
  use created_at <- decode.field("createdAt", decode.string)
  decode.success(RadioRecord(name: name, url: url, description: description, genre: genre, logo: logo, website: website, created_at: created_at))
}

pub fn encode_radio_record(value: RadioRecord) -> json.Json {
  json.object(list.flatten([
    [#("name", json.string(value.name))],
    [#("url", json.string(value.url))],
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.logo { Some(v) -> [#("logo", encode_blob_ref(v))] None -> [] },
    case value.website { Some(v) -> [#("website", json.string(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
  ]))
}

pub type RadioViewBasic {
  RadioViewBasic(id: Option(String), name: Option(String), description: Option(String), created_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_radio_view_basic() -> RadioViewBasic {
  RadioViewBasic(id: None, name: None, description: None, created_at: None)
}

pub fn radio_view_basic_decoder() -> decode.Decoder(RadioViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  decode.success(RadioViewBasic(id: id, name: name, description: description, created_at: created_at))
}

pub fn encode_radio_view_basic(value: RadioViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
  ]))
}

pub type RadioViewDetailed {
  RadioViewDetailed(id: Option(String), name: Option(String), description: Option(String), website: Option(String), url: Option(String), genre: Option(String), logo: Option(String), created_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_radio_view_detailed() -> RadioViewDetailed {
  RadioViewDetailed(id: None, name: None, description: None, website: None, url: None, genre: None, logo: None, created_at: None)
}

pub fn radio_view_detailed_decoder() -> decode.Decoder(RadioViewDetailed) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  use website <- decode.optional_field("website", None, decode.optional(decode.string))
  use url <- decode.optional_field("url", None, decode.optional(decode.string))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use logo <- decode.optional_field("logo", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  decode.success(RadioViewDetailed(id: id, name: name, description: description, website: website, url: url, genre: genre, logo: logo, created_at: created_at))
}

pub fn encode_radio_view_detailed(value: RadioViewDetailed) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
    case value.website { Some(v) -> [#("website", json.string(v))] None -> [] },
    case value.url { Some(v) -> [#("url", json.string(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.logo { Some(v) -> [#("logo", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
  ]))
}

pub type RemoveApikeyParams {
  RemoveApikeyParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_remove_apikey_params(id: String) -> RemoveApikeyParams {
  RemoveApikeyParams(id: id)
}

pub fn remove_apikey_params_decoder() -> decode.Decoder(RemoveApikeyParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(RemoveApikeyParams(id: id))
}

pub fn encode_remove_apikey_params(value: RemoveApikeyParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type RemovePlaylistParams {
  RemovePlaylistParams(uri: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_remove_playlist_params(uri: String) -> RemovePlaylistParams {
  RemovePlaylistParams(uri: uri)
}

pub fn remove_playlist_params_decoder() -> decode.Decoder(RemovePlaylistParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  decode.success(RemovePlaylistParams(uri: uri))
}

pub fn encode_remove_playlist_params(value: RemovePlaylistParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
  ]))
}

pub type RemoveShoutParams {
  RemoveShoutParams(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_remove_shout_params(id: String) -> RemoveShoutParams {
  RemoveShoutParams(id: id)
}

pub fn remove_shout_params_decoder() -> decode.Decoder(RemoveShoutParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(RemoveShoutParams(id: id))
}

pub fn encode_remove_shout_params(value: RemoveShoutParams) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type RemoveTrackParams {
  RemoveTrackParams(uri: String, song_uri: Option(String), index: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_remove_track_params(uri: String) -> RemoveTrackParams {
  RemoveTrackParams(uri: uri, song_uri: None, index: None)
}

pub fn remove_track_params_decoder() -> decode.Decoder(RemoveTrackParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use song_uri <- decode.optional_field("songUri", None, decode.optional(decode.string))
  use index <- decode.optional_field("index", None, decode.optional(decode.int))
  decode.success(RemoveTrackParams(uri: uri, song_uri: song_uri, index: index))
}

pub fn encode_remove_track_params(value: RemoveTrackParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.song_uri { Some(v) -> [#("songUri", json.string(v))] None -> [] },
    case value.index { Some(v) -> [#("index", json.int(v))] None -> [] },
  ]))
}

pub type ReplyShoutInput {
  ReplyShoutInput(shout_id: String, message: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_reply_shout_input(shout_id: String, message: String) -> ReplyShoutInput {
  ReplyShoutInput(shout_id: shout_id, message: message)
}

pub fn reply_shout_input_decoder() -> decode.Decoder(ReplyShoutInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use shout_id <- decode.field("shoutId", decode.string)
  use message <- decode.field("message", decode.string)
  decode.success(ReplyShoutInput(shout_id: shout_id, message: message))
}

pub fn encode_reply_shout_input(value: ReplyShoutInput) -> json.Json {
  json.object(list.flatten([
    [#("shoutId", json.string(value.shout_id))],
    [#("message", json.string(value.message))],
  ]))
}

pub type ReportShoutInput {
  ReportShoutInput(shout_id: String, reason: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_report_shout_input(shout_id: String) -> ReportShoutInput {
  ReportShoutInput(shout_id: shout_id, reason: None)
}

pub fn report_shout_input_decoder() -> decode.Decoder(ReportShoutInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use shout_id <- decode.field("shoutId", decode.string)
  use reason <- decode.optional_field("reason", None, decode.optional(decode.string))
  decode.success(ReportShoutInput(shout_id: shout_id, reason: reason))
}

pub fn encode_report_shout_input(value: ReportShoutInput) -> json.Json {
  json.object(list.flatten([
    [#("shoutId", json.string(value.shout_id))],
    case value.reason { Some(v) -> [#("reason", json.string(v))] None -> [] },
  ]))
}

pub type RockboxCrossfadeSettings {
  RockboxCrossfadeSettings(mode: Option(String), fade_in_delay: Option(Int), fade_in_duration: Option(Int), fade_out_delay: Option(Int), fade_out_duration: Option(Int), fade_out_mix_mode: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_rockbox_crossfade_settings() -> RockboxCrossfadeSettings {
  RockboxCrossfadeSettings(mode: None, fade_in_delay: None, fade_in_duration: None, fade_out_delay: None, fade_out_duration: None, fade_out_mix_mode: None)
}

pub fn rockbox_crossfade_settings_decoder() -> decode.Decoder(RockboxCrossfadeSettings) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use mode <- decode.optional_field("mode", None, decode.optional(decode.string))
  use fade_in_delay <- decode.optional_field("fadeInDelay", None, decode.optional(decode.int))
  use fade_in_duration <- decode.optional_field("fadeInDuration", None, decode.optional(decode.int))
  use fade_out_delay <- decode.optional_field("fadeOutDelay", None, decode.optional(decode.int))
  use fade_out_duration <- decode.optional_field("fadeOutDuration", None, decode.optional(decode.int))
  use fade_out_mix_mode <- decode.optional_field("fadeOutMixMode", None, decode.optional(decode.string))
  decode.success(RockboxCrossfadeSettings(mode: mode, fade_in_delay: fade_in_delay, fade_in_duration: fade_in_duration, fade_out_delay: fade_out_delay, fade_out_duration: fade_out_duration, fade_out_mix_mode: fade_out_mix_mode))
}

pub fn encode_rockbox_crossfade_settings(value: RockboxCrossfadeSettings) -> json.Json {
  json.object(list.flatten([
    case value.mode { Some(v) -> [#("mode", json.string(v))] None -> [] },
    case value.fade_in_delay { Some(v) -> [#("fadeInDelay", json.int(v))] None -> [] },
    case value.fade_in_duration { Some(v) -> [#("fadeInDuration", json.int(v))] None -> [] },
    case value.fade_out_delay { Some(v) -> [#("fadeOutDelay", json.int(v))] None -> [] },
    case value.fade_out_duration { Some(v) -> [#("fadeOutDuration", json.int(v))] None -> [] },
    case value.fade_out_mix_mode { Some(v) -> [#("fadeOutMixMode", json.string(v))] None -> [] },
  ]))
}

pub type RockboxEqualizerBand {
  RockboxEqualizerBand(frequency: Int, gain: Int, q: Int)
}

/// Construct with required fields; optional fields default to None.
pub fn new_rockbox_equalizer_band(frequency: Int, gain: Int, q: Int) -> RockboxEqualizerBand {
  RockboxEqualizerBand(frequency: frequency, gain: gain, q: q)
}

pub fn rockbox_equalizer_band_decoder() -> decode.Decoder(RockboxEqualizerBand) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use frequency <- decode.field("frequency", decode.int)
  use gain <- decode.field("gain", decode.int)
  use q <- decode.field("q", decode.int)
  decode.success(RockboxEqualizerBand(frequency: frequency, gain: gain, q: q))
}

pub fn encode_rockbox_equalizer_band(value: RockboxEqualizerBand) -> json.Json {
  json.object(list.flatten([
    [#("frequency", json.int(value.frequency))],
    [#("gain", json.int(value.gain))],
    [#("q", json.int(value.q))],
  ]))
}

pub type RockboxEqualizerSettings {
  RockboxEqualizerSettings(enabled: Option(Bool), precut: Option(Int), bands: Option(List(RockboxEqualizerBand)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_rockbox_equalizer_settings() -> RockboxEqualizerSettings {
  RockboxEqualizerSettings(enabled: None, precut: None, bands: None)
}

pub fn rockbox_equalizer_settings_decoder() -> decode.Decoder(RockboxEqualizerSettings) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use enabled <- decode.optional_field("enabled", None, decode.optional(decode.bool))
  use precut <- decode.optional_field("precut", None, decode.optional(decode.int))
  use bands <- decode.optional_field("bands", None, decode.optional(decode.list(rockbox_equalizer_band_decoder())))
  decode.success(RockboxEqualizerSettings(enabled: enabled, precut: precut, bands: bands))
}

pub fn encode_rockbox_equalizer_settings(value: RockboxEqualizerSettings) -> json.Json {
  json.object(list.flatten([
    case value.enabled { Some(v) -> [#("enabled", json.bool(v))] None -> [] },
    case value.precut { Some(v) -> [#("precut", json.int(v))] None -> [] },
    case value.bands { Some(v) -> [#("bands", json.array(v, fn(item) { encode_rockbox_equalizer_band(item) }))] None -> [] },
  ]))
}

pub type RockboxReplayGainSettings {
  RockboxReplayGainSettings(mode: Option(String), preamp: Option(Int), prevent_clipping: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_rockbox_replay_gain_settings() -> RockboxReplayGainSettings {
  RockboxReplayGainSettings(mode: None, preamp: None, prevent_clipping: None)
}

pub fn rockbox_replay_gain_settings_decoder() -> decode.Decoder(RockboxReplayGainSettings) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use mode <- decode.optional_field("mode", None, decode.optional(decode.string))
  use preamp <- decode.optional_field("preamp", None, decode.optional(decode.int))
  use prevent_clipping <- decode.optional_field("preventClipping", None, decode.optional(decode.bool))
  decode.success(RockboxReplayGainSettings(mode: mode, preamp: preamp, prevent_clipping: prevent_clipping))
}

pub fn encode_rockbox_replay_gain_settings(value: RockboxReplayGainSettings) -> json.Json {
  json.object(list.flatten([
    case value.mode { Some(v) -> [#("mode", json.string(v))] None -> [] },
    case value.preamp { Some(v) -> [#("preamp", json.int(v))] None -> [] },
    case value.prevent_clipping { Some(v) -> [#("preventClipping", json.bool(v))] None -> [] },
  ]))
}

pub type RockboxSettingsView {
  RockboxSettingsView(crossfade: Option(RockboxCrossfadeSettings), equalizer: Option(RockboxEqualizerSettings), replay_gain: Option(RockboxReplayGainSettings), tone: Option(RockboxToneSettings), created_at: String, updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_rockbox_settings_view(created_at: String) -> RockboxSettingsView {
  RockboxSettingsView(crossfade: None, equalizer: None, replay_gain: None, tone: None, created_at: created_at, updated_at: None)
}

pub fn rockbox_settings_view_decoder() -> decode.Decoder(RockboxSettingsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use crossfade <- decode.optional_field("crossfade", None, decode.optional(rockbox_crossfade_settings_decoder()))
  use equalizer <- decode.optional_field("equalizer", None, decode.optional(rockbox_equalizer_settings_decoder()))
  use replay_gain <- decode.optional_field("replayGain", None, decode.optional(rockbox_replay_gain_settings_decoder()))
  use tone <- decode.optional_field("tone", None, decode.optional(rockbox_tone_settings_decoder()))
  use created_at <- decode.field("createdAt", decode.string)
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(RockboxSettingsView(crossfade: crossfade, equalizer: equalizer, replay_gain: replay_gain, tone: tone, created_at: created_at, updated_at: updated_at))
}

pub fn encode_rockbox_settings_view(value: RockboxSettingsView) -> json.Json {
  json.object(list.flatten([
    case value.crossfade { Some(v) -> [#("crossfade", encode_rockbox_crossfade_settings(v))] None -> [] },
    case value.equalizer { Some(v) -> [#("equalizer", encode_rockbox_equalizer_settings(v))] None -> [] },
    case value.replay_gain { Some(v) -> [#("replayGain", encode_rockbox_replay_gain_settings(v))] None -> [] },
    case value.tone { Some(v) -> [#("tone", encode_rockbox_tone_settings(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type RockboxToneSettings {
  RockboxToneSettings(bass: Option(Int), treble: Option(Int), balance: Option(Int), channels: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_rockbox_tone_settings() -> RockboxToneSettings {
  RockboxToneSettings(bass: None, treble: None, balance: None, channels: None)
}

pub fn rockbox_tone_settings_decoder() -> decode.Decoder(RockboxToneSettings) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use bass <- decode.optional_field("bass", None, decode.optional(decode.int))
  use treble <- decode.optional_field("treble", None, decode.optional(decode.int))
  use balance <- decode.optional_field("balance", None, decode.optional(decode.int))
  use channels <- decode.optional_field("channels", None, decode.optional(decode.string))
  decode.success(RockboxToneSettings(bass: bass, treble: treble, balance: balance, channels: channels))
}

pub fn encode_rockbox_tone_settings(value: RockboxToneSettings) -> json.Json {
  json.object(list.flatten([
    case value.bass { Some(v) -> [#("bass", json.int(v))] None -> [] },
    case value.treble { Some(v) -> [#("treble", json.int(v))] None -> [] },
    case value.balance { Some(v) -> [#("balance", json.int(v))] None -> [] },
    case value.channels { Some(v) -> [#("channels", json.string(v))] None -> [] },
  ]))
}

pub type SavePlayQueueInput {
  SavePlayQueueInput(id: Option(String), current: Option(String), position: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_save_play_queue_input() -> SavePlayQueueInput {
  SavePlayQueueInput(id: None, current: None, position: None)
}

pub fn save_play_queue_input_decoder() -> decode.Decoder(SavePlayQueueInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use current <- decode.optional_field("current", None, decode.optional(decode.string))
  use position <- decode.optional_field("position", None, decode.optional(decode.int))
  decode.success(SavePlayQueueInput(id: id, current: current, position: position))
}

pub fn encode_save_play_queue_input(value: SavePlayQueueInput) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.current { Some(v) -> [#("current", json.string(v))] None -> [] },
    case value.position { Some(v) -> [#("position", json.int(v))] None -> [] },
  ]))
}

pub type SavePlayQueueOutput {
  SavePlayQueueOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_save_play_queue_output() -> SavePlayQueueOutput {
  SavePlayQueueOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None)
}

pub fn save_play_queue_output_decoder() -> decode.Decoder(SavePlayQueueOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  decode.success(SavePlayQueueOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic))
}

pub fn encode_save_play_queue_output(value: SavePlayQueueOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
  ]))
}

pub type ScrobbleFirstScrobbleView {
  ScrobbleFirstScrobbleView(handle: Option(String), avatar: Option(String), timestamp: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_scrobble_first_scrobble_view() -> ScrobbleFirstScrobbleView {
  ScrobbleFirstScrobbleView(handle: None, avatar: None, timestamp: None)
}

pub fn scrobble_first_scrobble_view_decoder() -> decode.Decoder(ScrobbleFirstScrobbleView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use timestamp <- decode.optional_field("timestamp", None, decode.optional(decode.string))
  decode.success(ScrobbleFirstScrobbleView(handle: handle, avatar: avatar, timestamp: timestamp))
}

pub fn encode_scrobble_first_scrobble_view(value: ScrobbleFirstScrobbleView) -> json.Json {
  json.object(list.flatten([
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.timestamp { Some(v) -> [#("timestamp", json.string(v))] None -> [] },
  ]))
}

pub type ScrobbleInput {
  ScrobbleInput(id: String, time: Option(Int), submission: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_scrobble_input(id: String) -> ScrobbleInput {
  ScrobbleInput(id: id, time: None, submission: None)
}

pub fn scrobble_input_decoder() -> decode.Decoder(ScrobbleInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  use time <- decode.optional_field("time", None, decode.optional(decode.int))
  use submission <- decode.optional_field("submission", None, decode.optional(decode.bool))
  decode.success(ScrobbleInput(id: id, time: time, submission: submission))
}

pub fn encode_scrobble_input(value: ScrobbleInput) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
    case value.time { Some(v) -> [#("time", json.int(v))] None -> [] },
    case value.submission { Some(v) -> [#("submission", json.bool(v))] None -> [] },
  ]))
}

pub type ScrobbleOutput {
  ScrobbleOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_scrobble_output() -> ScrobbleOutput {
  ScrobbleOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None)
}

pub fn scrobble_output_decoder() -> decode.Decoder(ScrobbleOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  decode.success(ScrobbleOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic))
}

pub fn encode_scrobble_output(value: ScrobbleOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
  ]))
}

pub type ScrobbleRecord {
  ScrobbleRecord(title: String, artist: String, artists: Option(List(ArtistMbid)), album_artist: String, album: String, duration: Int, track_number: Option(Int), disc_number: Option(Int), release_date: Option(String), year: Option(Int), genre: Option(String), tags: Option(List(String)), composer: Option(String), lyrics: Option(String), copyright_message: Option(String), wiki: Option(String), album_art: Option(BlobRef), album_art_url: Option(String), youtube_link: Option(String), spotify_link: Option(String), tidal_link: Option(String), apple_music_link: Option(String), created_at: String, mbid: Option(String), label: Option(String), isrc: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_scrobble_record(title: String, artist: String, album_artist: String, album: String, duration: Int, created_at: String) -> ScrobbleRecord {
  ScrobbleRecord(title: title, artist: artist, artists: None, album_artist: album_artist, album: album, duration: duration, track_number: None, disc_number: None, release_date: None, year: None, genre: None, tags: None, composer: None, lyrics: None, copyright_message: None, wiki: None, album_art: None, album_art_url: None, youtube_link: None, spotify_link: None, tidal_link: None, apple_music_link: None, created_at: created_at, mbid: None, label: None, isrc: None)
}

pub fn scrobble_record_decoder() -> decode.Decoder(ScrobbleRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use artists <- decode.optional_field("artists", None, decode.optional(decode.list(artist_mbid_decoder())))
  use album_artist <- decode.field("albumArtist", decode.string)
  use album <- decode.field("album", decode.string)
  use duration <- decode.field("duration", decode.int)
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use composer <- decode.optional_field("composer", None, decode.optional(decode.string))
  use lyrics <- decode.optional_field("lyrics", None, decode.optional(decode.string))
  use copyright_message <- decode.optional_field("copyrightMessage", None, decode.optional(decode.string))
  use wiki <- decode.optional_field("wiki", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(blob_ref_decoder()))
  use album_art_url <- decode.optional_field("albumArtUrl", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use created_at <- decode.field("createdAt", decode.string)
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use label <- decode.optional_field("label", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  decode.success(ScrobbleRecord(title: title, artist: artist, artists: artists, album_artist: album_artist, album: album, duration: duration, track_number: track_number, disc_number: disc_number, release_date: release_date, year: year, genre: genre, tags: tags, composer: composer, lyrics: lyrics, copyright_message: copyright_message, wiki: wiki, album_art: album_art, album_art_url: album_art_url, youtube_link: youtube_link, spotify_link: spotify_link, tidal_link: tidal_link, apple_music_link: apple_music_link, created_at: created_at, mbid: mbid, label: label, isrc: isrc))
}

pub fn encode_scrobble_record(value: ScrobbleRecord) -> json.Json {
  json.object(list.flatten([
    [#("title", json.string(value.title))],
    [#("artist", json.string(value.artist))],
    case value.artists { Some(v) -> [#("artists", json.array(v, fn(item) { encode_artist_mbid(item) }))] None -> [] },
    [#("albumArtist", json.string(value.album_artist))],
    [#("album", json.string(value.album))],
    [#("duration", json.int(value.duration))],
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.composer { Some(v) -> [#("composer", json.string(v))] None -> [] },
    case value.lyrics { Some(v) -> [#("lyrics", json.string(v))] None -> [] },
    case value.copyright_message { Some(v) -> [#("copyrightMessage", json.string(v))] None -> [] },
    case value.wiki { Some(v) -> [#("wiki", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", encode_blob_ref(v))] None -> [] },
    case value.album_art_url { Some(v) -> [#("albumArtUrl", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.label { Some(v) -> [#("label", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
  ]))
}

pub type ScrobbleViewBasic {
  ScrobbleViewBasic(id: Option(String), track_id: Option(String), title: Option(String), artist: Option(String), artist_uri: Option(String), album_artist: Option(String), album: Option(String), album_uri: Option(String), album_art: Option(String), track_uri: Option(String), handle: Option(String), did: Option(String), avatar: Option(String), created_at: Option(String), uri: Option(String), sha256: Option(String), liked: Option(Bool), likes_count: Option(Int), cover: Option(String), date: Option(String), user: Option(String), user_display_name: Option(String), user_avatar: Option(String), tags: Option(List(String)), mb_id: Option(String), mbid: Option(String), isrc: Option(String), spotify_link: Option(String), composer: Option(String), track_number: Option(Int), duration: Option(Int), youtube_link: Option(String), apple_music_link: Option(String), tidal_link: Option(String), disc_number: Option(Int), genre: Option(String), label: Option(String), copyright_message: Option(String), key: Option(String), xata_version: Option(Int), bpm: Option(Float), updated_at: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_scrobble_view_basic() -> ScrobbleViewBasic {
  ScrobbleViewBasic(id: None, track_id: None, title: None, artist: None, artist_uri: None, album_artist: None, album: None, album_uri: None, album_art: None, track_uri: None, handle: None, did: None, avatar: None, created_at: None, uri: None, sha256: None, liked: None, likes_count: None, cover: None, date: None, user: None, user_display_name: None, user_avatar: None, tags: None, mb_id: None, mbid: None, isrc: None, spotify_link: None, composer: None, track_number: None, duration: None, youtube_link: None, apple_music_link: None, tidal_link: None, disc_number: None, genre: None, label: None, copyright_message: None, key: None, xata_version: None, bpm: None, updated_at: None)
}

pub fn scrobble_view_basic_decoder() -> decode.Decoder(ScrobbleViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use track_id <- decode.optional_field("trackId", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use album_artist <- decode.optional_field("albumArtist", None, decode.optional(decode.string))
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use album_uri <- decode.optional_field("albumUri", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use track_uri <- decode.optional_field("trackUri", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use sha256 <- decode.optional_field("sha256", None, decode.optional(decode.string))
  use liked <- decode.optional_field("liked", None, decode.optional(decode.bool))
  use likes_count <- decode.optional_field("likesCount", None, decode.optional(decode.int))
  use cover <- decode.optional_field("cover", None, decode.optional(decode.string))
  use date <- decode.optional_field("date", None, decode.optional(decode.string))
  use user <- decode.optional_field("user", None, decode.optional(decode.string))
  use user_display_name <- decode.optional_field("userDisplayName", None, decode.optional(decode.string))
  use user_avatar <- decode.optional_field("userAvatar", None, decode.optional(decode.string))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use mb_id <- decode.optional_field("mbId", None, decode.optional(decode.string))
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use composer <- decode.optional_field("composer", None, decode.optional(decode.string))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use duration <- decode.optional_field("duration", None, decode.optional(decode.int))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use label <- decode.optional_field("label", None, decode.optional(decode.string))
  use copyright_message <- decode.optional_field("copyrightMessage", None, decode.optional(decode.string))
  use key <- decode.optional_field("key", None, decode.optional(decode.string))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  use bpm <- decode.optional_field("bpm", None, decode.optional(float_decoder()))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(json_value.decoder()))
  decode.success(ScrobbleViewBasic(id: id, track_id: track_id, title: title, artist: artist, artist_uri: artist_uri, album_artist: album_artist, album: album, album_uri: album_uri, album_art: album_art, track_uri: track_uri, handle: handle, did: did, avatar: avatar, created_at: created_at, uri: uri, sha256: sha256, liked: liked, likes_count: likes_count, cover: cover, date: date, user: user, user_display_name: user_display_name, user_avatar: user_avatar, tags: tags, mb_id: mb_id, mbid: mbid, isrc: isrc, spotify_link: spotify_link, composer: composer, track_number: track_number, duration: duration, youtube_link: youtube_link, apple_music_link: apple_music_link, tidal_link: tidal_link, disc_number: disc_number, genre: genre, label: label, copyright_message: copyright_message, key: key, xata_version: xata_version, bpm: bpm, updated_at: updated_at))
}

pub fn encode_scrobble_view_basic(value: ScrobbleViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.track_id { Some(v) -> [#("trackId", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.album_artist { Some(v) -> [#("albumArtist", json.string(v))] None -> [] },
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.album_uri { Some(v) -> [#("albumUri", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.track_uri { Some(v) -> [#("trackUri", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.sha256 { Some(v) -> [#("sha256", json.string(v))] None -> [] },
    case value.liked { Some(v) -> [#("liked", json.bool(v))] None -> [] },
    case value.likes_count { Some(v) -> [#("likesCount", json.int(v))] None -> [] },
    case value.cover { Some(v) -> [#("cover", json.string(v))] None -> [] },
    case value.date { Some(v) -> [#("date", json.string(v))] None -> [] },
    case value.user { Some(v) -> [#("user", json.string(v))] None -> [] },
    case value.user_display_name { Some(v) -> [#("userDisplayName", json.string(v))] None -> [] },
    case value.user_avatar { Some(v) -> [#("userAvatar", json.string(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.mb_id { Some(v) -> [#("mbId", json.string(v))] None -> [] },
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.composer { Some(v) -> [#("composer", json.string(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.duration { Some(v) -> [#("duration", json.int(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.label { Some(v) -> [#("label", json.string(v))] None -> [] },
    case value.copyright_message { Some(v) -> [#("copyrightMessage", json.string(v))] None -> [] },
    case value.key { Some(v) -> [#("key", json.string(v))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
    case value.bpm { Some(v) -> [#("bpm", json.float(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json_value.encode(v))] None -> [] },
  ]))
}

pub type ScrobbleViewDetailed {
  ScrobbleViewDetailed(id: Option(String), user: Option(String), title: Option(String), artist: Option(String), artist_uri: Option(String), album: Option(String), album_uri: Option(String), cover: Option(String), date: Option(String), uri: Option(String), sha256: Option(String), liked: Option(Bool), track_uri: Option(String), likes_count: Option(Int), listeners: Option(Int), scrobbles: Option(Int), artists: Option(List(ArtistViewBasic)), first_scrobble: Option(ScrobbleFirstScrobbleView), mb_id: Option(String), isrc: Option(String), tags: Option(List(String)), created_at: Option(String), updated_at: Option(String), album_artist: Option(String), track_number: Option(Int), duration: Option(Int), youtube_link: Option(String), spotify_link: Option(String), apple_music_link: Option(String), tidal_link: Option(String), disc_number: Option(Int), lyrics: Option(String), composer: Option(String), genre: Option(String), label: Option(String), copyright_message: Option(String), key: Option(String), acoustid_fingerprint: Option(String), xata_version: Option(Int), mbid: Option(String), bpm: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_scrobble_view_detailed() -> ScrobbleViewDetailed {
  ScrobbleViewDetailed(id: None, user: None, title: None, artist: None, artist_uri: None, album: None, album_uri: None, cover: None, date: None, uri: None, sha256: None, liked: None, track_uri: None, likes_count: None, listeners: None, scrobbles: None, artists: None, first_scrobble: None, mb_id: None, isrc: None, tags: None, created_at: None, updated_at: None, album_artist: None, track_number: None, duration: None, youtube_link: None, spotify_link: None, apple_music_link: None, tidal_link: None, disc_number: None, lyrics: None, composer: None, genre: None, label: None, copyright_message: None, key: None, acoustid_fingerprint: None, xata_version: None, mbid: None, bpm: None)
}

pub fn scrobble_view_detailed_decoder() -> decode.Decoder(ScrobbleViewDetailed) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use user <- decode.optional_field("user", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use album_uri <- decode.optional_field("albumUri", None, decode.optional(decode.string))
  use cover <- decode.optional_field("cover", None, decode.optional(decode.string))
  use date <- decode.optional_field("date", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use sha256 <- decode.optional_field("sha256", None, decode.optional(decode.string))
  use liked <- decode.optional_field("liked", None, decode.optional(decode.bool))
  use track_uri <- decode.optional_field("trackUri", None, decode.optional(decode.string))
  use likes_count <- decode.optional_field("likesCount", None, decode.optional(decode.int))
  use listeners <- decode.optional_field("listeners", None, decode.optional(decode.int))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.int))
  use artists <- decode.optional_field("artists", None, decode.optional(decode.list(artist_view_basic_decoder())))
  use first_scrobble <- decode.optional_field("firstScrobble", None, decode.optional(scrobble_first_scrobble_view_decoder()))
  use mb_id <- decode.optional_field("mbId", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use album_artist <- decode.optional_field("albumArtist", None, decode.optional(decode.string))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use duration <- decode.optional_field("duration", None, decode.optional(decode.int))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use lyrics <- decode.optional_field("lyrics", None, decode.optional(decode.string))
  use composer <- decode.optional_field("composer", None, decode.optional(decode.string))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use label <- decode.optional_field("label", None, decode.optional(decode.string))
  use copyright_message <- decode.optional_field("copyrightMessage", None, decode.optional(decode.string))
  use key <- decode.optional_field("key", None, decode.optional(decode.string))
  use acoustid_fingerprint <- decode.optional_field("acoustidFingerprint", None, decode.optional(decode.string))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use bpm <- decode.optional_field("bpm", None, decode.optional(float_decoder()))
  decode.success(ScrobbleViewDetailed(id: id, user: user, title: title, artist: artist, artist_uri: artist_uri, album: album, album_uri: album_uri, cover: cover, date: date, uri: uri, sha256: sha256, liked: liked, track_uri: track_uri, likes_count: likes_count, listeners: listeners, scrobbles: scrobbles, artists: artists, first_scrobble: first_scrobble, mb_id: mb_id, isrc: isrc, tags: tags, created_at: created_at, updated_at: updated_at, album_artist: album_artist, track_number: track_number, duration: duration, youtube_link: youtube_link, spotify_link: spotify_link, apple_music_link: apple_music_link, tidal_link: tidal_link, disc_number: disc_number, lyrics: lyrics, composer: composer, genre: genre, label: label, copyright_message: copyright_message, key: key, acoustid_fingerprint: acoustid_fingerprint, xata_version: xata_version, mbid: mbid, bpm: bpm))
}

pub fn encode_scrobble_view_detailed(value: ScrobbleViewDetailed) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.user { Some(v) -> [#("user", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.album_uri { Some(v) -> [#("albumUri", json.string(v))] None -> [] },
    case value.cover { Some(v) -> [#("cover", json.string(v))] None -> [] },
    case value.date { Some(v) -> [#("date", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.sha256 { Some(v) -> [#("sha256", json.string(v))] None -> [] },
    case value.liked { Some(v) -> [#("liked", json.bool(v))] None -> [] },
    case value.track_uri { Some(v) -> [#("trackUri", json.string(v))] None -> [] },
    case value.likes_count { Some(v) -> [#("likesCount", json.int(v))] None -> [] },
    case value.listeners { Some(v) -> [#("listeners", json.int(v))] None -> [] },
    case value.scrobbles { Some(v) -> [#("scrobbles", json.int(v))] None -> [] },
    case value.artists { Some(v) -> [#("artists", json.array(v, fn(item) { encode_artist_view_basic(item) }))] None -> [] },
    case value.first_scrobble { Some(v) -> [#("firstScrobble", encode_scrobble_first_scrobble_view(v))] None -> [] },
    case value.mb_id { Some(v) -> [#("mbId", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.album_artist { Some(v) -> [#("albumArtist", json.string(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.duration { Some(v) -> [#("duration", json.int(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.lyrics { Some(v) -> [#("lyrics", json.string(v))] None -> [] },
    case value.composer { Some(v) -> [#("composer", json.string(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.label { Some(v) -> [#("label", json.string(v))] None -> [] },
    case value.copyright_message { Some(v) -> [#("copyrightMessage", json.string(v))] None -> [] },
    case value.key { Some(v) -> [#("key", json.string(v))] None -> [] },
    case value.acoustid_fingerprint { Some(v) -> [#("acoustidFingerprint", json.string(v))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.bpm { Some(v) -> [#("bpm", json.float(v))] None -> [] },
  ]))
}

pub type SettingsRecord {
  SettingsRecord(crossfade: Option(RockboxCrossfadeSettings), equalizer: Option(RockboxEqualizerSettings), replay_gain: Option(RockboxReplayGainSettings), tone: Option(RockboxToneSettings), created_at: String, updated_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_settings_record(created_at: String) -> SettingsRecord {
  SettingsRecord(crossfade: None, equalizer: None, replay_gain: None, tone: None, created_at: created_at, updated_at: None)
}

pub fn settings_record_decoder() -> decode.Decoder(SettingsRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use crossfade <- decode.optional_field("crossfade", None, decode.optional(rockbox_crossfade_settings_decoder()))
  use equalizer <- decode.optional_field("equalizer", None, decode.optional(rockbox_equalizer_settings_decoder()))
  use replay_gain <- decode.optional_field("replayGain", None, decode.optional(rockbox_replay_gain_settings_decoder()))
  use tone <- decode.optional_field("tone", None, decode.optional(rockbox_tone_settings_decoder()))
  use created_at <- decode.field("createdAt", decode.string)
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  decode.success(SettingsRecord(crossfade: crossfade, equalizer: equalizer, replay_gain: replay_gain, tone: tone, created_at: created_at, updated_at: updated_at))
}

pub fn encode_settings_record(value: SettingsRecord) -> json.Json {
  json.object(list.flatten([
    case value.crossfade { Some(v) -> [#("crossfade", encode_rockbox_crossfade_settings(v))] None -> [] },
    case value.equalizer { Some(v) -> [#("equalizer", encode_rockbox_equalizer_settings(v))] None -> [] },
    case value.replay_gain { Some(v) -> [#("replayGain", encode_rockbox_replay_gain_settings(v))] None -> [] },
    case value.tone { Some(v) -> [#("tone", encode_rockbox_tone_settings(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
  ]))
}

pub type ShoutAuthor {
  ShoutAuthor(id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_shout_author() -> ShoutAuthor {
  ShoutAuthor(id: None, did: None, handle: None, display_name: None, avatar: None)
}

pub fn shout_author_decoder() -> decode.Decoder(ShoutAuthor) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  decode.success(ShoutAuthor(id: id, did: did, handle: handle, display_name: display_name, avatar: avatar))
}

pub fn encode_shout_author(value: ShoutAuthor) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
  ]))
}

pub type ShoutGif {
  ShoutGif(url: String, preview_url: Option(String), alt: Option(String), width: Option(Int), height: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_shout_gif(url: String) -> ShoutGif {
  ShoutGif(url: url, preview_url: None, alt: None, width: None, height: None)
}

pub fn shout_gif_decoder() -> decode.Decoder(ShoutGif) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use url <- decode.field("url", decode.string)
  use preview_url <- decode.optional_field("previewUrl", None, decode.optional(decode.string))
  use alt <- decode.optional_field("alt", None, decode.optional(decode.string))
  use width <- decode.optional_field("width", None, decode.optional(decode.int))
  use height <- decode.optional_field("height", None, decode.optional(decode.int))
  decode.success(ShoutGif(url: url, preview_url: preview_url, alt: alt, width: width, height: height))
}

pub fn encode_shout_gif(value: ShoutGif) -> json.Json {
  json.object(list.flatten([
    [#("url", json.string(value.url))],
    case value.preview_url { Some(v) -> [#("previewUrl", json.string(v))] None -> [] },
    case value.alt { Some(v) -> [#("alt", json.string(v))] None -> [] },
    case value.width { Some(v) -> [#("width", json.int(v))] None -> [] },
    case value.height { Some(v) -> [#("height", json.int(v))] None -> [] },
  ]))
}

pub type ShoutMention {
  ShoutMention(did: String, byte_start: Int, byte_end: Int)
}

/// Construct with required fields; optional fields default to None.
pub fn new_shout_mention(did: String, byte_start: Int, byte_end: Int) -> ShoutMention {
  ShoutMention(did: did, byte_start: byte_start, byte_end: byte_end)
}

pub fn shout_mention_decoder() -> decode.Decoder(ShoutMention) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use did <- decode.field("did", decode.string)
  use byte_start <- decode.field("byteStart", decode.int)
  use byte_end <- decode.field("byteEnd", decode.int)
  decode.success(ShoutMention(did: did, byte_start: byte_start, byte_end: byte_end))
}

pub fn encode_shout_mention(value: ShoutMention) -> json.Json {
  json.object(list.flatten([
    [#("did", json.string(value.did))],
    [#("byteStart", json.int(value.byte_start))],
    [#("byteEnd", json.int(value.byte_end))],
  ]))
}

pub type ShoutRecord {
  ShoutRecord(message: Option(String), created_at: String, parent: Option(StrongRef), subject: StrongRef, gif: Option(ShoutGif), facets: Option(List(ShoutMention)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_shout_record(created_at: String, subject: StrongRef) -> ShoutRecord {
  ShoutRecord(message: None, created_at: created_at, parent: None, subject: subject, gif: None, facets: None)
}

pub fn shout_record_decoder() -> decode.Decoder(ShoutRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use message <- decode.optional_field("message", None, decode.optional(decode.string))
  use created_at <- decode.field("createdAt", decode.string)
  use parent <- decode.optional_field("parent", None, decode.optional(strong_ref_decoder()))
  use subject <- decode.field("subject", strong_ref_decoder())
  use gif <- decode.optional_field("gif", None, decode.optional(shout_gif_decoder()))
  use facets <- decode.optional_field("facets", None, decode.optional(decode.list(shout_mention_decoder())))
  decode.success(ShoutRecord(message: message, created_at: created_at, parent: parent, subject: subject, gif: gif, facets: facets))
}

pub fn encode_shout_record(value: ShoutRecord) -> json.Json {
  json.object(list.flatten([
    case value.message { Some(v) -> [#("message", json.string(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
    case value.parent { Some(v) -> [#("parent", encode_strong_ref(v))] None -> [] },
    [#("subject", encode_strong_ref(value.subject))],
    case value.gif { Some(v) -> [#("gif", encode_shout_gif(v))] None -> [] },
    case value.facets { Some(v) -> [#("facets", json.array(v, fn(item) { encode_shout_mention(item) }))] None -> [] },
  ]))
}

pub type ShoutView {
  ShoutView(id: Option(String), message: Option(String), parent: Option(String), created_at: Option(String), author: Option(ShoutAuthor), gif: Option(ShoutGif), facets: Option(List(ShoutMention)), content: Option(String), uri: Option(String), likes: Option(Int), liked: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_shout_view() -> ShoutView {
  ShoutView(id: None, message: None, parent: None, created_at: None, author: None, gif: None, facets: None, content: None, uri: None, likes: None, liked: None)
}

pub fn shout_view_decoder() -> decode.Decoder(ShoutView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use message <- decode.optional_field("message", None, decode.optional(decode.string))
  use parent <- decode.optional_field("parent", None, decode.optional(decode.string))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use author <- decode.optional_field("author", None, decode.optional(shout_author_decoder()))
  use gif <- decode.optional_field("gif", None, decode.optional(shout_gif_decoder()))
  use facets <- decode.optional_field("facets", None, decode.optional(decode.list(shout_mention_decoder())))
  use content <- decode.optional_field("content", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use likes <- decode.optional_field("likes", None, decode.optional(decode.int))
  use liked <- decode.optional_field("liked", None, decode.optional(decode.bool))
  decode.success(ShoutView(id: id, message: message, parent: parent, created_at: created_at, author: author, gif: gif, facets: facets, content: content, uri: uri, likes: likes, liked: liked))
}

pub fn encode_shout_view(value: ShoutView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.message { Some(v) -> [#("message", json.string(v))] None -> [] },
    case value.parent { Some(v) -> [#("parent", json.string(v))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.author { Some(v) -> [#("author", encode_shout_author(v))] None -> [] },
    case value.gif { Some(v) -> [#("gif", encode_shout_gif(v))] None -> [] },
    case value.facets { Some(v) -> [#("facets", json.array(v, fn(item) { encode_shout_mention(item) }))] None -> [] },
    case value.content { Some(v) -> [#("content", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.likes { Some(v) -> [#("likes", json.int(v))] None -> [] },
    case value.liked { Some(v) -> [#("liked", json.bool(v))] None -> [] },
  ]))
}

pub type SongFirstScrobbleView {
  SongFirstScrobbleView(handle: Option(String), avatar: Option(String), timestamp: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_song_first_scrobble_view() -> SongFirstScrobbleView {
  SongFirstScrobbleView(handle: None, avatar: None, timestamp: None)
}

pub fn song_first_scrobble_view_decoder() -> decode.Decoder(SongFirstScrobbleView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use timestamp <- decode.optional_field("timestamp", None, decode.optional(decode.string))
  decode.success(SongFirstScrobbleView(handle: handle, avatar: avatar, timestamp: timestamp))
}

pub fn encode_song_first_scrobble_view(value: SongFirstScrobbleView) -> json.Json {
  json.object(list.flatten([
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.timestamp { Some(v) -> [#("timestamp", json.string(v))] None -> [] },
  ]))
}

pub type SongGetSongParams {
  SongGetSongParams(uri: Option(String), mbid: Option(String), isrc: Option(String), spotify_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_song_get_song_params() -> SongGetSongParams {
  SongGetSongParams(uri: None, mbid: None, isrc: None, spotify_id: None)
}

pub fn song_get_song_params_decoder() -> decode.Decoder(SongGetSongParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use spotify_id <- decode.optional_field("spotifyId", None, decode.optional(decode.string))
  decode.success(SongGetSongParams(uri: uri, mbid: mbid, isrc: isrc, spotify_id: spotify_id))
}

pub fn encode_song_get_song_params(value: SongGetSongParams) -> json.Json {
  json.object(list.flatten([
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.spotify_id { Some(v) -> [#("spotifyId", json.string(v))] None -> [] },
  ]))
}

pub type SongMatchView {
  SongMatchView(id: Option(Int), title: Option(String), artist: Option(String), album: Option(String), album_art: Option(String), isrc: Option(String), duration_ms: Option(Int), track_number: Option(Int), disc_number: Option(Int), link: Option(String), preview: Option(String), rank: Option(Int), explicit: Option(Bool), score: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_song_match_view() -> SongMatchView {
  SongMatchView(id: None, title: None, artist: None, album: None, album_art: None, isrc: None, duration_ms: None, track_number: None, disc_number: None, link: None, preview: None, rank: None, explicit: None, score: None)
}

pub fn song_match_view_decoder() -> decode.Decoder(SongMatchView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.int))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use duration_ms <- decode.optional_field("durationMs", None, decode.optional(decode.int))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use link <- decode.optional_field("link", None, decode.optional(decode.string))
  use preview <- decode.optional_field("preview", None, decode.optional(decode.string))
  use rank <- decode.optional_field("rank", None, decode.optional(decode.int))
  use explicit <- decode.optional_field("explicit", None, decode.optional(decode.bool))
  use score <- decode.optional_field("score", None, decode.optional(decode.int))
  decode.success(SongMatchView(id: id, title: title, artist: artist, album: album, album_art: album_art, isrc: isrc, duration_ms: duration_ms, track_number: track_number, disc_number: disc_number, link: link, preview: preview, rank: rank, explicit: explicit, score: score))
}

pub fn encode_song_match_view(value: SongMatchView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.int(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.duration_ms { Some(v) -> [#("durationMs", json.int(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.link { Some(v) -> [#("link", json.string(v))] None -> [] },
    case value.preview { Some(v) -> [#("preview", json.string(v))] None -> [] },
    case value.rank { Some(v) -> [#("rank", json.int(v))] None -> [] },
    case value.explicit { Some(v) -> [#("explicit", json.bool(v))] None -> [] },
    case value.score { Some(v) -> [#("score", json.int(v))] None -> [] },
  ]))
}

pub type SongRecentListenerView {
  SongRecentListenerView(id: Option(String), did: Option(String), handle: Option(String), display_name: Option(String), avatar: Option(String), timestamp: Option(String), scrobble_uri: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_song_recent_listener_view() -> SongRecentListenerView {
  SongRecentListenerView(id: None, did: None, handle: None, display_name: None, avatar: None, timestamp: None, scrobble_uri: None)
}

pub fn song_recent_listener_view_decoder() -> decode.Decoder(SongRecentListenerView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use did <- decode.optional_field("did", None, decode.optional(decode.string))
  use handle <- decode.optional_field("handle", None, decode.optional(decode.string))
  use display_name <- decode.optional_field("displayName", None, decode.optional(decode.string))
  use avatar <- decode.optional_field("avatar", None, decode.optional(decode.string))
  use timestamp <- decode.optional_field("timestamp", None, decode.optional(decode.string))
  use scrobble_uri <- decode.optional_field("scrobbleUri", None, decode.optional(decode.string))
  decode.success(SongRecentListenerView(id: id, did: did, handle: handle, display_name: display_name, avatar: avatar, timestamp: timestamp, scrobble_uri: scrobble_uri))
}

pub fn encode_song_recent_listener_view(value: SongRecentListenerView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.did { Some(v) -> [#("did", json.string(v))] None -> [] },
    case value.handle { Some(v) -> [#("handle", json.string(v))] None -> [] },
    case value.display_name { Some(v) -> [#("displayName", json.string(v))] None -> [] },
    case value.avatar { Some(v) -> [#("avatar", json.string(v))] None -> [] },
    case value.timestamp { Some(v) -> [#("timestamp", json.string(v))] None -> [] },
    case value.scrobble_uri { Some(v) -> [#("scrobbleUri", json.string(v))] None -> [] },
  ]))
}

pub type SongRecord {
  SongRecord(title: String, artist: String, artists: Option(List(ArtistMbid)), album_artist: String, album: String, duration: Int, track_number: Option(Int), disc_number: Option(Int), release_date: Option(String), year: Option(Int), genre: Option(String), tags: Option(List(String)), composer: Option(String), lyrics: Option(String), copyright_message: Option(String), wiki: Option(String), album_art: Option(BlobRef), album_art_url: Option(String), youtube_link: Option(String), spotify_link: Option(String), tidal_link: Option(String), apple_music_link: Option(String), created_at: String, mbid: Option(String), label: Option(String), isrc: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_song_record(title: String, artist: String, album_artist: String, album: String, duration: Int, created_at: String) -> SongRecord {
  SongRecord(title: title, artist: artist, artists: None, album_artist: album_artist, album: album, duration: duration, track_number: None, disc_number: None, release_date: None, year: None, genre: None, tags: None, composer: None, lyrics: None, copyright_message: None, wiki: None, album_art: None, album_art_url: None, youtube_link: None, spotify_link: None, tidal_link: None, apple_music_link: None, created_at: created_at, mbid: None, label: None, isrc: None)
}

pub fn song_record_decoder() -> decode.Decoder(SongRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use artists <- decode.optional_field("artists", None, decode.optional(decode.list(artist_mbid_decoder())))
  use album_artist <- decode.field("albumArtist", decode.string)
  use album <- decode.field("album", decode.string)
  use duration <- decode.field("duration", decode.int)
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use composer <- decode.optional_field("composer", None, decode.optional(decode.string))
  use lyrics <- decode.optional_field("lyrics", None, decode.optional(decode.string))
  use copyright_message <- decode.optional_field("copyrightMessage", None, decode.optional(decode.string))
  use wiki <- decode.optional_field("wiki", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(blob_ref_decoder()))
  use album_art_url <- decode.optional_field("albumArtUrl", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use created_at <- decode.field("createdAt", decode.string)
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use label <- decode.optional_field("label", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  decode.success(SongRecord(title: title, artist: artist, artists: artists, album_artist: album_artist, album: album, duration: duration, track_number: track_number, disc_number: disc_number, release_date: release_date, year: year, genre: genre, tags: tags, composer: composer, lyrics: lyrics, copyright_message: copyright_message, wiki: wiki, album_art: album_art, album_art_url: album_art_url, youtube_link: youtube_link, spotify_link: spotify_link, tidal_link: tidal_link, apple_music_link: apple_music_link, created_at: created_at, mbid: mbid, label: label, isrc: isrc))
}

pub fn encode_song_record(value: SongRecord) -> json.Json {
  json.object(list.flatten([
    [#("title", json.string(value.title))],
    [#("artist", json.string(value.artist))],
    case value.artists { Some(v) -> [#("artists", json.array(v, fn(item) { encode_artist_mbid(item) }))] None -> [] },
    [#("albumArtist", json.string(value.album_artist))],
    [#("album", json.string(value.album))],
    [#("duration", json.int(value.duration))],
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.composer { Some(v) -> [#("composer", json.string(v))] None -> [] },
    case value.lyrics { Some(v) -> [#("lyrics", json.string(v))] None -> [] },
    case value.copyright_message { Some(v) -> [#("copyrightMessage", json.string(v))] None -> [] },
    case value.wiki { Some(v) -> [#("wiki", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", encode_blob_ref(v))] None -> [] },
    case value.album_art_url { Some(v) -> [#("albumArtUrl", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    [#("createdAt", json.string(value.created_at))],
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.label { Some(v) -> [#("label", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
  ]))
}

pub type SongResponseMbArtistsItemView {
  SongResponseMbArtistsItemView(mbid: Option(String), name: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_song_response_mb_artists_item_view() -> SongResponseMbArtistsItemView {
  SongResponseMbArtistsItemView(mbid: None, name: None)
}

pub fn song_response_mb_artists_item_view_decoder() -> decode.Decoder(SongResponseMbArtistsItemView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  decode.success(SongResponseMbArtistsItemView(mbid: mbid, name: name))
}

pub fn encode_song_response_mb_artists_item_view(value: SongResponseMbArtistsItemView) -> json.Json {
  json.object(list.flatten([
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
  ]))
}

pub type SongViewBasic {
  SongViewBasic(id: Option(String), title: Option(String), artist: Option(String), album_artist: Option(String), album_art: Option(String), uri: Option(String), album: Option(String), duration: Option(Int), track_number: Option(Int), disc_number: Option(Int), play_count: Option(Int), likes_count: Option(Int), liked: Option(Bool), unique_listeners: Option(Int), album_uri: Option(String), artist_uri: Option(String), sha256: Option(String), mbid: Option(String), isrc: Option(String), tags: Option(List(String)), created_at: Option(String), updated_at: Option(String), mb_id: Option(String), youtube_link: Option(String), spotify_link: Option(String), apple_music_link: Option(String), tidal_link: Option(String), lyrics: Option(String), composer: Option(String), genre: Option(String), label: Option(String), copyright_message: Option(String), key: Option(String), acoustid_fingerprint: Option(String), xata_version: Option(Int), bpm: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_song_view_basic() -> SongViewBasic {
  SongViewBasic(id: None, title: None, artist: None, album_artist: None, album_art: None, uri: None, album: None, duration: None, track_number: None, disc_number: None, play_count: None, likes_count: None, liked: None, unique_listeners: None, album_uri: None, artist_uri: None, sha256: None, mbid: None, isrc: None, tags: None, created_at: None, updated_at: None, mb_id: None, youtube_link: None, spotify_link: None, apple_music_link: None, tidal_link: None, lyrics: None, composer: None, genre: None, label: None, copyright_message: None, key: None, acoustid_fingerprint: None, xata_version: None, bpm: None)
}

pub fn song_view_basic_decoder() -> decode.Decoder(SongViewBasic) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album_artist <- decode.optional_field("albumArtist", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use duration <- decode.optional_field("duration", None, decode.optional(decode.int))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  use likes_count <- decode.optional_field("likesCount", None, decode.optional(decode.int))
  use liked <- decode.optional_field("liked", None, decode.optional(decode.bool))
  use unique_listeners <- decode.optional_field("uniqueListeners", None, decode.optional(decode.int))
  use album_uri <- decode.optional_field("albumUri", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use sha256 <- decode.optional_field("sha256", None, decode.optional(decode.string))
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use mb_id <- decode.optional_field("mbId", None, decode.optional(decode.string))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use lyrics <- decode.optional_field("lyrics", None, decode.optional(decode.string))
  use composer <- decode.optional_field("composer", None, decode.optional(decode.string))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use label <- decode.optional_field("label", None, decode.optional(decode.string))
  use copyright_message <- decode.optional_field("copyrightMessage", None, decode.optional(decode.string))
  use key <- decode.optional_field("key", None, decode.optional(decode.string))
  use acoustid_fingerprint <- decode.optional_field("acoustidFingerprint", None, decode.optional(decode.string))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  use bpm <- decode.optional_field("bpm", None, decode.optional(float_decoder()))
  decode.success(SongViewBasic(id: id, title: title, artist: artist, album_artist: album_artist, album_art: album_art, uri: uri, album: album, duration: duration, track_number: track_number, disc_number: disc_number, play_count: play_count, likes_count: likes_count, liked: liked, unique_listeners: unique_listeners, album_uri: album_uri, artist_uri: artist_uri, sha256: sha256, mbid: mbid, isrc: isrc, tags: tags, created_at: created_at, updated_at: updated_at, mb_id: mb_id, youtube_link: youtube_link, spotify_link: spotify_link, apple_music_link: apple_music_link, tidal_link: tidal_link, lyrics: lyrics, composer: composer, genre: genre, label: label, copyright_message: copyright_message, key: key, acoustid_fingerprint: acoustid_fingerprint, xata_version: xata_version, bpm: bpm))
}

pub fn encode_song_view_basic(value: SongViewBasic) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album_artist { Some(v) -> [#("albumArtist", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.duration { Some(v) -> [#("duration", json.int(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
    case value.likes_count { Some(v) -> [#("likesCount", json.int(v))] None -> [] },
    case value.liked { Some(v) -> [#("liked", json.bool(v))] None -> [] },
    case value.unique_listeners { Some(v) -> [#("uniqueListeners", json.int(v))] None -> [] },
    case value.album_uri { Some(v) -> [#("albumUri", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.sha256 { Some(v) -> [#("sha256", json.string(v))] None -> [] },
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.mb_id { Some(v) -> [#("mbId", json.string(v))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.lyrics { Some(v) -> [#("lyrics", json.string(v))] None -> [] },
    case value.composer { Some(v) -> [#("composer", json.string(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.label { Some(v) -> [#("label", json.string(v))] None -> [] },
    case value.copyright_message { Some(v) -> [#("copyrightMessage", json.string(v))] None -> [] },
    case value.key { Some(v) -> [#("key", json.string(v))] None -> [] },
    case value.acoustid_fingerprint { Some(v) -> [#("acoustidFingerprint", json.string(v))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
    case value.bpm { Some(v) -> [#("bpm", json.float(v))] None -> [] },
  ]))
}

pub type SongViewDetailed {
  SongViewDetailed(id: Option(String), title: Option(String), artist: Option(String), album_artist: Option(String), album_art: Option(String), uri: Option(String), album: Option(String), duration: Option(Int), track_number: Option(Int), disc_number: Option(Int), play_count: Option(Int), likes_count: Option(Int), liked: Option(Bool), unique_listeners: Option(Int), album_uri: Option(String), artist_uri: Option(String), sha256: Option(String), mbid: Option(String), isrc: Option(String), tags: Option(List(String)), created_at: Option(String), artists: Option(List(ArtistViewBasic)), first_scrobble: Option(SongFirstScrobbleView), matches: Option(List(SongMatchView)), mb_id: Option(String), updated_at: Option(String), release_date: Option(String), year: Option(Int), artist_picture: Option(String), genres: Option(List(String)), mb_artists: Option(List(SongResponseMbArtistsItemView)), youtube_link: Option(String), spotify_link: Option(String), apple_music_link: Option(String), tidal_link: Option(String), lyrics: Option(String), composer: Option(String), genre: Option(String), label: Option(String), copyright_message: Option(String), key: Option(String), acoustid_fingerprint: Option(String), xata_version: Option(Int), bpm: Option(Float))
}

/// Construct with required fields; optional fields default to None.
pub fn new_song_view_detailed() -> SongViewDetailed {
  SongViewDetailed(id: None, title: None, artist: None, album_artist: None, album_art: None, uri: None, album: None, duration: None, track_number: None, disc_number: None, play_count: None, likes_count: None, liked: None, unique_listeners: None, album_uri: None, artist_uri: None, sha256: None, mbid: None, isrc: None, tags: None, created_at: None, artists: None, first_scrobble: None, matches: None, mb_id: None, updated_at: None, release_date: None, year: None, artist_picture: None, genres: None, mb_artists: None, youtube_link: None, spotify_link: None, apple_music_link: None, tidal_link: None, lyrics: None, composer: None, genre: None, label: None, copyright_message: None, key: None, acoustid_fingerprint: None, xata_version: None, bpm: None)
}

pub fn song_view_detailed_decoder() -> decode.Decoder(SongViewDetailed) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album_artist <- decode.optional_field("albumArtist", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use duration <- decode.optional_field("duration", None, decode.optional(decode.int))
  use track_number <- decode.optional_field("trackNumber", None, decode.optional(decode.int))
  use disc_number <- decode.optional_field("discNumber", None, decode.optional(decode.int))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  use likes_count <- decode.optional_field("likesCount", None, decode.optional(decode.int))
  use liked <- decode.optional_field("liked", None, decode.optional(decode.bool))
  use unique_listeners <- decode.optional_field("uniqueListeners", None, decode.optional(decode.int))
  use album_uri <- decode.optional_field("albumUri", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use sha256 <- decode.optional_field("sha256", None, decode.optional(decode.string))
  use mbid <- decode.optional_field("mbid", None, decode.optional(decode.string))
  use isrc <- decode.optional_field("isrc", None, decode.optional(decode.string))
  use tags <- decode.optional_field("tags", None, decode.optional(decode.list(decode.string)))
  use created_at <- decode.optional_field("createdAt", None, decode.optional(decode.string))
  use artists <- decode.optional_field("artists", None, decode.optional(decode.list(artist_view_basic_decoder())))
  use first_scrobble <- decode.optional_field("firstScrobble", None, decode.optional(song_first_scrobble_view_decoder()))
  use matches <- decode.optional_field("matches", None, decode.optional(decode.list(song_match_view_decoder())))
  use mb_id <- decode.optional_field("mbId", None, decode.optional(decode.string))
  use updated_at <- decode.optional_field("updatedAt", None, decode.optional(decode.string))
  use release_date <- decode.optional_field("releaseDate", None, decode.optional(decode.string))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use artist_picture <- decode.optional_field("artistPicture", None, decode.optional(decode.string))
  use genres <- decode.optional_field("genres", None, decode.optional(decode.list(decode.string)))
  use mb_artists <- decode.optional_field("mbArtists", None, decode.optional(decode.list(song_response_mb_artists_item_view_decoder())))
  use youtube_link <- decode.optional_field("youtubeLink", None, decode.optional(decode.string))
  use spotify_link <- decode.optional_field("spotifyLink", None, decode.optional(decode.string))
  use apple_music_link <- decode.optional_field("appleMusicLink", None, decode.optional(decode.string))
  use tidal_link <- decode.optional_field("tidalLink", None, decode.optional(decode.string))
  use lyrics <- decode.optional_field("lyrics", None, decode.optional(decode.string))
  use composer <- decode.optional_field("composer", None, decode.optional(decode.string))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use label <- decode.optional_field("label", None, decode.optional(decode.string))
  use copyright_message <- decode.optional_field("copyrightMessage", None, decode.optional(decode.string))
  use key <- decode.optional_field("key", None, decode.optional(decode.string))
  use acoustid_fingerprint <- decode.optional_field("acoustidFingerprint", None, decode.optional(decode.string))
  use xata_version <- decode.optional_field("xataVersion", None, decode.optional(decode.int))
  use bpm <- decode.optional_field("bpm", None, decode.optional(float_decoder()))
  decode.success(SongViewDetailed(id: id, title: title, artist: artist, album_artist: album_artist, album_art: album_art, uri: uri, album: album, duration: duration, track_number: track_number, disc_number: disc_number, play_count: play_count, likes_count: likes_count, liked: liked, unique_listeners: unique_listeners, album_uri: album_uri, artist_uri: artist_uri, sha256: sha256, mbid: mbid, isrc: isrc, tags: tags, created_at: created_at, artists: artists, first_scrobble: first_scrobble, matches: matches, mb_id: mb_id, updated_at: updated_at, release_date: release_date, year: year, artist_picture: artist_picture, genres: genres, mb_artists: mb_artists, youtube_link: youtube_link, spotify_link: spotify_link, apple_music_link: apple_music_link, tidal_link: tidal_link, lyrics: lyrics, composer: composer, genre: genre, label: label, copyright_message: copyright_message, key: key, acoustid_fingerprint: acoustid_fingerprint, xata_version: xata_version, bpm: bpm))
}

pub fn encode_song_view_detailed(value: SongViewDetailed) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album_artist { Some(v) -> [#("albumArtist", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.duration { Some(v) -> [#("duration", json.int(v))] None -> [] },
    case value.track_number { Some(v) -> [#("trackNumber", json.int(v))] None -> [] },
    case value.disc_number { Some(v) -> [#("discNumber", json.int(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
    case value.likes_count { Some(v) -> [#("likesCount", json.int(v))] None -> [] },
    case value.liked { Some(v) -> [#("liked", json.bool(v))] None -> [] },
    case value.unique_listeners { Some(v) -> [#("uniqueListeners", json.int(v))] None -> [] },
    case value.album_uri { Some(v) -> [#("albumUri", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.sha256 { Some(v) -> [#("sha256", json.string(v))] None -> [] },
    case value.mbid { Some(v) -> [#("mbid", json.string(v))] None -> [] },
    case value.isrc { Some(v) -> [#("isrc", json.string(v))] None -> [] },
    case value.tags { Some(v) -> [#("tags", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.created_at { Some(v) -> [#("createdAt", json.string(v))] None -> [] },
    case value.artists { Some(v) -> [#("artists", json.array(v, fn(item) { encode_artist_view_basic(item) }))] None -> [] },
    case value.first_scrobble { Some(v) -> [#("firstScrobble", encode_song_first_scrobble_view(v))] None -> [] },
    case value.matches { Some(v) -> [#("matches", json.array(v, fn(item) { encode_song_match_view(item) }))] None -> [] },
    case value.mb_id { Some(v) -> [#("mbId", json.string(v))] None -> [] },
    case value.updated_at { Some(v) -> [#("updatedAt", json.string(v))] None -> [] },
    case value.release_date { Some(v) -> [#("releaseDate", json.string(v))] None -> [] },
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.artist_picture { Some(v) -> [#("artistPicture", json.string(v))] None -> [] },
    case value.genres { Some(v) -> [#("genres", json.array(v, fn(item) { json.string(item) }))] None -> [] },
    case value.mb_artists { Some(v) -> [#("mbArtists", json.array(v, fn(item) { encode_song_response_mb_artists_item_view(item) }))] None -> [] },
    case value.youtube_link { Some(v) -> [#("youtubeLink", json.string(v))] None -> [] },
    case value.spotify_link { Some(v) -> [#("spotifyLink", json.string(v))] None -> [] },
    case value.apple_music_link { Some(v) -> [#("appleMusicLink", json.string(v))] None -> [] },
    case value.tidal_link { Some(v) -> [#("tidalLink", json.string(v))] None -> [] },
    case value.lyrics { Some(v) -> [#("lyrics", json.string(v))] None -> [] },
    case value.composer { Some(v) -> [#("composer", json.string(v))] None -> [] },
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.label { Some(v) -> [#("label", json.string(v))] None -> [] },
    case value.copyright_message { Some(v) -> [#("copyrightMessage", json.string(v))] None -> [] },
    case value.key { Some(v) -> [#("key", json.string(v))] None -> [] },
    case value.acoustid_fingerprint { Some(v) -> [#("acoustidFingerprint", json.string(v))] None -> [] },
    case value.xata_version { Some(v) -> [#("xataVersion", json.int(v))] None -> [] },
    case value.bpm { Some(v) -> [#("bpm", json.float(v))] None -> [] },
  ]))
}

pub type SpotifyGetCurrentlyPlayingParams {
  SpotifyGetCurrentlyPlayingParams(actor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_spotify_get_currently_playing_params() -> SpotifyGetCurrentlyPlayingParams {
  SpotifyGetCurrentlyPlayingParams(actor: None)
}

pub fn spotify_get_currently_playing_params_decoder() -> decode.Decoder(SpotifyGetCurrentlyPlayingParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use actor <- decode.optional_field("actor", None, decode.optional(decode.string))
  decode.success(SpotifyGetCurrentlyPlayingParams(actor: actor))
}

pub fn encode_spotify_get_currently_playing_params(value: SpotifyGetCurrentlyPlayingParams) -> json.Json {
  json.object(list.flatten([
    case value.actor { Some(v) -> [#("actor", json.string(v))] None -> [] },
  ]))
}

pub type SpotifySeekParams {
  SpotifySeekParams(position: Int)
}

/// Construct with required fields; optional fields default to None.
pub fn new_spotify_seek_params(position: Int) -> SpotifySeekParams {
  SpotifySeekParams(position: position)
}

pub fn spotify_seek_params_decoder() -> decode.Decoder(SpotifySeekParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use position <- decode.field("position", decode.int)
  decode.success(SpotifySeekParams(position: position))
}

pub fn encode_spotify_seek_params(value: SpotifySeekParams) -> json.Json {
  json.object(list.flatten([
    [#("position", json.int(value.position))],
  ]))
}

pub type SpotifyTrackView {
  SpotifyTrackView(id: Option(String), name: Option(String), artist: Option(String), album: Option(String), duration: Option(Int), preview_url: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_spotify_track_view() -> SpotifyTrackView {
  SpotifyTrackView(id: None, name: None, artist: None, album: None, duration: None, preview_url: None)
}

pub fn spotify_track_view_decoder() -> decode.Decoder(SpotifyTrackView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album <- decode.optional_field("album", None, decode.optional(decode.string))
  use duration <- decode.optional_field("duration", None, decode.optional(decode.int))
  use preview_url <- decode.optional_field("previewUrl", None, decode.optional(decode.string))
  decode.success(SpotifyTrackView(id: id, name: name, artist: artist, album: album, duration: duration, preview_url: preview_url))
}

pub fn encode_spotify_track_view(value: SpotifyTrackView) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album { Some(v) -> [#("album", json.string(v))] None -> [] },
    case value.duration { Some(v) -> [#("duration", json.int(v))] None -> [] },
    case value.preview_url { Some(v) -> [#("previewUrl", json.string(v))] None -> [] },
  ]))
}

pub type StarInput {
  StarInput(id: String, album_id: Option(String), artist_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_star_input(id: String) -> StarInput {
  StarInput(id: id, album_id: None, artist_id: None)
}

pub fn star_input_decoder() -> decode.Decoder(StarInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  use album_id <- decode.optional_field("albumId", None, decode.optional(decode.string))
  use artist_id <- decode.optional_field("artistId", None, decode.optional(decode.string))
  decode.success(StarInput(id: id, album_id: album_id, artist_id: artist_id))
}

pub fn encode_star_input(value: StarInput) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
    case value.album_id { Some(v) -> [#("albumId", json.string(v))] None -> [] },
    case value.artist_id { Some(v) -> [#("artistId", json.string(v))] None -> [] },
  ]))
}

pub type StarOutput {
  StarOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_star_output() -> StarOutput {
  StarOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None)
}

pub fn star_output_decoder() -> decode.Decoder(StarOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  decode.success(StarOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic))
}

pub fn encode_star_output(value: StarOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
  ]))
}

pub type StartPlaylistParams {
  StartPlaylistParams(uri: String, shuffle: Option(Bool), position: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_start_playlist_params(uri: String) -> StartPlaylistParams {
  StartPlaylistParams(uri: uri, shuffle: None, position: None)
}

pub fn start_playlist_params_decoder() -> decode.Decoder(StartPlaylistParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use shuffle <- decode.optional_field("shuffle", None, decode.optional(decode.bool))
  use position <- decode.optional_field("position", None, decode.optional(decode.int))
  decode.success(StartPlaylistParams(uri: uri, shuffle: shuffle, position: position))
}

pub fn encode_start_playlist_params(value: StartPlaylistParams) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    case value.shuffle { Some(v) -> [#("shuffle", json.bool(v))] None -> [] },
    case value.position { Some(v) -> [#("position", json.int(v))] None -> [] },
  ]))
}

pub type StartScanOutput {
  StartScanOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool), scan_status: Option(json_value.JsonValue))
}

/// Construct with required fields; optional fields default to None.
pub fn new_start_scan_output() -> StartScanOutput {
  StartScanOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None, scan_status: None)
}

pub fn start_scan_output_decoder() -> decode.Decoder(StartScanOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  use scan_status <- decode.optional_field("scanStatus", None, decode.optional(json_value.decoder()))
  decode.success(StartScanOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic, scan_status: scan_status))
}

pub fn encode_start_scan_output(value: StartScanOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
    case value.scan_status { Some(v) -> [#("scanStatus", json_value.encode(v))] None -> [] },
  ]))
}

pub type StartScanParams {
  StartScanParams
}

/// Construct with required fields; optional fields default to None.
pub fn new_start_scan_params() -> StartScanParams {
  StartScanParams
}

pub fn start_scan_params_decoder() -> decode.Decoder(StartScanParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))

  decode.success(StartScanParams)
}

pub fn encode_start_scan_params(_value: StartScanParams) -> json.Json {
  json.object(list.flatten([

  ]))
}

pub type StatsGlobalStatsView {
  StatsGlobalStatsView(scrobbles: Option(Int), users: Option(Int), artists: Option(Int), albums: Option(Int), tracks: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_global_stats_view() -> StatsGlobalStatsView {
  StatsGlobalStatsView(scrobbles: None, users: None, artists: None, albums: None, tracks: None)
}

pub fn stats_global_stats_view_decoder() -> decode.Decoder(StatsGlobalStatsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.int))
  use users <- decode.optional_field("users", None, decode.optional(decode.int))
  use artists <- decode.optional_field("artists", None, decode.optional(decode.int))
  use albums <- decode.optional_field("albums", None, decode.optional(decode.int))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.int))
  decode.success(StatsGlobalStatsView(scrobbles: scrobbles, users: users, artists: artists, albums: albums, tracks: tracks))
}

pub fn encode_stats_global_stats_view(value: StatsGlobalStatsView) -> json.Json {
  json.object(list.flatten([
    case value.scrobbles { Some(v) -> [#("scrobbles", json.int(v))] None -> [] },
    case value.users { Some(v) -> [#("users", json.int(v))] None -> [] },
    case value.artists { Some(v) -> [#("artists", json.int(v))] None -> [] },
    case value.albums { Some(v) -> [#("albums", json.int(v))] None -> [] },
    case value.tracks { Some(v) -> [#("tracks", json.int(v))] None -> [] },
  ]))
}

pub type StatsView {
  StatsView(scrobbles: Option(Int), artists: Option(Int), loved_tracks: Option(Int), albums: Option(Int), tracks: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_view() -> StatsView {
  StatsView(scrobbles: None, artists: None, loved_tracks: None, albums: None, tracks: None)
}

pub fn stats_view_decoder() -> decode.Decoder(StatsView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use scrobbles <- decode.optional_field("scrobbles", None, decode.optional(decode.int))
  use artists <- decode.optional_field("artists", None, decode.optional(decode.int))
  use loved_tracks <- decode.optional_field("lovedTracks", None, decode.optional(decode.int))
  use albums <- decode.optional_field("albums", None, decode.optional(decode.int))
  use tracks <- decode.optional_field("tracks", None, decode.optional(decode.int))
  decode.success(StatsView(scrobbles: scrobbles, artists: artists, loved_tracks: loved_tracks, albums: albums, tracks: tracks))
}

pub fn encode_stats_view(value: StatsView) -> json.Json {
  json.object(list.flatten([
    case value.scrobbles { Some(v) -> [#("scrobbles", json.int(v))] None -> [] },
    case value.artists { Some(v) -> [#("artists", json.int(v))] None -> [] },
    case value.loved_tracks { Some(v) -> [#("lovedTracks", json.int(v))] None -> [] },
    case value.albums { Some(v) -> [#("albums", json.int(v))] None -> [] },
    case value.tracks { Some(v) -> [#("tracks", json.int(v))] None -> [] },
  ]))
}

pub type StatsWrappedAlbum {
  StatsWrappedAlbum(id: Option(String), title: Option(String), artist: Option(String), album_art: Option(String), uri: Option(String), play_count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_wrapped_album() -> StatsWrappedAlbum {
  StatsWrappedAlbum(id: None, title: None, artist: None, album_art: None, uri: None, play_count: None)
}

pub fn stats_wrapped_album_decoder() -> decode.Decoder(StatsWrappedAlbum) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  decode.success(StatsWrappedAlbum(id: id, title: title, artist: artist, album_art: album_art, uri: uri, play_count: play_count))
}

pub fn encode_stats_wrapped_album(value: StatsWrappedAlbum) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
  ]))
}

pub type StatsWrappedArtist {
  StatsWrappedArtist(id: Option(String), name: Option(String), picture: Option(String), uri: Option(String), play_count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_wrapped_artist() -> StatsWrappedArtist {
  StatsWrappedArtist(id: None, name: None, picture: None, uri: None, play_count: None)
}

pub fn stats_wrapped_artist_decoder() -> decode.Decoder(StatsWrappedArtist) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use name <- decode.optional_field("name", None, decode.optional(decode.string))
  use picture <- decode.optional_field("picture", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  decode.success(StatsWrappedArtist(id: id, name: name, picture: picture, uri: uri, play_count: play_count))
}

pub fn encode_stats_wrapped_artist(value: StatsWrappedArtist) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.name { Some(v) -> [#("name", json.string(v))] None -> [] },
    case value.picture { Some(v) -> [#("picture", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
  ]))
}

pub type StatsWrappedDayCount {
  StatsWrappedDayCount(date: Option(String), count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_wrapped_day_count() -> StatsWrappedDayCount {
  StatsWrappedDayCount(date: None, count: None)
}

pub fn stats_wrapped_day_count_decoder() -> decode.Decoder(StatsWrappedDayCount) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use date <- decode.optional_field("date", None, decode.optional(decode.string))
  use count <- decode.optional_field("count", None, decode.optional(decode.int))
  decode.success(StatsWrappedDayCount(date: date, count: count))
}

pub fn encode_stats_wrapped_day_count(value: StatsWrappedDayCount) -> json.Json {
  json.object(list.flatten([
    case value.date { Some(v) -> [#("date", json.string(v))] None -> [] },
    case value.count { Some(v) -> [#("count", json.int(v))] None -> [] },
  ]))
}

pub type StatsWrappedGenreCount {
  StatsWrappedGenreCount(genre: Option(String), count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_wrapped_genre_count() -> StatsWrappedGenreCount {
  StatsWrappedGenreCount(genre: None, count: None)
}

pub fn stats_wrapped_genre_count_decoder() -> decode.Decoder(StatsWrappedGenreCount) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use genre <- decode.optional_field("genre", None, decode.optional(decode.string))
  use count <- decode.optional_field("count", None, decode.optional(decode.int))
  decode.success(StatsWrappedGenreCount(genre: genre, count: count))
}

pub fn encode_stats_wrapped_genre_count(value: StatsWrappedGenreCount) -> json.Json {
  json.object(list.flatten([
    case value.genre { Some(v) -> [#("genre", json.string(v))] None -> [] },
    case value.count { Some(v) -> [#("count", json.int(v))] None -> [] },
  ]))
}

pub type StatsWrappedMilestone {
  StatsWrappedMilestone(track_title: Option(String), artist_name: Option(String), timestamp: Option(String), track_uri: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_wrapped_milestone() -> StatsWrappedMilestone {
  StatsWrappedMilestone(track_title: None, artist_name: None, timestamp: None, track_uri: None)
}

pub fn stats_wrapped_milestone_decoder() -> decode.Decoder(StatsWrappedMilestone) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use track_title <- decode.optional_field("trackTitle", None, decode.optional(decode.string))
  use artist_name <- decode.optional_field("artistName", None, decode.optional(decode.string))
  use timestamp <- decode.optional_field("timestamp", None, decode.optional(decode.string))
  use track_uri <- decode.optional_field("trackUri", None, decode.optional(decode.string))
  decode.success(StatsWrappedMilestone(track_title: track_title, artist_name: artist_name, timestamp: timestamp, track_uri: track_uri))
}

pub fn encode_stats_wrapped_milestone(value: StatsWrappedMilestone) -> json.Json {
  json.object(list.flatten([
    case value.track_title { Some(v) -> [#("trackTitle", json.string(v))] None -> [] },
    case value.artist_name { Some(v) -> [#("artistName", json.string(v))] None -> [] },
    case value.timestamp { Some(v) -> [#("timestamp", json.string(v))] None -> [] },
    case value.track_uri { Some(v) -> [#("trackUri", json.string(v))] None -> [] },
  ]))
}

pub type StatsWrappedMonthCount {
  StatsWrappedMonthCount(month: Option(Int), count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_wrapped_month_count() -> StatsWrappedMonthCount {
  StatsWrappedMonthCount(month: None, count: None)
}

pub fn stats_wrapped_month_count_decoder() -> decode.Decoder(StatsWrappedMonthCount) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use month <- decode.optional_field("month", None, decode.optional(decode.int))
  use count <- decode.optional_field("count", None, decode.optional(decode.int))
  decode.success(StatsWrappedMonthCount(month: month, count: count))
}

pub fn encode_stats_wrapped_month_count(value: StatsWrappedMonthCount) -> json.Json {
  json.object(list.flatten([
    case value.month { Some(v) -> [#("month", json.int(v))] None -> [] },
    case value.count { Some(v) -> [#("count", json.int(v))] None -> [] },
  ]))
}

pub type StatsWrappedTrack {
  StatsWrappedTrack(id: Option(String), title: Option(String), artist: Option(String), album_art: Option(String), uri: Option(String), artist_uri: Option(String), album_uri: Option(String), play_count: Option(Int))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_wrapped_track() -> StatsWrappedTrack {
  StatsWrappedTrack(id: None, title: None, artist: None, album_art: None, uri: None, artist_uri: None, album_uri: None, play_count: None)
}

pub fn stats_wrapped_track_decoder() -> decode.Decoder(StatsWrappedTrack) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use title <- decode.optional_field("title", None, decode.optional(decode.string))
  use artist <- decode.optional_field("artist", None, decode.optional(decode.string))
  use album_art <- decode.optional_field("albumArt", None, decode.optional(decode.string))
  use uri <- decode.optional_field("uri", None, decode.optional(decode.string))
  use artist_uri <- decode.optional_field("artistUri", None, decode.optional(decode.string))
  use album_uri <- decode.optional_field("albumUri", None, decode.optional(decode.string))
  use play_count <- decode.optional_field("playCount", None, decode.optional(decode.int))
  decode.success(StatsWrappedTrack(id: id, title: title, artist: artist, album_art: album_art, uri: uri, artist_uri: artist_uri, album_uri: album_uri, play_count: play_count))
}

pub fn encode_stats_wrapped_track(value: StatsWrappedTrack) -> json.Json {
  json.object(list.flatten([
    case value.id { Some(v) -> [#("id", json.string(v))] None -> [] },
    case value.title { Some(v) -> [#("title", json.string(v))] None -> [] },
    case value.artist { Some(v) -> [#("artist", json.string(v))] None -> [] },
    case value.album_art { Some(v) -> [#("albumArt", json.string(v))] None -> [] },
    case value.uri { Some(v) -> [#("uri", json.string(v))] None -> [] },
    case value.artist_uri { Some(v) -> [#("artistUri", json.string(v))] None -> [] },
    case value.album_uri { Some(v) -> [#("albumUri", json.string(v))] None -> [] },
    case value.play_count { Some(v) -> [#("playCount", json.int(v))] None -> [] },
  ]))
}

pub type StatsWrappedView {
  StatsWrappedView(year: Option(Int), period: Option(String), start_date: Option(String), end_date: Option(String), total_scrobbles: Option(Int), total_listening_time_minutes: Option(Int), top_artists: Option(List(StatsWrappedArtist)), top_tracks: Option(List(StatsWrappedTrack)), top_albums: Option(List(StatsWrappedAlbum)), top_genres: Option(List(StatsWrappedGenreCount)), scrobbles_per_month: Option(List(StatsWrappedMonthCount)), scrobbles_per_day: Option(List(StatsWrappedDayCount)), most_active_day: Option(StatsWrappedDayCount), most_active_hour: Option(Int), new_artists_count: Option(Int), longest_streak: Option(Int), first_scrobble: Option(StatsWrappedMilestone), last_scrobble: Option(StatsWrappedMilestone))
}

/// Construct with required fields; optional fields default to None.
pub fn new_stats_wrapped_view() -> StatsWrappedView {
  StatsWrappedView(year: None, period: None, start_date: None, end_date: None, total_scrobbles: None, total_listening_time_minutes: None, top_artists: None, top_tracks: None, top_albums: None, top_genres: None, scrobbles_per_month: None, scrobbles_per_day: None, most_active_day: None, most_active_hour: None, new_artists_count: None, longest_streak: None, first_scrobble: None, last_scrobble: None)
}

pub fn stats_wrapped_view_decoder() -> decode.Decoder(StatsWrappedView) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use period <- decode.optional_field("period", None, decode.optional(decode.string))
  use start_date <- decode.optional_field("startDate", None, decode.optional(decode.string))
  use end_date <- decode.optional_field("endDate", None, decode.optional(decode.string))
  use total_scrobbles <- decode.optional_field("totalScrobbles", None, decode.optional(decode.int))
  use total_listening_time_minutes <- decode.optional_field("totalListeningTimeMinutes", None, decode.optional(decode.int))
  use top_artists <- decode.optional_field("topArtists", None, decode.optional(decode.list(stats_wrapped_artist_decoder())))
  use top_tracks <- decode.optional_field("topTracks", None, decode.optional(decode.list(stats_wrapped_track_decoder())))
  use top_albums <- decode.optional_field("topAlbums", None, decode.optional(decode.list(stats_wrapped_album_decoder())))
  use top_genres <- decode.optional_field("topGenres", None, decode.optional(decode.list(stats_wrapped_genre_count_decoder())))
  use scrobbles_per_month <- decode.optional_field("scrobblesPerMonth", None, decode.optional(decode.list(stats_wrapped_month_count_decoder())))
  use scrobbles_per_day <- decode.optional_field("scrobblesPerDay", None, decode.optional(decode.list(stats_wrapped_day_count_decoder())))
  use most_active_day <- decode.optional_field("mostActiveDay", None, decode.optional(stats_wrapped_day_count_decoder()))
  use most_active_hour <- decode.optional_field("mostActiveHour", None, decode.optional(decode.int))
  use new_artists_count <- decode.optional_field("newArtistsCount", None, decode.optional(decode.int))
  use longest_streak <- decode.optional_field("longestStreak", None, decode.optional(decode.int))
  use first_scrobble <- decode.optional_field("firstScrobble", None, decode.optional(stats_wrapped_milestone_decoder()))
  use last_scrobble <- decode.optional_field("lastScrobble", None, decode.optional(stats_wrapped_milestone_decoder()))
  decode.success(StatsWrappedView(year: year, period: period, start_date: start_date, end_date: end_date, total_scrobbles: total_scrobbles, total_listening_time_minutes: total_listening_time_minutes, top_artists: top_artists, top_tracks: top_tracks, top_albums: top_albums, top_genres: top_genres, scrobbles_per_month: scrobbles_per_month, scrobbles_per_day: scrobbles_per_day, most_active_day: most_active_day, most_active_hour: most_active_hour, new_artists_count: new_artists_count, longest_streak: longest_streak, first_scrobble: first_scrobble, last_scrobble: last_scrobble))
}

pub fn encode_stats_wrapped_view(value: StatsWrappedView) -> json.Json {
  json.object(list.flatten([
    case value.year { Some(v) -> [#("year", json.int(v))] None -> [] },
    case value.period { Some(v) -> [#("period", json.string(v))] None -> [] },
    case value.start_date { Some(v) -> [#("startDate", json.string(v))] None -> [] },
    case value.end_date { Some(v) -> [#("endDate", json.string(v))] None -> [] },
    case value.total_scrobbles { Some(v) -> [#("totalScrobbles", json.int(v))] None -> [] },
    case value.total_listening_time_minutes { Some(v) -> [#("totalListeningTimeMinutes", json.int(v))] None -> [] },
    case value.top_artists { Some(v) -> [#("topArtists", json.array(v, fn(item) { encode_stats_wrapped_artist(item) }))] None -> [] },
    case value.top_tracks { Some(v) -> [#("topTracks", json.array(v, fn(item) { encode_stats_wrapped_track(item) }))] None -> [] },
    case value.top_albums { Some(v) -> [#("topAlbums", json.array(v, fn(item) { encode_stats_wrapped_album(item) }))] None -> [] },
    case value.top_genres { Some(v) -> [#("topGenres", json.array(v, fn(item) { encode_stats_wrapped_genre_count(item) }))] None -> [] },
    case value.scrobbles_per_month { Some(v) -> [#("scrobblesPerMonth", json.array(v, fn(item) { encode_stats_wrapped_month_count(item) }))] None -> [] },
    case value.scrobbles_per_day { Some(v) -> [#("scrobblesPerDay", json.array(v, fn(item) { encode_stats_wrapped_day_count(item) }))] None -> [] },
    case value.most_active_day { Some(v) -> [#("mostActiveDay", encode_stats_wrapped_day_count(v))] None -> [] },
    case value.most_active_hour { Some(v) -> [#("mostActiveHour", json.int(v))] None -> [] },
    case value.new_artists_count { Some(v) -> [#("newArtistsCount", json.int(v))] None -> [] },
    case value.longest_streak { Some(v) -> [#("longestStreak", json.int(v))] None -> [] },
    case value.first_scrobble { Some(v) -> [#("firstScrobble", encode_stats_wrapped_milestone(v))] None -> [] },
    case value.last_scrobble { Some(v) -> [#("lastScrobble", encode_stats_wrapped_milestone(v))] None -> [] },
  ]))
}

pub type StatusRecord {
  StatusRecord(track: ActorTrackView, started_at: String, expires_at: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_status_record(track: ActorTrackView, started_at: String) -> StatusRecord {
  StatusRecord(track: track, started_at: started_at, expires_at: None)
}

pub fn status_record_decoder() -> decode.Decoder(StatusRecord) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use track <- decode.field("track", actor_track_view_decoder())
  use started_at <- decode.field("startedAt", decode.string)
  use expires_at <- decode.optional_field("expiresAt", None, decode.optional(decode.string))
  decode.success(StatusRecord(track: track, started_at: started_at, expires_at: expires_at))
}

pub fn encode_status_record(value: StatusRecord) -> json.Json {
  json.object(list.flatten([
    [#("track", encode_actor_track_view(value.track))],
    [#("startedAt", json.string(value.started_at))],
    case value.expires_at { Some(v) -> [#("expiresAt", json.string(v))] None -> [] },
  ]))
}

pub type StrongRef {
  StrongRef(uri: String, cid: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_strong_ref(uri: String, cid: String) -> StrongRef {
  StrongRef(uri: uri, cid: cid)
}

pub fn strong_ref_decoder() -> decode.Decoder(StrongRef) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use uri <- decode.field("uri", decode.string)
  use cid <- decode.field("cid", decode.string)
  decode.success(StrongRef(uri: uri, cid: cid))
}

pub fn encode_strong_ref(value: StrongRef) -> json.Json {
  json.object(list.flatten([
    [#("uri", json.string(value.uri))],
    [#("cid", json.string(value.cid))],
  ]))
}

pub type UnfollowAccountOutput {
  UnfollowAccountOutput(subject: ActorProfileViewBasic, followers: List(ActorProfileViewBasic), cursor: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_unfollow_account_output(subject: ActorProfileViewBasic, followers: List(ActorProfileViewBasic)) -> UnfollowAccountOutput {
  UnfollowAccountOutput(subject: subject, followers: followers, cursor: None)
}

pub fn unfollow_account_output_decoder() -> decode.Decoder(UnfollowAccountOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use subject <- decode.field("subject", actor_profile_view_basic_decoder())
  use followers <- decode.field("followers", decode.list(actor_profile_view_basic_decoder()))
  use cursor <- decode.optional_field("cursor", None, decode.optional(decode.string))
  decode.success(UnfollowAccountOutput(subject: subject, followers: followers, cursor: cursor))
}

pub fn encode_unfollow_account_output(value: UnfollowAccountOutput) -> json.Json {
  json.object(list.flatten([
    [#("subject", encode_actor_profile_view_basic(value.subject))],
    [#("followers", json.array(value.followers, fn(item) { encode_actor_profile_view_basic(item) }))],
    case value.cursor { Some(v) -> [#("cursor", json.string(v))] None -> [] },
  ]))
}

pub type UnfollowAccountParams {
  UnfollowAccountParams(account: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_unfollow_account_params(account: String) -> UnfollowAccountParams {
  UnfollowAccountParams(account: account)
}

pub fn unfollow_account_params_decoder() -> decode.Decoder(UnfollowAccountParams) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use account <- decode.field("account", decode.string)
  decode.success(UnfollowAccountParams(account: account))
}

pub fn encode_unfollow_account_params(value: UnfollowAccountParams) -> json.Json {
  json.object(list.flatten([
    [#("account", json.string(value.account))],
  ]))
}

pub type UnstarInput {
  UnstarInput(id: String, album_id: Option(String), artist_id: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_unstar_input(id: String) -> UnstarInput {
  UnstarInput(id: id, album_id: None, artist_id: None)
}

pub fn unstar_input_decoder() -> decode.Decoder(UnstarInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  use album_id <- decode.optional_field("albumId", None, decode.optional(decode.string))
  use artist_id <- decode.optional_field("artistId", None, decode.optional(decode.string))
  decode.success(UnstarInput(id: id, album_id: album_id, artist_id: artist_id))
}

pub fn encode_unstar_input(value: UnstarInput) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
    case value.album_id { Some(v) -> [#("albumId", json.string(v))] None -> [] },
    case value.artist_id { Some(v) -> [#("artistId", json.string(v))] None -> [] },
  ]))
}

pub type UnstarOutput {
  UnstarOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_unstar_output() -> UnstarOutput {
  UnstarOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None)
}

pub fn unstar_output_decoder() -> decode.Decoder(UnstarOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  decode.success(UnstarOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic))
}

pub fn encode_unstar_output(value: UnstarOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
  ]))
}

pub type UpdateApikeyInput {
  UpdateApikeyInput(id: String, name: String, description: Option(String))
}

/// Construct with required fields; optional fields default to None.
pub fn new_update_apikey_input(id: String, name: String) -> UpdateApikeyInput {
  UpdateApikeyInput(id: id, name: name, description: None)
}

pub fn update_apikey_input_decoder() -> decode.Decoder(UpdateApikeyInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  use name <- decode.field("name", decode.string)
  use description <- decode.optional_field("description", None, decode.optional(decode.string))
  decode.success(UpdateApikeyInput(id: id, name: name, description: description))
}

pub fn encode_update_apikey_input(value: UpdateApikeyInput) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
    [#("name", json.string(value.name))],
    case value.description { Some(v) -> [#("description", json.string(v))] None -> [] },
  ]))
}

pub type UpdateNowPlayingInput {
  UpdateNowPlayingInput(id: String)
}

/// Construct with required fields; optional fields default to None.
pub fn new_update_now_playing_input(id: String) -> UpdateNowPlayingInput {
  UpdateNowPlayingInput(id: id)
}

pub fn update_now_playing_input_decoder() -> decode.Decoder(UpdateNowPlayingInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use id <- decode.field("id", decode.string)
  decode.success(UpdateNowPlayingInput(id: id))
}

pub fn encode_update_now_playing_input(value: UpdateNowPlayingInput) -> json.Json {
  json.object(list.flatten([
    [#("id", json.string(value.id))],
  ]))
}

pub type UpdateNowPlayingOutput {
  UpdateNowPlayingOutput(status: Option(String), version: Option(String), type_: Option(String), server_version: Option(String), open_subsonic: Option(Bool))
}

/// Construct with required fields; optional fields default to None.
pub fn new_update_now_playing_output() -> UpdateNowPlayingOutput {
  UpdateNowPlayingOutput(status: None, version: None, type_: None, server_version: None, open_subsonic: None)
}

pub fn update_now_playing_output_decoder() -> decode.Decoder(UpdateNowPlayingOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use status <- decode.optional_field("status", None, decode.optional(decode.string))
  use version <- decode.optional_field("version", None, decode.optional(decode.string))
  use type_ <- decode.optional_field("type", None, decode.optional(decode.string))
  use server_version <- decode.optional_field("serverVersion", None, decode.optional(decode.string))
  use open_subsonic <- decode.optional_field("openSubsonic", None, decode.optional(decode.bool))
  decode.success(UpdateNowPlayingOutput(status: status, version: version, type_: type_, server_version: server_version, open_subsonic: open_subsonic))
}

pub fn encode_update_now_playing_output(value: UpdateNowPlayingOutput) -> json.Json {
  json.object(list.flatten([
    case value.status { Some(v) -> [#("status", json.string(v))] None -> [] },
    case value.version { Some(v) -> [#("version", json.string(v))] None -> [] },
    case value.type_ { Some(v) -> [#("type", json.string(v))] None -> [] },
    case value.server_version { Some(v) -> [#("serverVersion", json.string(v))] None -> [] },
    case value.open_subsonic { Some(v) -> [#("openSubsonic", json.bool(v))] None -> [] },
  ]))
}

pub type UpdateSeenInput {
  UpdateSeenInput(ids: Option(List(String)))
}

/// Construct with required fields; optional fields default to None.
pub fn new_update_seen_input() -> UpdateSeenInput {
  UpdateSeenInput(ids: None)
}

pub fn update_seen_input_decoder() -> decode.Decoder(UpdateSeenInput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use ids <- decode.optional_field("ids", None, decode.optional(decode.list(decode.string)))
  decode.success(UpdateSeenInput(ids: ids))
}

pub fn encode_update_seen_input(value: UpdateSeenInput) -> json.Json {
  json.object(list.flatten([
    case value.ids { Some(v) -> [#("ids", json.array(v, fn(item) { json.string(item) }))] None -> [] },
  ]))
}

pub type UpdateSeenOutput {
  UpdateSeenOutput(unread_count: Int)
}

/// Construct with required fields; optional fields default to None.
pub fn new_update_seen_output(unread_count: Int) -> UpdateSeenOutput {
  UpdateSeenOutput(unread_count: unread_count)
}

pub fn update_seen_output_decoder() -> decode.Decoder(UpdateSeenOutput) {
  use <- decode.recursive
  use _ <- decode.then(decode.dict(decode.string, decode.dynamic))
  use unread_count <- decode.field("unreadCount", decode.int)
  decode.success(UpdateSeenOutput(unread_count: unread_count))
}

pub fn encode_update_seen_output(value: UpdateSeenOutput) -> json.Json {
  json.object(list.flatten([
    [#("unreadCount", json.int(value.unread_count))],
  ]))
}
