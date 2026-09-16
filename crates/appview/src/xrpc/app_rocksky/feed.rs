//! `app.rocksky.feed.*`.
//!
//! Only `search` so far; the recommendation and generator methods are still to
//! come.

use crate::error::XrpcResult;
use crate::search::FederatedResults;
use crate::state::AppState;
use crate::xrpc::json;
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::Deserialize;

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.feed.search", search);
}

/// Hits per collection when the caller does not say.
const DEFAULT_SIZE: usize = 20;

/// The most any caller may ask for per collection.
///
/// Five collections, so the response can hold five hundred documents. Above
/// that the payload costs more than the search.
const MAX_SIZE: usize = 100;

#[derive(Debug, Clone, Deserialize)]
pub struct SearchParams {
    pub query: String,
    /// Hits per collection.
    ///
    /// Not in the lexicon, which declares only `query`. `apps/api` reads it
    /// anyway and the web client sends it, so it is honoured here too — a
    /// lexicon that under-describes a live parameter is a lexicon to fix, not a
    /// reason to break the client.
    #[serde(default)]
    pub size: Option<usize>,
}

/// `app.rocksky.feed.search`
///
/// Searches albums, artists, tracks, users and playlists in one request. Each
/// hit carries `_federation.indexUid` naming the collection it came from, which
/// is how the client decides what to render — see `apps/web/src/types/search.ts`.
async fn search(
    state: web::Data<AppState>,
    params: web::Query<SearchParams>,
) -> XrpcResult<HttpResponse> {
    let query = params.query.trim();
    if query.is_empty() {
        // Not an error: an empty search box is a normal state, and `*` against
        // five collections would return an arbitrary slice of the catalogue.
        return json(FederatedResults::default());
    }

    let size = params.size.unwrap_or(DEFAULT_SIZE).clamp(1, MAX_SIZE);

    let Some(search) = state.search() else {
        // Only reachable under test — the index is required at boot.
        tracing::warn!("search was called with no index configured");
        return json(FederatedResults::default());
    };

    match search.federated(query, size).await {
        Ok(results) => json(results),
        Err(err) => {
            // An empty result set rather than a 500: the search box is one part
            // of a page, and failing the request would break the page around
            // it. The log is where the outage is reported.
            tracing::error!(error = %err, query, "search failed");
            json(FederatedResults::default())
        }
    }
}
