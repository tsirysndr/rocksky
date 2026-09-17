//! Typesense — the search index.
//!
//! **Required, not optional.** Search is not a nicety that can quietly degrade:
//! it is how anyone finds anything in a catalogue of millions of tracks, and it
//! is the only path for `app.rocksky.feed.search` and `GET /uploads?q=`. An
//! earlier version treated it as an accelerator with a SQLite-FTS fallback,
//! which was a promise this crate never kept — there was no FTS index and no
//! code to build one, so `?q=` answered 501 and the search box returned
//! nothing. A dependency that is declared optional but has no working
//! alternative is just an unreported outage.
//!
//! # Collections
//!
//! Five for the federated search box, one for a person's own uploads. The names
//! and the `query_by` lists are `apps/api`'s, because both APIs may index into
//! the same Typesense and the web client discriminates hits on the collection
//! name it gets back.
//!
//! | collection       | query_by                                    | read by |
//! |------------------|---------------------------------------------|---------|
//! | `albums`         | `title,artist`                              | the search box |
//! | `artists`        | `name,biography`                            | the search box |
//! | `tracks`         | `title,artist,albumArtist,album,composer`   | the search box |
//! | `users`          | `handle,displayName`                        | the search box |
//! | `playlists`      | `name,description`                          | the search box |
//! | `library_tracks` | `title,artist,album,album_artist,genre,composer` | `GET /uploads?q=` |
//!
//! `library_tracks` is snake_case where the other five are camelCase. That is
//! not tidiness lost: the five carry database rows straight to the client,
//! which reads `albumArtist`, while `library_tracks` is a purpose-built
//! document that only this crate and `apps/api` ever open. Renaming either
//! would break a reader.
//!
//! # Documents are built explicitly, not serialized from rows
//!
//! `apps/api` indexes whole Drizzle rows. This crate builds each document field
//! by field instead, for two reasons: the Rust models serialize as snake_case
//! and would silently produce documents the client cannot read, and a row
//! carries columns that have no business in a search index — `lyrics`,
//! `spotify_link`, the Xata bookkeeping. The fields kept are exactly the ones
//! `apps/web/src/types/search.ts` declares, plus those named in `query_by`.

use crate::db::models;
use crate::db::schema::Tracks;
use crate::db::Backend;
use crate::sea_query::{Alias, Asterisk, Expr, Func, Order, Query};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// How long a single Typesense request may take.
///
/// `apps/api` uses two seconds. Matched, because the caller is a person waiting
/// on a search box: a slow answer is worse than "try again".
const REQUEST_TIMEOUT: Duration = Duration::from_secs(2);

/// Attempts for a request that failed transiently, including the first.
const ATTEMPTS: u32 = 3;

/// Backoff before the second attempt; doubled for the third.
const BASE_DELAY: Duration = Duration::from_millis(200);

/// Documents per import request when reindexing.
///
/// Typesense accepts a JSONL body of any length, but a batch is also the unit
/// of retry and of progress logging, so a smaller one recovers faster from a
/// blip in the middle of a million rows.
const IMPORT_BATCH: usize = 500;

pub const ALBUMS: &str = "albums";
pub const ARTISTS: &str = "artists";
pub const TRACKS: &str = "tracks";
pub const USERS: &str = "users";
pub const PLAYLISTS: &str = "playlists";
pub const LIBRARY_TRACKS: &str = "library_tracks";

/// The five federated collections, in the order the response lists them.
///
/// Order is part of the contract only in that `apps/api` returns hits grouped
/// this way; the client reads `_federation.indexUid` rather than position, so
/// this is for reproducible output rather than correctness.
pub const FEDERATED: [&str; 5] = [ALBUMS, ARTISTS, TRACKS, USERS, PLAYLISTS];

fn query_by(collection: &str) -> &'static str {
    match collection {
        ALBUMS => "title,artist",
        ARTISTS => "name,biography",
        TRACKS => "title,artist,albumArtist,album,composer",
        USERS => "handle,displayName",
        PLAYLISTS => "name,description",
        LIBRARY_TRACKS => "title,artist,album,album_artist,genre,composer",
        // Unreachable for the constants above; a literal keeps this total
        // rather than panicking on a collection added without a query list.
        _ => "id",
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SearchError {
    #[error(
        "cannot reach Typesense at {url}: {source}.\n\
         Typesense is required — it serves the search box and the search over \
         your own uploads, and this instance has no substitute for it. Start \
         one (the docker-compose file includes it) or point [search].typesense_url \
         at yours."
    )]
    Unreachable {
        url: String,
        #[source]
        source: reqwest::Error,
    },

    #[error(
        "Typesense at {url} rejected the API key.\n\
         Set [search].typesense_api_key (or TYPESENSE_API_KEY) to the key the \
         server was started with."
    )]
    Unauthorized { url: String },

    #[error("Typesense request failed: {0}")]
    Request(#[from] reqwest::Error),

    #[error("could not read Typesense's answer for {path}: {source}")]
    Malformed {
        path: String,
        #[source]
        source: serde_json::Error,
    },

    #[error("Typesense answered {status} for {path}: {body}")]
    Status {
        status: u16,
        path: String,
        body: String,
    },
}

/// A connection to the search index.
#[derive(Clone)]
pub struct Search {
    http: reqwest::Client,
    /// Without a trailing slash.
    base: String,
    api_key: String,
}

impl std::fmt::Debug for Search {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Never the key: this type is inside `AppState`, which gets logged.
        write!(f, "Search({})", self.base)
    }
}

impl Search {
    /// Builds a client without touching the network.
    ///
    /// Separate from [`Search::connect`] so a test can exercise the request
    /// building and response parsing against a stub, and so `connect`'s health
    /// check is the only thing that decides whether the instance may boot.
    pub fn new(url: &str, api_key: &str) -> Result<Self, SearchError> {
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .user_agent(concat!("rocksky-appview/", env!("CARGO_PKG_VERSION")))
            .build()?;

        Ok(Self {
            http,
            base: url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
        })
    }

    /// Connects and checks the server is answering.
    ///
    /// Deliberately fatal — see the module note. Creating the collections is a
    /// separate step ([`Search::ensure_collections`]) because its return value
    /// decides whether to backfill, and folding it in here would mean the
    /// caller could not tell a first boot from a restart.
    pub async fn connect(url: &str, api_key: &str) -> Result<Self, SearchError> {
        tracing::info!(url, "connecting to Typesense");
        let search = Self::new(url, api_key)?;

        // `/health` answers without a key, so it separates "nothing is
        // listening" from "the key is wrong" — two problems with very
        // different fixes, and an operator should not have to guess which.
        let health = search
            .http
            .get(format!("{}/health", search.base))
            .send()
            .await
            .map_err(|source| SearchError::Unreachable {
                url: url.to_string(),
                source,
            })?;

        if !health.status().is_success() {
            return Err(SearchError::Status {
                status: health.status().as_u16(),
                path: "/health".into(),
                body: health.text().await.unwrap_or_default(),
            });
        }

        tracing::info!(url, "connected to Typesense");
        Ok(search)
    }

    // ------------------------------------------------------------- collections

    /// Creates any collection that does not exist yet.
    ///
    /// Returns the ones it had to create, which is how the caller knows a first
    /// boot from a restart: a collection that was just created is empty and
    /// needs backfilling, an existing one is already being kept current by the
    /// write paths.
    pub async fn ensure_collections(&self) -> Result<Vec<&'static str>, SearchError> {
        let mut created = Vec::new();
        for schema in collection_schemas() {
            let name = schema["name"].as_str().expect("schema names are literals");
            if self.collection_exists(name).await? {
                continue;
            }
            tracing::info!(collection = name, "creating Typesense collection");
            match self.post("/collections", &schema).await {
                Ok(_) => {}
                // Someone else created it between the check and the create —
                // two instances booting at once, which is a normal deployment
                // and not an error. Not counted as created, so the instance
                // that won the race is the one that backfills it.
                Err(SearchError::Status { status: 409, .. }) => {
                    tracing::info!(
                        collection = name,
                        "another instance created this collection first"
                    );
                    continue;
                }
                Err(err) => return Err(err),
            }
            created.push(match name {
                ALBUMS => ALBUMS,
                ARTISTS => ARTISTS,
                TRACKS => TRACKS,
                USERS => USERS,
                PLAYLISTS => PLAYLISTS,
                _ => LIBRARY_TRACKS,
            });
        }
        Ok(created)
    }

    /// How many documents a collection holds, or `None` if it does not exist.
    ///
    /// Used to decide whether a collection needs building. "Was it just
    /// created" is the obvious test and the wrong one: a backfill that is
    /// interrupted — which is exactly what a container restart does — leaves
    /// the collection existing and half full, and it would then never be
    /// completed, because it is never *newly created* again. Comparing the
    /// count against the table makes that self-healing.
    pub async fn document_count(&self, name: &str) -> Result<Option<i64>, SearchError> {
        let path = format!("/collections/{name}");
        let response = self.send(reqwest::Method::GET, &path, None).await?;
        match response.status().as_u16() {
            200 => {
                let body: serde_json::Value = response.json().await?;
                Ok(Some(
                    body.get("num_documents")
                        .and_then(|n| n.as_i64())
                        .unwrap_or(0),
                ))
            }
            404 => Ok(None),
            401 => Err(SearchError::Unauthorized {
                url: self.base.clone(),
            }),
            status => Err(SearchError::Status {
                status,
                path,
                body: response.text().await.unwrap_or_default(),
            }),
        }
    }

    /// Whether Typesense is keeping up with what it has been given.
    ///
    /// `GET /health` answers `{"ok":false}` while the write queue is longer
    /// than its own healthy-lag thresholds, logging
    /// `N queued writes > healthy write lag of 500`. That is not a failure —
    /// it drains — but it *is* the signal to stop pushing, and it is what a
    /// container healthcheck sees. Importing straight through it is how a
    /// boot-time backfill turns into an unhealthy container.
    ///
    /// Anything other than a clear `ok: true` is treated as "not keeping up",
    /// including an unreachable server: the caller's response either way is to
    /// wait, and waiting on a server that is down is better than hammering it.
    pub async fn is_keeping_up(&self) -> bool {
        match self.send(reqwest::Method::GET, "/health", None).await {
            Ok(response) => match response.json::<serde_json::Value>().await {
                Ok(body) => body.get("ok").and_then(|ok| ok.as_bool()).unwrap_or(false),
                Err(_) => false,
            },
            Err(_) => false,
        }
    }

    async fn collection_exists(&self, name: &str) -> Result<bool, SearchError> {
        let path = format!("/collections/{name}");
        let response = self.send(reqwest::Method::GET, &path, None).await?;
        match response.status().as_u16() {
            200 => Ok(true),
            404 => Ok(false),
            401 => Err(SearchError::Unauthorized {
                url: self.base.clone(),
            }),
            status => Err(SearchError::Status {
                status,
                path,
                body: response.text().await.unwrap_or_default(),
            }),
        }
    }

    // ----------------------------------------------------------------- writing

    /// Upserts documents into a collection.
    ///
    /// Failures are logged by the callers rather than surfaced to the user:
    /// every call site runs *after* the row is committed, so refusing the
    /// request would misreport what happened, and the row can be reindexed
    /// later. What is not acceptable is silence, hence the error log.
    pub async fn index(
        &self,
        collection: &str,
        docs: &[serde_json::Value],
    ) -> Result<(), SearchError> {
        if docs.is_empty() {
            return Ok(());
        }

        // JSONL, one document per line — Typesense's import format.
        let mut body = String::new();
        for doc in docs {
            body.push_str(&serde_json::to_string(doc).unwrap_or_default());
            body.push('\n');
        }

        let path = format!("/collections/{collection}/documents/import?action=upsert");
        let response = self
            .retry(|| {
                self.http
                    .post(format!("{}{}", self.base, path))
                    .header("X-TYPESENSE-API-KEY", &self.api_key)
                    .header(reqwest::header::CONTENT_TYPE, "text/plain")
                    .body(body.clone())
                    .send()
            })
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(SearchError::Status {
                status: status.as_u16(),
                path,
                body: text,
            });
        }

        // A 200 does not mean every document landed: import answers one JSON
        // object per line and reports per-document failures there. Counted
        // rather than returned, because one bad row must not abort a batch of
        // five hundred.
        let failed = text
            .lines()
            .filter(|line| !line.is_empty() && !line.contains("\"success\":true"))
            .count();
        if failed > 0 {
            tracing::warn!(
                collection,
                failed,
                of = docs.len(),
                sample = text.lines().find(|l| !l.contains("\"success\":true")),
                "some documents were rejected by Typesense"
            );
        }

        Ok(())
    }

    /// Removes one document. A document that is already gone is a success.
    pub async fn remove(&self, collection: &str, id: &str) -> Result<(), SearchError> {
        let path = format!("/collections/{collection}/documents/{id}");
        let response = self.send(reqwest::Method::DELETE, &path, None).await?;
        match response.status().as_u16() {
            // 404 is the desired end state, not a problem.
            200 | 404 => Ok(()),
            status => Err(SearchError::Status {
                status,
                path,
                body: response.text().await.unwrap_or_default(),
            }),
        }
    }

    // ----------------------------------------------------------------- reading

    /// The federated search behind `app.rocksky.feed.search`.
    ///
    /// One `multi_search` request rather than five searches, so the five
    /// collections cost one round trip.
    pub async fn federated(
        &self,
        query: &str,
        per_collection: usize,
    ) -> Result<FederatedResults, SearchError> {
        let searches: Vec<serde_json::Value> = FEDERATED
            .iter()
            .map(|collection| {
                serde_json::json!({
                    "collection": collection,
                    "q": query,
                    "query_by": query_by(collection),
                    "per_page": per_collection,
                    "page": 1,
                    "prioritize_exact_match": true,
                })
            })
            .collect();

        let started = std::time::Instant::now();
        let response = self
            .post(
                "/multi_search",
                &serde_json::json!({ "searches": searches }),
            )
            .await?;
        let elapsed = started.elapsed();

        // Parsed rather than defaulted on failure: a response this code cannot
        // read means Typesense changed under it, and answering "no results"
        // would hide that behind an empty search box.
        let parsed: MultiSearchResponse =
            serde_json::from_str(&response).map_err(|source| SearchError::Malformed {
                path: "/multi_search".into(),
                source,
            })?;

        let mut hits = Vec::new();
        let mut estimated_total_hits = 0;
        for (index, result) in parsed.results.iter().enumerate() {
            let Some(&collection) = FEDERATED.get(index) else {
                continue;
            };
            // Typesense reports a per-search failure inside a 200 response, so
            // one missing collection must not empty the whole answer.
            if let Some(error) = &result.error {
                tracing::warn!(collection, error = %error, "a search collection failed");
                continue;
            }
            estimated_total_hits += result.found.unwrap_or(0);
            for hit in &result.hits {
                let mut document = hit.document.clone();
                if let Some(object) = document.as_object_mut() {
                    object.insert(
                        "_federation".into(),
                        serde_json::json!({ "indexUid": collection }),
                    );
                }
                hits.push(document);
            }
        }

        Ok(FederatedResults {
            hits,
            processing_time_ms: elapsed.as_millis() as i64,
            limit: (per_collection * FEDERATED.len()) as i64,
            offset: 0,
            estimated_total_hits,
        })
    }

    /// Searches one person's uploads, behind `GET /uploads?q=`.
    ///
    /// An empty query means "everything, newest first" — the list endpoint and
    /// the search endpoint are the same endpoint to the UI, and a cleared
    /// search box must show the library again rather than nothing.
    pub async fn library_tracks(
        &self,
        query: &str,
        user_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<LibraryTrackDocument>, SearchError> {
        let per_page = limit.clamp(1, 200);
        let page = offset / per_page + 1;

        let sort_by = if query.is_empty() {
            "uploaded_at:desc"
        } else {
            "_text_match:desc,uploaded_at:desc"
        };

        let response = self
            .retry(|| {
                self.http
                    .get(format!(
                        "{}/collections/{LIBRARY_TRACKS}/documents/search",
                        self.base
                    ))
                    .header("X-TYPESENSE-API-KEY", &self.api_key)
                    .query(&[
                        // `*` is Typesense's match-everything query.
                        ("q", if query.is_empty() { "*" } else { query }),
                        ("query_by", query_by(LIBRARY_TRACKS)),
                        ("filter_by", &format!("user_id:={user_id}")),
                        ("per_page", &per_page.to_string()),
                        ("page", &page.to_string()),
                        ("sort_by", sort_by),
                    ])
                    .send()
            })
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(SearchError::Status {
                status: status.as_u16(),
                path: format!("/collections/{LIBRARY_TRACKS}/documents/search"),
                body: text,
            });
        }

        let parsed: SearchResponse<LibraryTrackDocument> =
            serde_json::from_str(&text).map_err(|source| SearchError::Malformed {
                path: format!("/collections/{LIBRARY_TRACKS}/documents/search"),
                source,
            })?;
        Ok(parsed.hits.into_iter().map(|hit| hit.document).collect())
    }

    // ---------------------------------------------------------------- plumbing

    async fn post(&self, path: &str, body: &serde_json::Value) -> Result<String, SearchError> {
        let response = self
            .send(reqwest::Method::POST, path, Some(body.clone()))
            .await?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        match status.as_u16() {
            code if (200..300).contains(&code) => Ok(text),
            401 => Err(SearchError::Unauthorized {
                url: self.base.clone(),
            }),
            code => Err(SearchError::Status {
                status: code,
                path: path.to_string(),
                body: text,
            }),
        }
    }

    async fn send(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> Result<reqwest::Response, SearchError> {
        self.retry(|| {
            let mut request = self
                .http
                .request(method.clone(), format!("{}{}", self.base, path))
                .header("X-TYPESENSE-API-KEY", &self.api_key);
            if let Some(body) = &body {
                request = request.json(body);
            }
            request.send()
        })
        .await
    }

    /// Retries a request that failed transiently.
    ///
    /// The classification mirrors `apps/api/src/typesense/retry.ts`: a refused
    /// connection, a timeout, a DNS failure or a 5xx is worth trying again; a
    /// 4xx is the caller's fault and will fail identically. No jitter, unlike
    /// the TypeScript version — a single process retrying one request has no
    /// thundering herd to spread out.
    async fn retry<F, Fut>(&self, mut attempt: F) -> Result<reqwest::Response, SearchError>
    where
        F: FnMut() -> Fut,
        Fut: std::future::Future<Output = reqwest::Result<reqwest::Response>>,
    {
        let mut delay = BASE_DELAY;
        let mut last: Option<reqwest::Error> = None;

        for round in 0..ATTEMPTS {
            match attempt().await {
                Ok(response) if response.status().is_server_error() && round + 1 < ATTEMPTS => {
                    tracing::warn!(
                        status = response.status().as_u16(),
                        round,
                        "Typesense answered a server error; retrying"
                    );
                }
                Ok(response) => return Ok(response),
                Err(err) if is_transient(&err) && round + 1 < ATTEMPTS => {
                    tracing::warn!(error = %err, round, "transient Typesense failure; retrying");
                    last = Some(err);
                }
                Err(err) => return Err(SearchError::Request(err)),
            }

            tokio::time::sleep(delay).await;
            delay *= 2;
        }

        // Only reached when the last round was itself a retryable failure.
        Err(match last {
            Some(err) => SearchError::Request(err),
            None => SearchError::Status {
                status: 500,
                path: self.base.clone(),
                body: "Typesense kept answering a server error".into(),
            },
        })
    }
}

/// Whether a reqwest failure is worth a second attempt.
fn is_transient(err: &reqwest::Error) -> bool {
    err.is_timeout() || err.is_connect() || err.is_request()
}

// ------------------------------------------------------------------- responses

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedResults {
    /// Raw index documents, each tagged with `_federation.indexUid`.
    ///
    /// Deliberately untyped: a hit can be any of five different shapes, and the
    /// client discriminates on `_federation.indexUid` rather than on a `$type`.
    /// Deserializing into a Rust union and re-serializing would only risk
    /// dropping a field some client reads.
    pub hits: Vec<serde_json::Value>,
    pub processing_time_ms: i64,
    pub limit: i64,
    pub offset: i64,
    pub estimated_total_hits: i64,
}

#[derive(Debug, Default, Deserialize)]
struct MultiSearchResponse {
    #[serde(default)]
    results: Vec<SearchResponse<serde_json::Value>>,
}

/// The `bound` is not decoration: `#[serde(default)]` on the fields below makes
/// serde infer a `T: Default` bound, which a document type has no reason to
/// satisfy.
#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: Deserialize<'de>"))]
struct SearchResponse<T> {
    #[serde(default)]
    hits: Vec<Hit<T>>,
    #[serde(default)]
    found: Option<i64>,
    /// Present when this search inside a `multi_search` failed on its own.
    #[serde(default)]
    error: Option<String>,
}

// Derived by hand: `#[derive(Default)]` would demand `T: Default`, which
// `serde_json::Value` satisfies but a document type need not.
impl<T> Default for SearchResponse<T> {
    fn default() -> Self {
        Self {
            hits: Vec::new(),
            found: None,
            error: None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: Deserialize<'de>"))]
struct Hit<T> {
    document: T,
}

/// A document in `library_tracks`.
///
/// snake_case, and the field names are `apps/api`'s — see the module note.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryTrackDocument {
    /// The upload id, so a delete can address the document directly.
    pub id: String,
    pub user_id: String,
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    pub duration: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    pub r2_key: String,
    pub mime_type: String,
    pub file_size: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_filename: Option<String>,
    /// Epoch milliseconds — the collection's `default_sorting_field`, so it
    /// must be a number rather than the ISO string the rest of the API uses.
    pub uploaded_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
}

// ------------------------------------------------------------------- documents

/// The document for a track, as the search box reads it.
pub fn track_doc(track: &models::Track) -> serde_json::Value {
    serde_json::json!({
        "id": track.id,
        "title": track.title,
        "artist": track.artist,
        "albumArtist": track.album_artist,
        "album": track.album,
        "albumArt": track.album_art,
        "uri": track.uri,
        // Indexed but not read by the client: named in `query_by`.
        "composer": track.composer,
        "genre": track.genre,
    })
}

pub fn album_doc(album: &models::Album) -> serde_json::Value {
    serde_json::json!({
        "id": album.id,
        "title": album.title,
        "artist": album.artist,
        "albumArt": album.album_art,
        "uri": album.uri,
        "year": album.year,
    })
}

pub fn artist_doc(artist: &models::Artist) -> serde_json::Value {
    serde_json::json!({
        "id": artist.id,
        "name": artist.name,
        "picture": artist.picture,
        "uri": artist.uri,
        "biography": artist.biography,
    })
}

pub fn user_doc(user: &models::User) -> serde_json::Value {
    serde_json::json!({
        "id": user.id,
        "did": user.did,
        "handle": user.handle,
        "displayName": user.display_name,
        "avatar": user.avatar,
    })
}

pub fn playlist_doc(playlist: &models::Playlist) -> serde_json::Value {
    serde_json::json!({
        "id": playlist.id,
        "name": playlist.name,
        "picture": playlist.picture,
        "uri": playlist.uri,
        "description": playlist.description,
    })
}

// ------------------------------------------------------------- keeping current
//
// Live indexing hangs off the call sites that have an `AppState`, not off
// `crate::ingest`, which is deliberately `&Backend`-only so the offline tools
// can share it. The cost of that choice is that these helpers have to find the
// rows again by content hash — the same hashes `ingest` wrote them under, so
// they find exactly the rows it touched. The benefit is that a sweep or an
// outbox table is not needed, and search never lags behind a write.

/// Indexes a track and the album and artist it belongs to.
///
/// All three, because one scrobble creates or updates all three: a new album
/// whose track was indexed but whose album was not would be findable by song
/// title and not by album title, which reads as a broken search rather than a
/// missing index entry.
pub async fn index_track_tree(state: &crate::state::AppState, track_id: &str) {
    let Some(search) = state.search() else {
        return;
    };
    let db = state.db();

    let track: Option<models::Track> =
        match load_one(db, models::TRACK_COLS, "tracks", "xata_id", track_id).await {
            Ok(track) => track,
            Err(err) => {
                tracing::error!(track_id, error = %err, "could not read a track to index it");
                return;
            }
        };
    let Some(track) = track else {
        tracing::warn!(track_id, "cannot index a track that is not there");
        return;
    };

    if let Err(err) = search.index(TRACKS, &[track_doc(&track)]).await {
        tracing::error!(track_id, error = %err, "could not index a track");
    }

    // The album and artist are addressed by the hashes `ingest` stored them
    // under, which is the only link a `tracks` row carries to either before the
    // record URIs arrive.
    let album_key = rocksky_core::identity::album_hash(&track.album, &track.album_artist);
    match load_one::<models::Album>(db, models::ALBUM_COLS, "albums", "sha256", &album_key).await {
        Ok(Some(album)) => {
            if let Err(err) = search.index(ALBUMS, &[album_doc(&album)]).await {
                tracing::error!(error = %err, "could not index an album");
            }
        }
        Ok(None) => {}
        Err(err) => tracing::error!(error = %err, "could not read an album to index it"),
    }

    let artist_key = rocksky_core::identity::artist_hash(&track.album_artist);
    match load_one::<models::Artist>(db, models::ARTIST_COLS, "artists", "sha256", &artist_key)
        .await
    {
        Ok(Some(artist)) => {
            if let Err(err) = search.index(ARTISTS, &[artist_doc(&artist)]).await {
                tracing::error!(error = %err, "could not index an artist");
            }
        }
        Ok(None) => {}
        Err(err) => tracing::error!(error = %err, "could not read an artist to index it"),
    }
}

/// Indexes one user, by row id.
///
/// Called after a login and after a handle or avatar changes — a person whose
/// handle is stale in the index cannot be found by their current one.
pub async fn index_user(state: &crate::state::AppState, user_id: &str) {
    let Some(search) = state.search() else {
        return;
    };

    match load_one::<models::User>(state.db(), models::USER_COLS, "users", "xata_id", user_id).await
    {
        Ok(Some(user)) => {
            if let Err(err) = search.index(USERS, &[user_doc(&user)]).await {
                tracing::error!(user_id, error = %err, "could not index a user");
            }
        }
        Ok(None) => tracing::warn!(user_id, "cannot index a user that is not there"),
        Err(err) => tracing::error!(user_id, error = %err, "could not read a user to index it"),
    }
}

/// Indexes one playlist, by row id.
pub async fn index_playlist(state: &crate::state::AppState, playlist_id: &str) {
    let Some(search) = state.search() else {
        return;
    };

    match load_one::<models::Playlist>(
        state.db(),
        models::PLAYLIST_COLS,
        "playlists",
        "xata_id",
        playlist_id,
    )
    .await
    {
        Ok(Some(playlist)) => {
            if let Err(err) = search.index(PLAYLISTS, &[playlist_doc(&playlist)]).await {
                tracing::error!(playlist_id, error = %err, "could not index a playlist");
            }
        }
        Ok(None) => tracing::warn!(playlist_id, "cannot index a playlist that is not there"),
        Err(err) => {
            tracing::error!(playlist_id, error = %err, "could not read a playlist to index it")
        }
    }
}

/// Drops a playlist from the index, after its row is gone.
pub async fn remove_playlist(state: &crate::state::AppState, playlist_id: &str) {
    let Some(search) = state.search() else {
        return;
    };
    if let Err(err) = search.remove(PLAYLISTS, playlist_id).await {
        tracing::error!(playlist_id, error = %err, "could not unindex a playlist");
    }
}

/// Indexes whatever a just-ingested record touched.
///
/// The sync sources hand records to `crate::ingest` and get a count back, not a
/// list of row ids. Rather than change that signature — it is shared with the
/// offline tools, which have no index — this re-derives the affected rows from
/// the record itself, the same way `ingest` did.
pub async fn index_record(state: &crate::state::AppState, record: &crate::ingest::IncomingRecord) {
    if state.search().is_none() {
        return;
    }

    match record.collection.as_str() {
        crate::ingest::SCROBBLE_NSID | crate::ingest::SONG_NSID => {
            let Some(song) = crate::ingest::SongRecord::parse(&record.value) else {
                return;
            };
            let hash = rocksky_core::identity::track_hash(&song.title, &song.artist, &song.album);
            let query = Query::select()
                .column(Tracks::XataId)
                .from(Tracks::Table)
                .and_where(Expr::col(Tracks::Sha256).eq(&hash))
                .limit(1)
                .take();
            match state.db().fetch_scalar::<String>(&query).await {
                Ok(Some(track_id)) => index_track_tree(state, &track_id).await,
                Ok(None) => {}
                Err(err) => tracing::error!(error = %err, "could not find a track to index"),
            }
        }
        crate::ingest::ALBUM_NSID => {
            let uri = record.uri();
            match load_one::<models::Album>(state.db(), models::ALBUM_COLS, "albums", "uri", &uri)
                .await
            {
                Ok(Some(album)) => {
                    if let Some(search) = state.search() {
                        if let Err(err) = search.index(ALBUMS, &[album_doc(&album)]).await {
                            tracing::error!(error = %err, "could not index an album");
                        }
                    }
                }
                Ok(None) => {}
                Err(err) => tracing::error!(error = %err, "could not read an album to index it"),
            }
        }
        crate::ingest::ARTIST_NSID => {
            let uri = record.uri();
            match load_one::<models::Artist>(
                state.db(),
                models::ARTIST_COLS,
                "artists",
                "uri",
                &uri,
            )
            .await
            {
                Ok(Some(artist)) => {
                    if let Some(search) = state.search() {
                        if let Err(err) = search.index(ARTISTS, &[artist_doc(&artist)]).await {
                            tracing::error!(error = %err, "could not index an artist");
                        }
                    }
                }
                Ok(None) => {}
                Err(err) => tracing::error!(error = %err, "could not read an artist to index it"),
            }
        }
        // A like changes no searchable row.
        _ => {}
    }
}

/// One row by an exact column match.
async fn load_one<T>(
    db: &Backend,
    columns: &[models::Col],
    table: &str,
    column: &str,
    value: &str,
) -> Result<Option<T>, sqlx::Error>
where
    T: for<'r> sqlx::FromRow<'r, sqlx::sqlite::SqliteRow>
        + for<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow>
        + Send
        + Unpin,
{
    let mut query = Query::select();
    db.select_model(&mut query, columns, None);
    query
        .from(Alias::new(table))
        .and_where(Expr::col(Alias::new(column)).eq(value))
        .limit(1);
    db.fetch_optional(&query).await
}

/// Indexes one upload, so it is searchable straight away.
///
/// Takes `&AppState` and swallows every failure, because every caller is a
/// request handler that has already committed the row and already told the user
/// the upload succeeded. A missing document is a track that cannot be found by
/// searching until the next reindex — bad, and logged as an error, but not a
/// reason to fail a request that otherwise worked.
pub async fn index_upload(state: &crate::state::AppState, upload_id: &str) {
    let Some(search) = state.search() else {
        return;
    };

    let document = match crate::uploads::document_for(state.db(), upload_id).await {
        Ok(Some(document)) => document,
        Ok(None) => {
            tracing::warn!(upload_id, "cannot index an upload that is not there");
            return;
        }
        Err(err) => {
            tracing::error!(upload_id, error = %err, "could not read an upload to index it");
            return;
        }
    };

    let value = match serde_json::to_value(&document) {
        Ok(value) => value,
        Err(err) => {
            tracing::error!(upload_id, error = %err, "could not serialize an upload document");
            return;
        }
    };

    if let Err(err) = search.index(LIBRARY_TRACKS, &[value]).await {
        tracing::error!(upload_id, error = %err, "could not index an upload");
    }
}

/// Drops uploads from the index. Call after the rows are gone.
///
/// A document left behind would be a search hit for audio that no longer
/// exists, which the listing endpoint then filters out — so the symptom is a
/// result count that does not match the results.
pub async fn remove_uploads(state: &crate::state::AppState, upload_ids: &[String]) {
    let Some(search) = state.search() else {
        return;
    };

    for id in upload_ids {
        if let Err(err) = search.remove(LIBRARY_TRACKS, id).await {
            tracing::error!(upload_id = %id, error = %err, "could not unindex an upload");
        }
    }
}

// --------------------------------------------------------------------- schemas

/// Every collection this crate needs, as Typesense create-collection payloads.
///
/// The five federated ones declare only the fields named in `query_by` plus a
/// `.*` auto field, exactly as `apps/api` does: an explicit field gets a real
/// index, and `.*` keeps everything else retrievable without having to declare
/// a schema for columns nobody searches on.
fn collection_schemas() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "name": ALBUMS,
            "enable_nested_fields": true,
            "fields": [
                { "name": "id", "type": "string" },
                { "name": "title", "type": "string", "optional": true },
                { "name": "artist", "type": "string", "optional": true },
                { "name": "year", "type": "int32", "optional": true, "facet": true },
                { "name": ".*", "type": "auto" },
            ],
        }),
        serde_json::json!({
            "name": ARTISTS,
            "enable_nested_fields": true,
            "fields": [
                { "name": "id", "type": "string" },
                { "name": "name", "type": "string", "optional": true },
                { "name": "biography", "type": "string", "optional": true },
                { "name": "genres", "type": "string[]", "optional": true, "facet": true },
                { "name": "bornIn", "type": "string", "optional": true },
                { "name": ".*", "type": "auto" },
            ],
        }),
        serde_json::json!({
            "name": TRACKS,
            "enable_nested_fields": true,
            "fields": [
                { "name": "id", "type": "string" },
                { "name": "title", "type": "string", "optional": true },
                { "name": "artist", "type": "string", "optional": true },
                { "name": "albumArtist", "type": "string", "optional": true },
                { "name": "album", "type": "string", "optional": true },
                { "name": "genre", "type": "string", "optional": true, "facet": true },
                { "name": "composer", "type": "string", "optional": true },
                { "name": ".*", "type": "auto" },
            ],
        }),
        serde_json::json!({
            "name": USERS,
            "enable_nested_fields": true,
            "fields": [
                { "name": "id", "type": "string" },
                { "name": "handle", "type": "string", "optional": true },
                { "name": "displayName", "type": "string", "optional": true },
                { "name": ".*", "type": "auto" },
            ],
        }),
        serde_json::json!({
            "name": PLAYLISTS,
            "enable_nested_fields": true,
            "fields": [
                { "name": "id", "type": "string" },
                { "name": "name", "type": "string", "optional": true },
                { "name": "description", "type": "string", "optional": true },
                { "name": ".*", "type": "auto" },
            ],
        }),
        serde_json::json!({
            "name": LIBRARY_TRACKS,
            "fields": [
                { "name": "id", "type": "string" },
                { "name": "user_id", "type": "string", "facet": true },
                { "name": "track_id", "type": "string", "index": false },
                { "name": "title", "type": "string" },
                { "name": "artist", "type": "string" },
                { "name": "album", "type": "string" },
                { "name": "album_artist", "type": "string" },
                { "name": "genre", "type": "string", "optional": true },
                { "name": "composer", "type": "string", "optional": true },
                { "name": "year", "type": "int32", "optional": true },
                { "name": "duration", "type": "int32" },
                { "name": "album_art", "type": "string", "optional": true, "index": false },
                { "name": "r2_key", "type": "string", "index": false },
                { "name": "mime_type", "type": "string", "index": false },
                { "name": "file_size", "type": "int32", "index": false },
                { "name": "original_filename", "type": "string", "optional": true, "index": false },
                { "name": "uploaded_at", "type": "int64" },
                { "name": "mb_id", "type": "string", "optional": true },
                { "name": "track_number", "type": "int32", "optional": true },
                { "name": "disc_number", "type": "int32", "optional": true },
            ],
            "default_sorting_field": "uploaded_at",
        }),
    ]
}

// -------------------------------------------------------------------- backfill

/// Fills a freshly created collection from the database.
///
/// Called at boot for each collection [`Search::ensure_collections`] had to
/// create, which is what makes search work on an existing database: someone
/// pointing this binary at a Postgres full of scrobbles, or restoring a SQLite
/// file, gets a usable search box without running an import script.
///
/// Collections that already existed are skipped. They are kept current by the
/// write paths, and re-reading every row on every restart would turn a restart
/// into an outage on a large catalogue.
pub async fn backfill(search: &Search, db: &Backend, collections: &[&str]) -> anyhow::Result<()> {
    for collection in collections {
        let indexed = match *collection {
            TRACKS => backfill_tracks(search, db).await?,
            ALBUMS => backfill_albums(search, db).await?,
            ARTISTS => backfill_artists(search, db).await?,
            USERS => backfill_users(search, db).await?,
            PLAYLISTS => backfill_playlists(search, db).await?,
            // Built from a join rather than one table, and only meaningful for
            // an instance that has uploads at all.
            LIBRARY_TRACKS => backfill_library(search, db).await?,
            other => {
                tracing::warn!(collection = other, "no backfill for this collection");
                0
            }
        };
        tracing::info!(collection = *collection, indexed, "backfilled search index");
    }
    Ok(())
}

/// How far the index may lag the database before it is rebuilt.
///
/// The index is eventually consistent by design — a row is committed, then
/// indexed — so it is never exactly equal on a live instance.
const BACKFILL_TOLERANCE: i64 = 50;

/// Builds any collection that is materially behind the database, in the
/// background.
///
/// In the background because it is slow and nothing depends on it being
/// finished: a half-built index answers queries for what it has, and every
/// write path keeps it current from here on. Doing it before the server binds
/// is what made a large instance unbootable — see [`crate::state::AppState`].
pub fn spawn_backfill(search: &Search, db: &Backend) -> tokio::task::JoinHandle<()> {
    let (search, db) = (search.clone(), db.clone());
    tokio::spawn(async move {
        let wanted = collections_needing_backfill(&search, &db, BACKFILL_TOLERANCE).await;
        if wanted.is_empty() {
            return;
        }

        tracing::info!(
            collections = ?wanted,
            "building the search index in the background; search results will be \
             incomplete until this finishes"
        );

        if let Err(err) = backfill(&search, &db, &wanted).await {
            tracing::error!(error = ?err, "could not fully build the search index");
        }
    })
}

/// How long to wait when Typesense reports it is behind.
const LAG_PAUSE: std::time::Duration = std::time::Duration::from_secs(5);

/// How long to keep waiting before giving up and pushing anyway.
///
/// A bound rather than forever: this runs in the background, and a Typesense
/// that is permanently unhappy — out of memory, say — must not silently stop
/// the index ever being built. Pushing into a lagging server still works; it
/// just makes the lag worse, which is why it is the last resort.
const LAG_PATIENCE: std::time::Duration = std::time::Duration::from_secs(300);

/// Blocks while Typesense is not keeping up with its write queue.
///
/// Importing a large catalogue is thousands of batches, and Typesense applies
/// them through raft. Pushed flat out, the write queue grows to hundreds of
/// thousands of entries, `GET /health` starts answering `{"ok":false}`, and
/// anything treating that as liveness — a container healthcheck, an
/// orchestrator's `depends_on` — concludes the server is broken and kills it.
/// The backfill is then interrupted, and on the next boot it starts again.
///
/// That loop is what this exists to prevent: the import goes only as fast as
/// Typesense says it can take it.
async fn wait_until_keeping_up(search: &Search, collection: &str) {
    let mut waited = std::time::Duration::ZERO;
    while !search.is_keeping_up().await {
        if waited >= LAG_PATIENCE {
            tracing::warn!(
                collection,
                seconds = waited.as_secs(),
                "Typesense is still behind; continuing the backfill anyway"
            );
            return;
        }
        if waited.is_zero() {
            tracing::info!(
                collection,
                "Typesense is behind on its write queue; pausing the backfill"
            );
        }
        tokio::time::sleep(LAG_PAUSE).await;
        waited += LAG_PAUSE;
    }
}

/// Collections whose index is materially shorter than the table behind it.
///
/// This is what decides whether to backfill, rather than whether the
/// collection was just created — see [`Search::document_count`] for why that
/// test cannot repair an interrupted build.
///
/// A small shortfall is ignored. The index is eventually consistent by
/// design: rows are written before they are indexed, so a count taken while
/// scrobbles are arriving is never exactly equal, and re-reading every row of
/// a large catalogue to chase a difference of five would make every restart an
/// outage.
pub async fn collections_needing_backfill(
    search: &Search,
    db: &Backend,
    tolerance: i64,
) -> Vec<&'static str> {
    let mut wanted = Vec::new();

    for (collection, table) in [
        (TRACKS, "tracks"),
        (ALBUMS, "albums"),
        (ARTISTS, "artists"),
        (USERS, "users"),
        (PLAYLISTS, "playlists"),
    ] {
        let rows = match count_rows(db, table).await {
            Ok(rows) => rows,
            Err(err) => {
                tracing::warn!(table, error = ?err, "could not count rows to check the index");
                continue;
            }
        };

        let docs = match search.document_count(collection).await {
            // Missing entirely: `ensure_collections` will have just made it.
            Ok(None) => 0,
            Ok(Some(docs)) => docs,
            Err(err) => {
                tracing::warn!(collection, error = %err, "could not read the index size");
                continue;
            }
        };

        if rows - docs > tolerance {
            tracing::info!(
                collection,
                rows,
                docs,
                "the search index is behind the database"
            );
            wanted.push(collection);
        }
    }

    // `library_tracks` is a join over uploads rather than one table, so it has
    // no row count to compare against. Built when it is empty and there are
    // uploads to put in it.
    if let (Ok(Some(0)), Ok(uploads)) = (
        search.document_count(LIBRARY_TRACKS).await,
        count_rows(db, "user_tracks").await,
    ) {
        if uploads > 0 {
            wanted.push(LIBRARY_TRACKS);
        }
    }

    wanted
}

async fn count_rows(db: &Backend, table: &str) -> Result<i64, sqlx::Error> {
    let query = Query::select()
        .expr(db.cast_int(Func::count(Expr::col(Asterisk))))
        .from(Alias::new(table))
        .to_owned();
    db.count(&query).await
}

/// Streams one table into the index in batches, ordered by id so the paging is
/// stable while rows are being written underneath.
macro_rules! backfill_table {
    ($name:ident, $model:ty, $cols:expr, $table:expr, $collection:expr, $doc:path) => {
        async fn $name(search: &Search, db: &Backend) -> anyhow::Result<usize> {
            let mut after = String::new();
            let mut total = 0;

            loop {
                let mut query = Query::select();
                db.select_model(&mut query, $cols, None);
                // Keyset paging, not OFFSET: rows are being written underneath
                // and an OFFSET scan over a growing table skips rows.
                query
                    .from(Alias::new($table))
                    .and_where(Expr::col(Alias::new("xata_id")).gt(after.as_str()))
                    .order_by(Alias::new("xata_id"), Order::Asc)
                    .limit(IMPORT_BATCH as u64);

                let rows: Vec<$model> = db.fetch_all(&query).await?;
                if rows.is_empty() {
                    return Ok(total);
                }

                after = rows[rows.len() - 1].id.clone();
                total += rows.len();

                // Wait if Typesense is behind, before adding to what it is
                // already struggling with — see `wait_until_keeping_up`.
                wait_until_keeping_up(search, $collection).await;

                let docs: Vec<serde_json::Value> = rows.iter().map($doc).collect();
                if let Err(err) = search.index($collection, &docs).await {
                    // Logged and skipped rather than fatal: a partial index is
                    // far better than a boot that fails on one bad batch, and
                    // the write paths will correct these rows as they change.
                    tracing::error!(
                        collection = $collection,
                        error = %err,
                        "a backfill batch failed"
                    );
                }
            }
        }
    };
}

backfill_table!(
    backfill_tracks,
    models::Track,
    models::TRACK_COLS,
    "tracks",
    TRACKS,
    track_doc
);
backfill_table!(
    backfill_albums,
    models::Album,
    models::ALBUM_COLS,
    "albums",
    ALBUMS,
    album_doc
);
backfill_table!(
    backfill_artists,
    models::Artist,
    models::ARTIST_COLS,
    "artists",
    ARTISTS,
    artist_doc
);
backfill_table!(
    backfill_users,
    models::User,
    models::USER_COLS,
    "users",
    USERS,
    user_doc
);
backfill_table!(
    backfill_playlists,
    models::Playlist,
    models::PLAYLIST_COLS,
    "playlists",
    PLAYLISTS,
    playlist_doc
);

async fn backfill_library(search: &Search, db: &Backend) -> anyhow::Result<usize> {
    let mut after = String::new();
    let mut total = 0;

    loop {
        let rows = crate::uploads::load_documents(db, &after, IMPORT_BATCH as i64).await?;
        if rows.is_empty() {
            return Ok(total);
        }

        after = rows[rows.len() - 1].id.clone();
        total += rows.len();

        let docs: Vec<serde_json::Value> = rows
            .iter()
            .map(|doc| serde_json::to_value(doc).unwrap_or(serde_json::Value::Null))
            .collect();
        if let Err(err) = search.index(LIBRARY_TRACKS, &docs).await {
            tracing::error!(error = %err, "a library backfill batch failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The five collection names are the discriminant the web client switches
    /// on (`apps/web/src/types/search.ts`). A rename here is a search box that
    /// renders nothing.
    #[test]
    fn the_collection_names_are_the_ones_the_client_discriminates_on() {
        assert_eq!(
            FEDERATED,
            ["albums", "artists", "tracks", "users", "playlists"]
        );
        assert_eq!(LIBRARY_TRACKS, "library_tracks");
    }

    /// Every federated collection must declare every field it claims to search
    /// on, or Typesense answers 404 for the whole search.
    #[test]
    fn every_query_by_field_is_declared_in_its_schema() {
        let schemas = collection_schemas();

        for collection in FEDERATED {
            let schema = schemas
                .iter()
                .find(|s| s["name"] == collection)
                .unwrap_or_else(|| panic!("{collection} has no schema"));

            let declared: Vec<&str> = schema["fields"]
                .as_array()
                .unwrap()
                .iter()
                .map(|field| field["name"].as_str().unwrap())
                .collect();

            for field in query_by(collection).split(',') {
                assert!(
                    declared.contains(&field),
                    "{collection} searches on {field}, which its schema does not declare: \
                     {declared:?}"
                );
            }
        }
    }

    /// `library_tracks` sorts by `uploaded_at`, which Typesense requires to be
    /// declared and numeric.
    #[test]
    fn the_library_collection_can_sort_by_its_default_field() {
        let schema = collection_schemas()
            .into_iter()
            .find(|s| s["name"] == LIBRARY_TRACKS)
            .unwrap();

        assert_eq!(schema["default_sorting_field"], "uploaded_at");

        let field = schema["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["name"] == "uploaded_at")
            .expect("the sorting field must be declared");
        assert_eq!(field["type"], "int64");
    }

    /// The document keys are what the client reads. camelCase for the five,
    /// snake_case for the library — see the module note on why they differ.
    #[test]
    fn a_track_document_uses_the_keys_the_client_reads() {
        let track = models::Track {
            id: "rec_track".into(),
            title: "Roygbiv".into(),
            artist: "Boards of Canada".into(),
            album_artist: "Boards of Canada".into(),
            album_art: Some("https://cdn/art.jpg".into()),
            album: "Music Has the Right to Children".into(),
            track_number: Some(9),
            duration: 150_000,
            mb_id: None,
            isrc: None,
            youtube_link: None,
            spotify_link: Some("https://open.spotify.com/track/x".into()),
            apple_music_link: None,
            tidal_link: None,
            sha256: "abc".into(),
            disc_number: Some(1),
            lyrics: Some("a very long lyric sheet".into()),
            composer: Some("Sandison".into()),
            genre: Some("Electronic".into()),
            label: None,
            copyright_message: None,
            key: None,
            bpm: None,
            uri: Some("at://did:plc:x/app.rocksky.song/3abc".into()),
            album_uri: None,
            artist_uri: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            xata_version: Some(0),
        };

        let doc = track_doc(&track);

        assert_eq!(doc["albumArtist"], "Boards of Canada");
        assert_eq!(doc["albumArt"], "https://cdn/art.jpg");
        assert!(
            doc.get("album_artist").is_none(),
            "snake_case would be unreadable to the client: {doc}"
        );

        // Columns with no business in a search index stay out of it.
        assert!(doc.get("lyrics").is_none(), "{doc}");
        assert!(doc.get("spotifyLink").is_none(), "{doc}");
        assert!(doc.get("sha256").is_none(), "{doc}");
    }

    /// An unreachable index must say what to do about it, since it stops the
    /// process.
    #[tokio::test]
    async fn an_unreachable_index_explains_itself() {
        // Port 1 is reserved and nothing listens there.
        let error = Search::connect("http://127.0.0.1:1", "key")
            .await
            .expect_err("connecting to a closed port must fail");

        let message = error.to_string();
        assert!(message.contains("Typesense is required"), "{message}");
        assert!(message.contains("docker-compose"), "{message}");
        assert!(message.contains("http://127.0.0.1:1"), "{message}");
    }

    /// A trailing slash in the configured URL must not produce `//collections`.
    #[test]
    fn a_trailing_slash_is_trimmed() {
        let search = Search::new("http://localhost:8108/", "key").unwrap();
        assert_eq!(search.base, "http://localhost:8108");
    }
}
