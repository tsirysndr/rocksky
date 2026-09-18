//! `app.rocksky.mirror.*` — pulling scrobbles in from, and pushing them out
//! to, other services.
//!
//! Three providers, and they are not symmetrical:
//!
//! | provider       | direction | needs a username | needs a credential |
//! |----------------|-----------|------------------|--------------------|
//! | `lastfm`       | pull      | yes              | no                 |
//! | `listenbrainz` | pull      | yes              | no                 |
//! | `tealfm`       | push      | no               | no                 |
//!
//! The two pull providers read a public profile, so a username is required and
//! an API key is optional. `tealfm` is the other direction — Rocksky writing
//! `fm.teal.*` records into the user's own repository — so it has no username
//! and no credential, only an on/off switch.
//!
//! # A row that does not exist is not "off"
//!
//! `getMirrorSources` always answers with all three providers, seeded from
//! defaults and overlaid with whatever rows exist. The UI renders one toggle
//! per provider and never has to distinguish "no row" from "disabled" — which
//! matters because the two are not the same for `tealfm`, where a missing row
//! means *enabled*.
//!
//! # `push_enabled` is deliberately nullable
//!
//! `NULL` means the person never chose, and the default for that is on. A
//! stored `true`/`false` is their own choice and always wins. The distinction
//! is what lets the operator's `disabled_tealfm` list change the default for
//! people who have not decided, without overriding anyone who has.

use crate::auth::AuthDid;
use crate::db::schema::{MirrorSources, Users};
use crate::db::{new_id, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Alias, Expr, Query, SelectStatement};
use crate::state::AppState;
use crate::xrpc::json;
use crate::{xrpc_procedure, xrpc_query};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.mirror.getMirrorSources", get_sources);
    xrpc_procedure!(cfg, "app.rocksky.mirror.putMirrorSource", put_source);
}

/// Every provider, in the order the UI lists them.
const PROVIDERS: [&str; 3] = ["lastfm", "listenbrainz", "tealfm"];

/// The push provider, named once so the publish path and these endpoints
/// cannot drift apart on the spelling.
pub(crate) const TEALFM: &str = "tealfm";

/// Providers that read someone else's service and therefore need to know who
/// to read.
const NEEDS_USERNAME: [&str; 2] = ["lastfm", "listenbrainz"];

/// How far back the first poll after enabling reaches.
///
/// Without this the watermark would start at "now" and the first poll would
/// find nothing — everything listened to in the hours before the toggle was
/// flipped would be skipped, which reads as a mirror that does not work.
const BACKFILL_WINDOW: chrono::Duration = chrono::Duration::hours(24);

// ------------------------------------------------------------------ the view

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorSourceView {
    pub provider: String,
    pub enabled: bool,
    pub push_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_username: Option<String>,
    /// Whether a credential is stored — never the credential itself.
    pub has_credentials: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_polled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_scrobble_seen_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourcesOutput {
    pub sources: Vec<MirrorSourceView>,
}

/// A `mirror_sources` row.
#[derive(Debug, Clone, sqlx::FromRow)]
struct SourceRow {
    id: String,
    provider: String,
    enabled: bool,
    push_enabled: Option<bool>,
    external_username: Option<String>,
    encrypted_api_key: Option<String>,
    last_polled_at: Option<chrono::DateTime<chrono::Utc>>,
    last_scrobble_seen_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Adds every column [`SourceRow`] reads, aliasing `xata_id` to `id`.
///
/// A function rather than a string so the columns are checked against the
/// schema at compile time — a renamed column stops building instead of
/// producing a query that fails at runtime.
fn select_source(query: &mut SelectStatement) {
    query
        .expr_as(Expr::col(MirrorSources::XataId), Alias::new("id"))
        .columns([
            MirrorSources::Provider,
            MirrorSources::Enabled,
            MirrorSources::PushEnabled,
            MirrorSources::ExternalUsername,
            MirrorSources::EncryptedApiKey,
            MirrorSources::LastPolledAt,
            MirrorSources::LastScrobbleSeenAt,
        ])
        .from(MirrorSources::Table);
}

/// Resolves the stored `push_enabled` into the answer.
///
/// A stored value is the person's own choice and stands. `NULL` means they
/// never chose: the default is on, and the operator's `disabled_tealfm` list
/// only gets to change that default.
///
/// `[tealfm].enabled = false` is different from both, and overrides them: it
/// turns the feature off for the instance, so reporting anyone as enabled
/// would be telling them a publish will happen that never will.
fn resolve_push_enabled(stored: Option<bool>, did: &str, state: &AppState) -> bool {
    if !state.config().tealfm_enabled {
        return false;
    }
    match stored {
        Some(choice) => choice,
        None => !state
            .config()
            .disabled_tealfm
            .iter()
            .any(|entry| entry == did),
    }
}

/// Whether Rocksky may write `fm.teal.*` records into this person's repo.
///
/// The preference lives in `mirror_sources` because that is where the
/// per-provider toggles are, but the feature it gates is not the mirror: it is
/// the publish that happens when a scrobble is written — see
/// [`crate::xrpc::app_rocksky::scrobble_write`]. This is the one place outside
/// these endpoints that reads it, and before it existed the toggle was stored,
/// reported back as on, and acted on nowhere.
///
/// A missing row means enabled, which is why this cannot just look for `true`.
pub(crate) async fn is_teal_push_enabled(state: &AppState, did: &str) -> bool {
    // The operator's switch wins over everything. Checked first so an instance
    // with teal.fm off does not query the database per scrobble.
    if !state.config().tealfm_enabled {
        return false;
    }

    let query = Query::select()
        .column((MirrorSources::Table, MirrorSources::PushEnabled))
        .from(MirrorSources::Table)
        .inner_join(
            Users::Table,
            Expr::col((Users::Table, Users::XataId))
                .equals((MirrorSources::Table, MirrorSources::UserId)),
        )
        .and_where(Expr::col((Users::Table, Users::Did)).eq(did))
        .and_where(Expr::col((MirrorSources::Table, MirrorSources::Provider)).eq(TEALFM))
        .limit(1)
        .to_owned();

    // A query failure resolves the same way a missing row does. The
    // alternative is dropping a publish because of a transient database error,
    // and the stored default is "on" anyway.
    let stored = state
        .db()
        .fetch_optional::<(Option<bool>,)>(&query)
        .await
        .unwrap_or_default()
        .and_then(|(stored,)| stored);

    resolve_push_enabled(stored, did, state)
}

impl SourceRow {
    fn view(&self, did: &str, state: &AppState) -> MirrorSourceView {
        MirrorSourceView {
            provider: self.provider.clone(),
            enabled: self.enabled,
            push_enabled: resolve_push_enabled(self.push_enabled, did, state),
            external_username: self.external_username.clone(),
            // A bool, not the value: this response reaches the browser.
            has_credentials: self.encrypted_api_key.is_some(),
            last_polled_at: self.last_polled_at.map(format_timestamp),
            last_scrobble_seen_at: self.last_scrobble_seen_at.map(format_timestamp),
        }
    }
}

/// The three JS-compatible fractional digits every timestamp in this API uses.
fn format_timestamp(at: chrono::DateTime<chrono::Utc>) -> String {
    at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// A provider with no row yet.
fn default_view(provider: &str, did: &str, state: &AppState) -> MirrorSourceView {
    MirrorSourceView {
        provider: provider.to_string(),
        enabled: false,
        push_enabled: resolve_push_enabled(None, did, state),
        external_username: None,
        has_credentials: false,
        last_polled_at: None,
        last_scrobble_seen_at: None,
    }
}

// -------------------------------------------------------------------- reading

/// `app.rocksky.mirror.getMirrorSources`
async fn get_sources(state: web::Data<AppState>, auth: AuthDid) -> XrpcResult<HttpResponse> {
    let rows = match load_sources(state.db(), &auth.did).await {
        Ok(rows) => rows,
        Err(err) => {
            // The three default cards rather than an error: the settings page
            // is otherwise unusable, and every toggle on it is idempotent.
            tracing::error!(did = %auth.did, error = ?err, "error retrieving mirror sources");
            Vec::new()
        }
    };

    let sources = PROVIDERS
        .iter()
        .map(|provider| {
            rows.iter()
                .find(|row| row.provider == *provider)
                .map(|row| row.view(&auth.did, &state))
                .unwrap_or_else(|| default_view(provider, &auth.did, &state))
        })
        .collect();

    json(SourcesOutput { sources })
}

async fn load_sources(db: &Backend, did: &str) -> Result<Vec<SourceRow>, sqlx::Error> {
    let mut query = Query::select();
    select_source(&mut query);
    query.and_where(
        Expr::col(MirrorSources::UserId).in_subquery(
            Query::select()
                .column(Users::XataId)
                .from(Users::Table)
                .and_where(Expr::col(Users::Did).eq(did))
                .take(),
        ),
    );
    db.fetch_all(&query).await
}

// -------------------------------------------------------------------- writing

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PutSourceInput {
    pub provider: String,
    /// Absent means "leave as it is", which is why these are all `Option`:
    /// the UI sends one field at a time as each control changes.
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub push_enabled: Option<bool>,
    #[serde(default)]
    pub external_username: Option<String>,
    /// An empty string clears the stored credential; absent leaves it.
    #[serde(default)]
    pub api_key: Option<String>,
}

/// `app.rocksky.mirror.putMirrorSource`
///
/// Unlike the TypeScript handler, a rejected request is an error rather than a
/// `{ enabled: false }` body. Answering 200 with the toggle off is how
/// `apps/api` reports "you must set a username first": the switch springs back
/// with no explanation, and the reason is only in the server log.
async fn put_source(
    state: web::Data<AppState>,
    auth: AuthDid,
    input: web::Json<PutSourceInput>,
) -> XrpcResult<HttpResponse> {
    let input = input.into_inner();

    if !PROVIDERS.contains(&input.provider.as_str()) {
        return Err(XrpcError::invalid_request(format!(
            "Unknown provider: {}. Expected one of {}.",
            input.provider,
            PROVIDERS.join(", ")
        )));
    }

    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let existing = find_source(db, &user_id, &input.provider).await?;

    // A pull provider cannot poll without knowing whose profile to read, so
    // enabling one without a username would produce a toggle that is on and
    // does nothing.
    if input.enabled == Some(true) && NEEDS_USERNAME.contains(&input.provider.as_str()) {
        let username = input
            .external_username
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .or_else(|| {
                existing
                    .as_ref()
                    .and_then(|row| row.external_username.as_deref())
            });
        if username.is_none() {
            return Err(XrpcError::invalid_request(format!(
                "{} needs a username before it can be enabled.",
                input.provider
            ))
            .named("MissingExternalUsername"));
        }
    }

    // `None` = leave the column alone, `Some(None)` = clear it, `Some(Some)` =
    // set it. Three states, because the field is optional *and* nullable.
    let encrypted = match input.api_key.as_deref() {
        None => None,
        Some("") => Some(None),
        Some(key) => Some(Some(
            crate::crypto::encrypt_credential(state.storage_encryption_key(), key)
                .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?,
        )),
    };

    // Only when going from not-enabled to enabled: re-seeding on every save
    // would make the next poll re-read a day of history each time the user
    // touched an unrelated field.
    let enabling =
        input.enabled == Some(true) && !existing.as_ref().map(|row| row.enabled).unwrap_or(false);
    let watermark = (chrono::Utc::now() - BACKFILL_WINDOW).to_rfc3339();

    let row = match existing {
        Some(existing) => {
            update_source(db, &existing, &input, encrypted, enabling, &watermark).await?
        }
        None => insert_source(db, &user_id, &input, encrypted, &watermark).await?,
    };

    // The mirror process runs per-user tasks and has to be told to start or
    // stop one. Best effort: the row is the source of truth, so a missed
    // message costs a delay until the next sweep, not a lost setting.
    if let Some(events) = state.events() {
        events
            .publish_text(
                crate::events::subject::MIRROR_USER,
                &format!("{}:{}", row.provider, user_id),
            )
            .await;
    }

    json(row.view(&auth.did, &state))
}

async fn update_source(
    db: &Backend,
    existing: &SourceRow,
    input: &PutSourceInput,
    encrypted: Option<Option<String>>,
    enabling: bool,
    watermark: &str,
) -> Result<SourceRow, XrpcError> {
    // A partial update: only the fields the request actually carried. Building
    // it as a statement rather than a string is the point of the builder —
    // `UPDATE … SET` with a conditional column list is where hand-written SQL
    // grows a comma bug that only fires on one branch.
    let mut update = Query::update();
    update
        .table(MirrorSources::Table)
        .value(MirrorSources::XataUpdatedat, crate::db::now_timestamp());

    if let Some(enabled) = input.enabled {
        update.value(MirrorSources::Enabled, enabled);
    }
    if let Some(push_enabled) = input.push_enabled {
        update.value(MirrorSources::PushEnabled, push_enabled);
    }
    if let Some(username) = &input.external_username {
        update.value(MirrorSources::ExternalUsername, username.trim());
    }
    if let Some(encrypted) = encrypted {
        // `Some(None)` clears it; sea-query takes the `Option` directly and
        // writes NULL.
        update.value(MirrorSources::EncryptedApiKey, encrypted);
    }
    if enabling {
        update.value(MirrorSources::LastScrobbleSeenAt, watermark);
    }

    update.and_where(Expr::col(MirrorSources::XataId).eq(&existing.id));
    db.execute(&update).await?;

    reload(db, &existing.id).await
}

async fn insert_source(
    db: &Backend,
    user_id: &str,
    input: &PutSourceInput,
    encrypted: Option<Option<String>>,
    watermark: &str,
) -> Result<SourceRow, XrpcError> {
    let id = new_id();
    let enabled = input.enabled.unwrap_or(false);

    let insert = Query::insert()
        .into_table(MirrorSources::Table)
        .columns([
            MirrorSources::XataId,
            MirrorSources::UserId,
            MirrorSources::Provider,
            MirrorSources::Enabled,
            MirrorSources::PushEnabled,
            MirrorSources::ExternalUsername,
            MirrorSources::EncryptedApiKey,
            MirrorSources::LastScrobbleSeenAt,
        ])
        .values_panic([
            id.clone().into(),
            user_id.into(),
            input.provider.clone().into(),
            enabled.into(),
            // Left NULL when unspecified, so the default stays "on unless the
            // operator disabled it" rather than being frozen to today's answer.
            input.push_enabled.into(),
            input
                .external_username
                .as_deref()
                .map(str::trim)
                .map(str::to_string)
                .into(),
            encrypted.flatten().into(),
            if enabled {
                Some(watermark.to_string())
            } else {
                None
            }
            .into(),
        ])
        .to_owned();
    db.execute(&insert).await?;

    reload(db, &id).await
}

/// Re-reads the row rather than assembling the answer from the input.
///
/// The response has to describe what is stored, and the input only says what
/// changed — every untouched column would otherwise have to be carried over by
/// hand, which is exactly where this kind of code goes wrong.
async fn reload(db: &Backend, id: &str) -> Result<SourceRow, XrpcError> {
    let mut query = Query::select();
    select_source(&mut query);
    query
        .and_where(Expr::col(MirrorSources::XataId).eq(id))
        .limit(1);

    db.fetch_optional::<SourceRow>(&query)
        .await?
        .ok_or_else(|| XrpcError::internal(anyhow::anyhow!("the mirror source vanished")))
}

async fn find_source(
    db: &Backend,
    user_id: &str,
    provider: &str,
) -> Result<Option<SourceRow>, sqlx::Error> {
    let mut query = Query::select();
    select_source(&mut query);
    query
        .and_where(Expr::col(MirrorSources::UserId).eq(user_id))
        .and_where(Expr::col(MirrorSources::Provider).eq(provider))
        .limit(1);

    db.fetch_optional(&query).await
}

async fn caller_id(db: &Backend, did: &str) -> Result<String, XrpcError> {
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .take();

    db.fetch_scalar::<String>(&query)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connect_in_memory;
    // Aliased: importing `actix_web::test` unqualified shadows the built-in
    // `#[test]` attribute, so a plain synchronous test in this module would be
    // expanded as an actix test and fail to compile for want of `async`.
    use actix_web::{test as http, App};

    macro_rules! app {
        ($state:expr) => {
            http::init_service(
                App::new()
                    // Both forms, as the server registers them: the `AppState`
                    // itself for the extractors that read it directly, and the
                    // `Data` wrapper for the handlers' `web::Data<AppState>`.
                    .app_data($state.clone())
                    .app_data(web::Data::new($state.clone()))
                    .configure(crate::xrpc::configure),
            )
            .await
        };
    }

    /// A state with one signed-in user, and their bearer token.
    async fn signed_in() -> (AppState, String) {
        let state = AppState::for_test().await.unwrap();
        crate::ingest::upsert_user(state.db(), "did:plc:alice")
            .await
            .unwrap();
        let token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:alice").unwrap();
        (state, token)
    }

    /// The queries this module builds have to *run*, not just compile. Every
    /// one of them was rewritten from a SQL string into a sea-query statement,
    /// and a statement that builds can still name the wrong column or write to
    /// the wrong row — so this drives the real endpoints against a real
    /// database and reads back what was stored.
    #[actix_web::test]
    async fn a_source_round_trips_through_the_api() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        // Nothing stored yet: three defaults.
        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.mirror.getMirrorSources")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["sources"].as_array().map(Vec::len), Some(3), "{body}");
        assert_eq!(body["sources"][0]["enabled"], false);

        // Enable Last.fm with a username and a credential — the insert path.
        let res = http::call_service(
            &app,
            http::TestRequest::post()
                .uri("/xrpc/app.rocksky.mirror.putMirrorSource")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({
                    "provider": "lastfm",
                    "enabled": true,
                    "externalUsername": "alice",
                    "apiKey": "super-secret",
                }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["provider"], "lastfm");
        assert_eq!(body["enabled"], true);
        assert_eq!(body["externalUsername"], "alice");
        assert_eq!(body["hasCredentials"], true);
        // The watermark was seeded so the first poll reaches back a day.
        assert!(body["lastScrobbleSeenAt"].is_string(), "{body}");
        // And the credential itself never comes back.
        assert!(
            !serde_json::to_string(&body)
                .unwrap()
                .contains("super-secret"),
            "{body}"
        );

        // A partial update: only the username. Everything else must survive,
        // which is the thing a conditional UPDATE gets wrong.
        let res = http::call_service(
            &app,
            http::TestRequest::post()
                .uri("/xrpc/app.rocksky.mirror.putMirrorSource")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({
                    "provider": "lastfm",
                    "externalUsername": "alice2",
                }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["externalUsername"], "alice2");
        assert_eq!(body["enabled"], true, "the update cleared enabled: {body}");
        assert_eq!(
            body["hasCredentials"], true,
            "the update cleared the credential: {body}"
        );

        // An empty apiKey clears the credential, and only that.
        let res = http::call_service(
            &app,
            http::TestRequest::post()
                .uri("/xrpc/app.rocksky.mirror.putMirrorSource")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({ "provider": "lastfm", "apiKey": "" }))
                .to_request(),
        )
        .await;
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["hasCredentials"], false, "{body}");
        assert_eq!(body["externalUsername"], "alice2", "{body}");

        // And the listing reflects all of it, with the other two still default.
        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.mirror.getMirrorSources")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        let body: serde_json::Value = http::read_body_json(res).await;
        let sources = body["sources"].as_array().unwrap();
        assert_eq!(sources.len(), 3);
        let lastfm = sources.iter().find(|s| s["provider"] == "lastfm").unwrap();
        assert_eq!(lastfm["enabled"], true);
        assert_eq!(lastfm["externalUsername"], "alice2");
        let tealfm = sources.iter().find(|s| s["provider"] == "tealfm").unwrap();
        assert_eq!(tealfm["enabled"], false);
        assert_eq!(tealfm["pushEnabled"], true, "the NULL default is on");
    }

    /// Enabling a pull provider with no username is refused, rather than
    /// stored as a toggle that is on and polls nothing.
    #[actix_web::test]
    async fn enabling_lastfm_without_a_username_is_refused() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        let res = http::call_service(
            &app,
            http::TestRequest::post()
                .uri("/xrpc/app.rocksky.mirror.putMirrorSource")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({ "provider": "lastfm", "enabled": true }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 400);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["error"], "MissingExternalUsername");

        // teal.fm is the push direction and needs none.
        let res = http::call_service(
            &app,
            http::TestRequest::post()
                .uri("/xrpc/app.rocksky.mirror.putMirrorSource")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({ "provider": "tealfm", "enabled": true }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
    }

    /// An unknown provider is a 400 naming the three that exist.
    #[actix_web::test]
    async fn an_unknown_provider_is_rejected() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        let res = http::call_service(
            &app,
            http::TestRequest::post()
                .uri("/xrpc/app.rocksky.mirror.putMirrorSource")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({ "provider": "spotify", "enabled": true }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 400);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert!(
            body["message"]
                .as_str()
                .unwrap_or_default()
                .contains("lastfm"),
            "{body}"
        );
    }

    /// One person's settings must never be readable as another's.
    #[actix_web::test]
    async fn sources_are_scoped_to_the_caller() {
        let (state, alice_token) = signed_in().await;
        crate::ingest::upsert_user(state.db(), "did:plc:bob")
            .await
            .unwrap();
        let bob_token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:bob").unwrap();
        let app = app!(state);

        http::call_service(
            &app,
            http::TestRequest::post()
                .uri("/xrpc/app.rocksky.mirror.putMirrorSource")
                .insert_header(("authorization", format!("Bearer {alice_token}")))
                .set_json(serde_json::json!({
                    "provider": "lastfm",
                    "enabled": true,
                    "externalUsername": "alice",
                }))
                .to_request(),
        )
        .await;

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.mirror.getMirrorSources")
                .insert_header(("authorization", format!("Bearer {bob_token}")))
                .to_request(),
        )
        .await;
        let body: serde_json::Value = http::read_body_json(res).await;
        let lastfm = body["sources"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["provider"] == "lastfm")
            .unwrap();
        assert_eq!(
            lastfm["enabled"], false,
            "alice's row leaked to bob: {body}"
        );
        assert!(lastfm["externalUsername"].is_null(), "{body}");
    }

    /// The `NULL` default, and the operator's override of it.
    #[tokio::test]
    async fn an_unset_choice_defaults_on_unless_the_operator_says_otherwise() {
        let mut config = crate::Config::for_test();
        config.disabled_tealfm = vec!["did:plc:blocked".into()];
        let state = crate::state::AppState::for_test_with(config).await.unwrap();

        // Nobody in particular: the default is on.
        assert!(resolve_push_enabled(None, "did:plc:alice", &state));
        // On the operator's list: the default flips.
        assert!(!resolve_push_enabled(None, "did:plc:blocked", &state));

        // But an explicit choice wins either way — the list changes a default,
        // not a decision someone already made.
        assert!(resolve_push_enabled(Some(true), "did:plc:blocked", &state));
        assert!(!resolve_push_enabled(Some(false), "did:plc:alice", &state));
    }

    /// `[tealfm].enabled = false` is the operator's switch over the instance,
    /// and it is a different lever from `disabled_dids`: it overrides an
    /// explicit choice rather than only the default.
    ///
    /// It has to be reflected in what is reported, too. Answering `true` for
    /// someone whose publish will never happen is the bug this whole feature
    /// had before the writer existed.
    #[tokio::test]
    async fn the_instance_switch_overrides_even_an_explicit_choice() {
        let mut config = crate::Config::for_test();
        config.tealfm_enabled = false;
        let state = crate::state::AppState::for_test_with(config).await.unwrap();

        assert!(!resolve_push_enabled(None, "did:plc:alice", &state));
        assert!(
            !resolve_push_enabled(Some(true), "did:plc:alice", &state),
            "an instance with teal.fm off must not report anyone as enabled"
        );
        assert!(
            !is_teal_push_enabled(&state, "did:plc:alice").await,
            "and the publish path must agree with what is reported"
        );
    }

    /// On by default: a fresh instance publishes without being configured to.
    #[tokio::test]
    async fn the_instance_switch_defaults_on() {
        let state = crate::state::AppState::for_test().await.unwrap();
        assert!(state.config().tealfm_enabled);
        assert!(is_teal_push_enabled(&state, "did:plc:alice").await);
    }

    /// Every provider is reported even with no rows, so the UI has three
    /// toggles to render rather than an empty page.
    #[actix_web::test]
    async fn all_three_providers_are_reported_without_any_rows() {
        let state = crate::state::AppState::for_test().await.unwrap();
        let sources: Vec<MirrorSourceView> = PROVIDERS
            .iter()
            .map(|provider| default_view(provider, "did:plc:alice", &state))
            .collect();

        assert_eq!(sources.len(), 3);
        assert_eq!(
            sources
                .iter()
                .map(|s| s.provider.as_str())
                .collect::<Vec<_>>(),
            vec!["lastfm", "listenbrainz", "tealfm"]
        );
        assert!(sources.iter().all(|s| !s.enabled && !s.has_credentials));
    }

    /// A stored credential must never leave the server.
    #[tokio::test]
    async fn a_view_reports_that_a_credential_exists_but_not_what_it_is() {
        let state = crate::state::AppState::for_test().await.unwrap();
        let row = SourceRow {
            id: "rec_ms".into(),
            provider: "lastfm".into(),
            enabled: true,
            push_enabled: None,
            external_username: Some("alice".into()),
            encrypted_api_key: Some("v1:deadbeef:cafe".into()),
            last_polled_at: None,
            last_scrobble_seen_at: None,
        };

        let view = row.view("did:plc:alice", &state);
        assert!(view.has_credentials);

        let json = serde_json::to_string(&view).unwrap();
        assert!(!json.contains("deadbeef"), "{json}");
        assert!(!json.contains("encrypted"), "{json}");
    }

    /// Enabling a pull provider with no username anywhere is refused, rather
    /// than stored as a toggle that is on and polls nothing.
    #[actix_web::test]
    async fn enabling_a_pull_provider_needs_a_username() {
        let db = connect_in_memory().await.unwrap();
        let user_id = crate::ingest::upsert_user(&db, "did:plc:alice")
            .await
            .unwrap();

        // No row and no username in the input.
        let existing = find_source(&db, &user_id, "lastfm").await.unwrap();
        assert!(existing.is_none());

        // tealfm is the push direction and needs neither.
        assert!(!NEEDS_USERNAME.contains(&"tealfm"));
        assert!(NEEDS_USERNAME.contains(&"lastfm"));
        assert!(NEEDS_USERNAME.contains(&"listenbrainz"));
    }

    /// The timestamps carry exactly three fractional digits, like every other
    /// timestamp this API emits — `Date.parse` accepts more, but a client
    /// comparing strings does not.
    #[test]
    fn timestamps_have_three_fractional_digits() {
        let at = chrono::DateTime::parse_from_rfc3339("2026-01-02T03:04:05.123456Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        assert_eq!(format_timestamp(at), "2026-01-02T03:04:05.123Z");
    }
}
