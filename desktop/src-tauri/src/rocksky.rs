//! AppView reads over the official Rust SDK (`rocksky-sdk`).

use rocksky_sdk::appview::{ProfileView, ScrobbleView, SearchResults};
use rocksky_sdk::AppView;

use crate::remote::DEFAULT_API_URL;

fn appview(api_url: Option<String>) -> AppView {
    AppView::new(api_url.unwrap_or_else(|| DEFAULT_API_URL.to_string()))
}

/// The global scrobbles feed, newest first.
#[tauri::command]
pub async fn rocksky_feed(
    limit: Option<u32>,
    api_url: Option<String>,
) -> Result<Vec<ScrobbleView>, String> {
    appview(api_url)
        .scrobble_feed(None, false, limit.unwrap_or(30), 0, None)
        .await
        .map_err(|e| e.to_string())
}

/// An actor's profile by handle or DID.
#[tauri::command]
pub async fn rocksky_profile(
    actor: String,
    api_url: Option<String>,
) -> Result<ProfileView, String> {
    appview(api_url).profile(&actor).await.map_err(|e| e.to_string())
}

/// Full-text search across songs, artists, albums, and profiles.
#[tauri::command]
pub async fn rocksky_search(
    query: String,
    api_url: Option<String>,
) -> Result<SearchResults, String> {
    appview(api_url).search(&query).await.map_err(|e| e.to_string())
}
