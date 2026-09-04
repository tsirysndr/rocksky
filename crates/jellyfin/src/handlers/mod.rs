pub mod browse;
pub mod items;
pub mod media;
pub mod playlists;
pub mod sessions;
pub mod system;
pub mod userdata;
pub mod users;

use actix_web::{web, HttpRequest, HttpResponse};
use serde_json::{json, Value};

use crate::{auth::AuthedUser, dto::ItemsResult};

/// Every route this service answers.
///
/// Order matters: actix matches in registration order and a path parameter will
/// happily capture a literal segment, so each specific `/Items/Something` has
/// to come before the `/Items/{id}` catch-all. The same goes for `/Artists`,
/// `/Playlists` and `/MusicGenres`.
///
/// Jellyfin's reference server matches paths case-insensitively. We can't, so
/// the case variants clients are actually known to send are registered
/// explicitly.
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        // Root
        .route("/", web::get().to(system::index))
        .route("/", web::head().to(system::index))
        // System
        .route(
            "/System/Info/Public",
            web::get().to(system::system_info_public),
        )
        .route("/System/Info", web::get().to(system::system_info))
        .route("/System/Endpoint", web::get().to(system::system_endpoint))
        .route("/System/Ping", web::get().to(system::system_ping))
        .route("/System/Ping", web::post().to(system::system_ping))
        .route("/System/Ping", web::head().to(system::system_ping))
        .route(
            "/System/Configuration/Branding",
            web::get().to(system::branding_config),
        )
        .route(
            "/Branding/Configuration",
            web::get().to(system::branding_config),
        )
        .route("/Branding/Css", web::get().to(system::branding_css))
        .route(
            "/QuickConnect/Enabled",
            web::get().to(quick_connect_enabled),
        )
        // Auth. Clients spell this path in every casing there is; the
        // normalizer in `compat` folds them all onto this one.
        .route(
            "/Users/AuthenticateByName",
            web::post().to(users::authenticate_by_name),
        )
        .route("/Users/Public", web::get().to(users::users_public))
        .route("/Users/Me", web::get().to(users::users_me))
        .route("/Users", web::get().to(users::users_list))
        // Views. These must precede `/Users/{id}`.
        .route("/Users/{id}/Views", web::get().to(users::user_views))
        .route("/UserViews", web::get().to(users::user_views_query))
        .route("/Library/MediaFolders", web::get().to(users::media_folders))
        .route(
            "/Library/VirtualFolders",
            web::get().to(users::library_virtual_folders),
        )
        .route("/Library/Refresh", web::post().to(no_content))
        // Items — literals first, `/Items/{id}` last.
        .route("/Items", web::get().to(items::items))
        .route("/Items/Latest", web::get().to(items::items_latest))
        .route("/Items/Resume", web::get().to(items::items_resume))
        .route(
            "/Items/Suggestions",
            web::get().to(items::items_suggestions),
        )
        .route("/Items/Counts", web::get().to(browse::items_counts))
        .route("/Items/Filters", web::get().to(browse::items_filters))
        .route("/Items/Filters2", web::get().to(browse::items_filters2))
        .route("/Items/Prefixes", web::get().to(browse::items_prefixes))
        .route("/UserItems/Latest", web::get().to(items::items_latest))
        .route("/UserItems/Resume", web::get().to(items::items_resume))
        // Detail-page rails. Nothing here has extras, chapters or intros, but
        // they must be routed or every detail page logs an unmatched 404.
        .route("/Items/{id}/SpecialFeatures", web::get().to(empty_array))
        .route("/Items/{id}/Ancestors", web::get().to(empty_array))
        .route("/Items/{id}/Similar", web::get().to(browse::similar))
        .route("/Items/{id}/ThemeMedia", web::get().to(theme_media))
        .route("/MediaSegments/{id}", web::get().to(empty_items))
        .route("/Users/{uid}/Items/{id}/Intros", web::get().to(empty_items))
        // Playback and delivery. Registered before `/Items/{id}` so the path
        // parameter can't swallow the trailing segment.
        .route(
            "/Items/{id}/PlaybackInfo",
            web::get().to(media::playback_info),
        )
        .route(
            "/Items/{id}/PlaybackInfo",
            web::post().to(media::playback_info),
        )
        .route("/Items/{id}/File", web::get().to(media::item_file))
        .route("/Items/{id}/File", web::head().to(media::item_file))
        .route("/Items/{id}/Download", web::get().to(media::item_file))
        .route("/Items/{id}/InstantMix", web::get().to(browse::instant_mix))
        // Images
        .route(
            "/Items/{id}/Images/{kind}",
            web::get().to(media::item_image),
        )
        .route(
            "/Items/{id}/Images/{kind}",
            web::head().to(media::item_image),
        )
        .route(
            "/Items/{id}/Images/{kind}/{index}",
            web::get().to(media::item_image_by_index),
        )
        .route("/Items/{id}", web::get().to(items::item_by_id))
        .route("/Items/{id}", web::delete().to(playlists::delete_item))
        // Per-user aliases for the same listings.
        .route(
            "/Users/{id}/Items/Latest",
            web::get().to(items::items_latest),
        )
        .route(
            "/Users/{id}/Items/Resume",
            web::get().to(items::items_resume),
        )
        .route(
            "/Users/{id}/Items/Suggestions",
            web::get().to(items::items_suggestions),
        )
        .route(
            "/Users/{id}/Views/{view}/Latest",
            web::get().to(items::view_latest),
        )
        .route("/Users/{id}/Items", web::get().to(items::user_items))
        // UserData / played / rating — spec form and the legacy per-user one.
        .route(
            "/UserItems/{id}/UserData",
            web::get().to(userdata::get_user_data),
        )
        .route(
            "/UserItems/{id}/UserData",
            web::post().to(userdata::update_user_data),
        )
        .route(
            "/UserItems/{id}/Rating",
            web::post().to(userdata::set_rating),
        )
        .route(
            "/UserItems/{id}/Rating",
            web::delete().to(userdata::clear_rating),
        )
        .route(
            "/UserPlayedItems/{id}",
            web::post().to(userdata::mark_played),
        )
        .route(
            "/UserPlayedItems/{id}",
            web::delete().to(userdata::mark_unplayed),
        )
        .route(
            "/UserFavoriteItems/{id}",
            web::post().to(userdata::add_favorite),
        )
        .route(
            "/UserFavoriteItems/{id}",
            web::delete().to(userdata::remove_favorite),
        )
        .route(
            "/Users/{uid}/Items/{id}/UserData",
            web::get().to(userdata::get_user_data_legacy),
        )
        .route(
            "/Users/{uid}/Items/{id}/UserData",
            web::post().to(userdata::update_user_data_legacy),
        )
        .route(
            "/Users/{uid}/Items/{id}/Rating",
            web::post().to(userdata::set_rating_legacy),
        )
        .route(
            "/Users/{uid}/Items/{id}/Rating",
            web::delete().to(userdata::clear_rating_legacy),
        )
        .route(
            "/Users/{uid}/PlayedItems/{id}",
            web::post().to(userdata::mark_played_legacy),
        )
        .route(
            "/Users/{uid}/PlayedItems/{id}",
            web::delete().to(userdata::mark_unplayed_legacy),
        )
        .route(
            "/Users/{uid}/FavoriteItems/{id}",
            web::post().to(userdata::add_favorite_legacy),
        )
        .route(
            "/Users/{uid}/FavoriteItems/{id}",
            web::delete().to(userdata::remove_favorite_legacy),
        )
        .route(
            "/Users/{uid}/Items/{id}",
            web::get().to(items::user_item_by_id),
        )
        // No user avatars are stored, so this is a real 404 rather than a miss.
        .route("/Users/{id}/Images/{kind}", web::get().to(not_found))
        .route("/Users/{id}", web::get().to(users::user_by_id))
        // Artists. The `{id}/…` forms share a segment count with `/Artists/{name}`,
        // so they have to be registered first.
        .route("/Artists/AlbumArtists", web::get().to(browse::artists))
        .route("/Artists/Prefixes", web::get().to(browse::artists_prefixes))
        .route(
            "/Artists/{id}/InstantMix",
            web::get().to(browse::instant_mix),
        )
        .route("/Artists/{id}/Similar", web::get().to(browse::similar))
        .route("/Artists/{name}", web::get().to(browse::artist_by_name))
        .route("/Artists", web::get().to(browse::artists))
        .route(
            "/Albums/{id}/InstantMix",
            web::get().to(browse::instant_mix),
        )
        .route("/Albums/{id}/Similar", web::get().to(browse::similar))
        .route("/Songs/{id}/InstantMix", web::get().to(browse::instant_mix))
        // Audio delivery
        .route("/Audio/{id}/stream", web::get().to(media::audio_stream))
        .route("/Audio/{id}/stream", web::head().to(media::audio_stream))
        .route(
            "/Audio/{id}/stream.{ext}",
            web::get().to(media::audio_stream_ext),
        )
        .route(
            "/Audio/{id}/stream.{ext}",
            web::head().to(media::audio_stream_ext),
        )
        .route(
            "/Audio/{id}/universal",
            web::get().to(media::audio_universal),
        )
        .route(
            "/Audio/{id}/universal",
            web::head().to(media::audio_universal),
        )
        // Lyrics aren't stored for uploads; 404 is the spec's "none available".
        .route("/Audio/{id}/Lyrics", web::get().to(not_found))
        .route(
            "/Audio/{id}/RemoteSearch/Lyrics",
            web::get().to(empty_array),
        )
        // Sessions / playback reporting
        .route("/Sessions", web::get().to(sessions::sessions_list))
        .route(
            "/Sessions/Capabilities/Full",
            web::post().to(sessions::sessions_capabilities),
        )
        .route("/Sessions/Playing", web::post().to(sessions::playing))
        .route(
            "/Sessions/Playing/Progress",
            web::post().to(sessions::progress),
        )
        .route(
            "/Sessions/Playing/Stopped",
            web::post().to(sessions::stopped),
        )
        // Playlists — specific paths before `/Playlists/{id}`.
        .route("/Playlists", web::get().to(playlists::playlists_list))
        .route("/Playlists", web::post().to(playlists::create_playlist))
        .route(
            "/Playlists/{id}/Items",
            web::get().to(playlists::playlist_items),
        )
        .route(
            "/Playlists/{id}/Items",
            web::post().to(playlists::add_playlist_items),
        )
        .route(
            "/Playlists/{id}/Items",
            web::delete().to(playlists::remove_playlist_items),
        )
        .route(
            "/Playlists/{id}/Items/{entry}/Move/{index}",
            web::post().to(playlists::move_playlist_item),
        )
        .route(
            "/Playlists/{id}/Users",
            web::get().to(playlists::playlist_users),
        )
        .route(
            "/Playlists/{id}/InstantMix",
            web::get().to(browse::instant_mix),
        )
        .route("/Playlists/{id}", web::get().to(playlists::get_playlist))
        .route(
            "/Playlists/{id}",
            web::post().to(playlists::update_playlist),
        )
        // Genres. `/MusicGenres/InstantMix` is the literal form and must bind
        // before the `{name}` one.
        .route("/Genres", web::get().to(browse::genres_list))
        .route("/MusicGenres", web::get().to(browse::genres_list))
        .route(
            "/MusicGenres/InstantMix",
            web::get().to(browse::instant_mix_by_query),
        )
        .route(
            "/MusicGenres/{name}/InstantMix",
            web::get().to(browse::instant_mix),
        )
        .route("/Genres/{name}", web::get().to(browse::genre_by_name))
        .route("/MusicGenres/{name}", web::get().to(browse::genre_by_name))
        // Item-by-name browsing the catalogue has no data for.
        .route("/Years", web::get().to(browse::years_list))
        .route("/Years/{year}", web::get().to(browse::year_by_value))
        .route("/Persons", web::get().to(browse::empty_items))
        .route("/Persons/{name}", web::get().to(browse::not_found_item))
        .route("/Studios", web::get().to(browse::empty_items))
        .route("/Studios/{name}", web::get().to(browse::not_found_item))
        // Search
        .route("/Search/Hints", web::get().to(browse::search_hints))
        // Library scans are the upload pipeline's job; acknowledge the trigger
        // so clients don't treat it as an error, but expose no task state.
        .route("/ScheduledTasks", web::get().to(empty_array))
        .route("/ScheduledTasks/Running/{id}", web::post().to(no_content))
        .route("/ScheduledTasks/Running/{id}", web::delete().to(no_content))
        .route("/ScheduledTasks/{id}/Triggers", web::post().to(no_content))
        // TV endpoints. There is no video here at all, so empty is correct.
        .route("/Shows/NextUp", web::get().to(empty_items))
        .route("/Shows/Upcoming", web::get().to(empty_items))
        .route("/Shows/{id}/Episodes", web::get().to(empty_items))
        .route("/Shows/{id}/Seasons", web::get().to(empty_items))
        .route(
            "/DisplayPreferences/{id}",
            web::get().to(display_preferences),
        )
        // No live-update socket; clients fall back to polling when this 404s.
        .route("/socket", web::get().to(not_found));
}

/// `GET /QuickConnect/Enabled` — Quick Connect pairs a client by showing a code
/// on an already-signed-in device. There is nothing to pair against here, so
/// the honest answer is that it is switched off.
async fn quick_connect_enabled() -> HttpResponse {
    HttpResponse::Ok().json(false)
}

/// Log anything no route matched, so a client asking for something we haven't
/// implemented shows up in the journal rather than silently failing.
pub async fn log_unrouted(req: HttpRequest) -> HttpResponse {
    let query = if req.query_string().is_empty() {
        String::new()
    } else {
        format!("?{}", req.query_string())
    };
    tracing::warn!(
        "jellyfin: unrouted {} {}{}",
        req.method(),
        req.path(),
        query
    );
    HttpResponse::NotFound().finish()
}

async fn empty_array() -> HttpResponse {
    HttpResponse::Ok().json(Vec::<Value>::new())
}

async fn empty_items() -> HttpResponse {
    HttpResponse::Ok().json(ItemsResult::empty())
}

async fn no_content() -> HttpResponse {
    HttpResponse::NoContent().finish()
}

async fn not_found() -> HttpResponse {
    HttpResponse::NotFound().finish()
}

/// `ThemeMedia` is a fixed shape rather than a bare array — clients
/// deserialize it strictly and an array here breaks the detail page.
async fn theme_media(_user: AuthedUser, path: web::Path<String>) -> HttpResponse {
    let id = path.into_inner();
    HttpResponse::Ok().json(json!({
        "ThemeVideosResult": { "Items": [], "TotalRecordCount": 0, "StartIndex": 0 },
        "ThemeSongsResult": { "Items": [], "TotalRecordCount": 0, "StartIndex": 0 },
        "SoundtrackSongsResult": { "Items": [], "TotalRecordCount": 0, "StartIndex": 0 },
        "OwnerId": id,
    }))
}

async fn display_preferences(_user: AuthedUser) -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "Id": "",
        "ViewType": "",
        "SortBy": "SortName",
        "SortOrder": "Ascending",
        "RememberIndexing": false,
        "PrimaryImageHeight": 250,
        "PrimaryImageWidth": 250,
        "CustomPrefs": {},
        "ScrollDirection": "Vertical",
        "ShowBackdrop": true,
        "RememberSorting": false,
        "IndexBy": "",
        "ShowSidebar": false,
        "Client": ""
    }))
}
