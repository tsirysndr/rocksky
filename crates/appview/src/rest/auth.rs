//! Login, token exchange and profile.
//!
//! The contract is `apps/web`'s, since the same bundle is served by both
//! servers (see `Main.tsx`). There are two ways in:
//!
//! **App password** — `POST /login {handle, password}` answers the literal
//! text `jwt:<token>`, which the UI splits on `"jwt:"`. One request, no public
//! URL, no key material. This is the only login that works on `localhost` or a
//! LAN address, because a PDS cannot fetch an OAuth client metadata document
//! from there.
//!
//! **OAuth** — `GET /login?handle=…` redirects to the user's PDS, which
//! redirects back to `GET /oauth/callback`, which redirects to the UI with
//! `?did=…`. The UI then calls `GET /token` with a `session-did` header to
//! collect the token.
//!
//! That last step is worth being explicit about: the token is handed out to
//! whoever presents the DID. `apps/api` keeps it in an unbounded in-process
//! map, so the window is until restart. Here it is single-use and expires in
//! [`TOKEN_HANDOFF_TTL`], which is as tight as the existing contract allows
//! without changing what the UI sends.

use crate::atproto::session::{self, SessionError};
use crate::auth::jwt::Claims;
use crate::error::{XrpcError, XrpcResult};
use crate::ingest;
use crate::state::AppState;
use actix_web::http::header::{HeaderValue, CONTENT_TYPE, LOCATION};
use actix_web::web::{self, ServiceConfig};
use actix_web::{HttpRequest, HttpResponse};
use jacquard_oauth::types::{AuthorizeOptionPrompt, AuthorizeOptions, CallbackParams};
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use smol_str::SmolStr;
use std::time::Duration;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/login", web::post().to(login_with_password))
        .route("/login", web::get().to(login_with_oauth))
        .route("/oauth/callback", web::get().to(oauth_callback))
        // The client_id in confidential mode: the authorization server fetches
        // this document, so it must be reachable at exactly that URL.
        .route(
            "/oauth-client-metadata.json",
            web::get().to(client_metadata_document),
        )
        // `apps/api` serves it at the path above; this alias is what some
        // other atproto clients look for.
        .route(
            "/client-metadata.json",
            web::get().to(client_metadata_document),
        )
        .route("/jwks.json", web::get().to(jwks_document))
        .route("/token", web::get().to(collect_token))
        .route("/logout", web::post().to(logout))
        .route("/profile", web::get().to(profile));
}

/// How long a token waits to be collected by `GET /token`. Short on purpose:
/// during this window the DID alone is enough to claim it.
const TOKEN_HANDOFF_TTL: Duration = Duration::from_secs(120);

/// Lifetime of a session token, matching `apps/api`'s 7 days.
const SESSION_LIFETIME_SECS: i64 = 60 * 60 * 24 * 7;

fn handoff_key(did: &str) -> String {
    format!("auth:handoff:{did}")
}

/// Mints a Rocksky session token. Same claims and algorithm as
/// `apps/api/src/bsky/app.ts`, so a token from either server verifies against
/// the other when they share a signing key.
pub fn mint_token(secret: &str, did: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = Claims {
        did: Some(did.to_string()),
        jti: None,
        token_type: None,
        iat: None,
        exp: Some(chrono::Utc::now().timestamp() + SESSION_LIFETIME_SECS),
    };
    jsonwebtoken::encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

#[derive(Debug, Deserialize)]
pub struct PasswordLogin {
    /// A handle or a DID. Named `handle` because that is what the UI sends.
    pub handle: String,
    /// An app password. A real account password works too, but Bluesky's
    /// guidance is to use an app password, and that is what the UI asks for.
    #[serde(default)]
    pub password: Option<String>,
}

/// `POST /login` — app-password login.
///
/// Answers `jwt:<token>` as plain text. The odd shape is the existing
/// contract: `Main.tsx` does `data.split("jwt:")[1]` on the response body.
async fn login_with_password(
    state: web::Data<AppState>,
    body: web::Json<PasswordLogin>,
) -> XrpcResult<HttpResponse> {
    let Some(password) = body.password.as_deref().filter(|p| !p.is_empty()) else {
        // No password means the caller wanted the OAuth flow, which is a GET.
        return Err(XrpcError::invalid_request(
            "A password is required. Use GET /login?handle=… for OAuth.",
        ));
    };

    let config = state.config();
    let session = session::create(
        state.http(),
        state.auth_db(),
        &config.plc_directory_url,
        &config.bsky_appview_url,
        &body.handle,
        password,
    )
    .await
    .map_err(login_error)?;

    // The account is indexed now so the profile exists before the first
    // scrobble, and so `/profile` has a row to return.
    sync_user(&state, &session.did, Some(&session.handle)).await;

    let token = mint_token(&config.jwt_secret, &session.did)
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    tracing::info!(did = %session.did, handle = %session.handle, "signed in with an app password");

    Ok(HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, "text/plain; charset=utf-8"))
        .body(format!("jwt:{token}")))
}

/// Maps a login failure onto a status the UI can show.
///
/// `POST /login` failures are surfaced to the user verbatim (`alert(error)` in
/// `Main.tsx`), so the messages here are written to be read by a person.
fn login_error(err: SessionError) -> XrpcError {
    match err {
        SessionError::Rejected => XrpcError::auth_required(
            "Your PDS rejected those credentials. If you are using an app \
             password, check it has not been revoked.",
        ),
        SessionError::InvalidIdentifier(identifier) => {
            XrpcError::invalid_request(format!("{identifier:?} is not a handle or a DID."))
        }
        SessionError::Unresolvable(handle) => {
            XrpcError::invalid_request(format!("Could not find an account for {handle:?}."))
        }
        SessionError::Resolve(err) => XrpcError::invalid_request(err.to_string()),
        SessionError::Upstream { status, .. } => XrpcError::with_message(
            crate::error::ResponseType::UpstreamFailure,
            format!("Your PDS answered {status}. Try again shortly."),
        ),
        // A transport or database failure is ours, not the caller's.
        other => XrpcError::internal(anyhow::anyhow!(other)),
    }
}

#[derive(Debug, Deserialize)]
pub struct OauthLogin {
    #[serde(default)]
    pub handle: Option<String>,
    /// Passed through by the CLI so the callback knows to hand the token to a
    /// local listener.
    #[serde(default)]
    pub cli: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
}

/// `GET /login?handle=…` — starts the OAuth flow.
///
/// Resolves the handle to its authorization server, makes a pushed
/// authorization request and redirects the browser to the consent screen. The
/// server then comes back to [`oauth_callback`].
async fn login_with_oauth(
    state: web::Data<AppState>,
    params: web::Query<OauthLogin>,
) -> XrpcResult<HttpResponse> {
    let oauth = state.oauth().ok_or_else(oauth_unavailable)?;

    // `prompt=create` sends the user to account creation instead of sign-in,
    // which needs no handle; otherwise one is required to find the right
    // authorization server.
    let input = match (params.handle.as_deref(), params.prompt.as_deref()) {
        (Some(handle), _) if !handle.trim().is_empty() => handle.trim().to_string(),
        (_, Some(_)) => state.config().bsky_appview_url.clone(),
        _ => {
            return Err(XrpcError::invalid_request(
                "A handle is required to sign in.",
            ))
        }
    };

    let mut options = AuthorizeOptions::<SmolStr>::default();
    if let Some(prompt) = params.prompt.as_deref() {
        options.prompt = match prompt {
            "login" => Some(AuthorizeOptionPrompt::Login),
            "none" => Some(AuthorizeOptionPrompt::None),
            // `create` and anything else fall through to the server's default,
            // which is the consent screen.
            _ => None,
        };
    }

    match oauth.client.start_auth(&input, options).await {
        Ok(url) => {
            // The CLI flow needs to be remembered across the redirect, and the
            // only thing that survives it is the `state` we do not control —
            // so it is keyed by the account instead, on the callback side.
            if let Some(cli) = params.cli.as_deref() {
                state
                    .cache()
                    .set_ex(&cli_key(&input), TOKEN_HANDOFF_TTL, cli)
                    .await;
            }
            Ok(HttpResponse::Found()
                .insert_header((
                    LOCATION,
                    HeaderValue::from_str(&url)
                        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?,
                ))
                .finish())
        }
        Err(err) => {
            tracing::warn!(input = %input, error = ?err, "could not start the OAuth flow");
            Err(XrpcError::invalid_request(format!(
                "Could not start sign-in for {input:?}. Check the handle is correct."
            )))
        }
    }
}

fn cli_key(input: &str) -> String {
    format!("auth:cli:{input}")
}

fn oauth_unavailable() -> XrpcError {
    XrpcError::with_message(
        crate::error::ResponseType::MethodNotImplemented,
        "OAuth login is not configured on this instance. Sign in with an app \
         password instead (POST /login with a handle and an app password \
         created in your Bluesky settings).",
    )
    .named("OauthUnavailable")
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub iss: Option<String>,
    /// Set when the user declined, or the server refused.
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub error_description: Option<String>,
}

/// `GET /oauth/callback` — completes the OAuth flow.
///
/// Exchanges the code for tokens, stores the session, then redirects to the UI
/// with `?did=…`; the UI collects the bearer token from [`collect_token`].
/// Failures redirect too, with `?error=1`, because the user is looking at a
/// browser here — a JSON error body would just be shown as text.
async fn oauth_callback(
    state: web::Data<AppState>,
    query: web::Query<CallbackQuery>,
) -> HttpResponse {
    let frontend = frontend_url(&state);

    if let Some(error) = query.error.as_deref() {
        tracing::info!(
            error,
            description = query.error_description.as_deref().unwrap_or_default(),
            "the authorization server refused the sign-in"
        );
        return error_redirect(&frontend);
    }

    let Some(oauth) = state.oauth() else {
        return error_redirect(&frontend);
    };

    let params = CallbackParams {
        code: query.code.clone().map(SmolStr::new).unwrap_or_default(),
        state: query.state.clone().map(SmolStr::new),
        iss: query.iss.clone().map(SmolStr::new),
    };

    let session = match oauth.client.callback(params).await {
        Ok(session) => session,
        Err(err) => {
            tracing::warn!(error = ?err, "the OAuth callback failed");
            return error_redirect(&frontend);
        }
    };

    let (did, _) = session.session_info().await;
    let did = did.to_string();

    // Index the account and mint the bearer token the UI will collect.
    sync_user(&state, &did, None).await;

    let token = match mint_token(&state.config().jwt_secret, &did) {
        Ok(token) => token,
        Err(err) => {
            tracing::error!(error = %err, "could not mint a token after sign-in");
            return error_redirect(&frontend);
        }
    };
    stash_token(&state, &did, &token).await;

    tracing::info!(did = %did, "signed in with OAuth");

    let cli = state.cache().get(&cli_key(&did)).await;
    if cli.is_some() {
        state.cache().delete(&cli_key(&did)).await;
    }
    frontend_redirect(&frontend, &did, cli.as_deref())
}

/// Where to send the browser after the callback.
///
/// The embedded UI is served by this same binary, so its own origin is the
/// right default; `[web].api_url` overrides it for a split deployment.
fn frontend_url(state: &AppState) -> String {
    state
        .config()
        .web_api_url
        .clone()
        .unwrap_or_else(|| state.config().public_url.clone())
}

fn error_redirect(frontend: &str) -> HttpResponse {
    let separator = if frontend.contains('?') { '&' } else { '?' };
    HttpResponse::Found()
        .insert_header((
            LOCATION,
            HeaderValue::from_str(&format!("{frontend}{separator}error=1"))
                .unwrap_or_else(|_| HeaderValue::from_static("/?error=1")),
        ))
        .finish()
}

/// `GET /oauth-client-metadata.json` — the client registration document.
///
/// In confidential mode this URL *is* the `client_id`, so the authorization
/// server fetches it on every login.
async fn client_metadata_document(state: web::Data<AppState>) -> XrpcResult<HttpResponse> {
    let oauth = state.oauth().ok_or_else(oauth_unavailable)?;
    Ok(HttpResponse::Ok().json(&oauth.metadata_document))
}

/// `GET /jwks.json` — the public halves of the signing keyset.
///
/// Only a confidential client has keys; a loopback client answers an empty set
/// rather than 404, since that is a valid JWKS and simpler for a client to
/// consume.
async fn jwks_document(state: web::Data<AppState>) -> XrpcResult<HttpResponse> {
    let oauth = state.oauth().ok_or_else(oauth_unavailable)?;
    Ok(match &oauth.jwks {
        Some(jwks) => HttpResponse::Ok().json(jwks),
        None => HttpResponse::Ok().json(serde_json::json!({ "keys": [] })),
    })
}

/// `GET /token` — collects the token minted by the OAuth callback.
///
/// Single-use: the entry is removed on read, so a token cannot be claimed
/// twice even inside the TTL.
async fn collect_token(state: web::Data<AppState>, req: HttpRequest) -> XrpcResult<HttpResponse> {
    let did = req
        .headers()
        .get("session-did")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|did| !did.is_empty() && *did != "null")
        .ok_or_else(|| XrpcError::invalid_request("Missing the session-did header."))?;

    let key = handoff_key(did);
    let Some(token) = state.cache().get(&key).await else {
        return Err(XrpcError::auth_required(
            "No pending sign-in for that account. Start the login again.",
        ));
    };
    state.cache().delete(&key).await;

    Ok(HttpResponse::Ok().json(TokenResponse { token }))
}

#[derive(Debug, Serialize)]
pub struct TokenResponse {
    pub token: String,
}

/// Stashes a freshly minted token for `GET /token` to collect.
pub async fn stash_token(state: &AppState, did: &str, token: &str) {
    state
        .cache()
        .set_ex(&handoff_key(did), TOKEN_HANDOFF_TTL, token)
        .await;
}

/// `POST /logout` — forgets this instance's session for the caller.
///
/// The bearer token itself stays valid until it expires (it is stateless), but
/// without a stored PDS session nothing can be written on the user's behalf.
async fn logout(
    state: web::Data<AppState>,
    auth: crate::auth::AuthDid,
) -> XrpcResult<HttpResponse> {
    session::delete(state.auth_db(), &auth.did)
        .await
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;
    tracing::info!(did = %auth.did, "signed out");
    Ok(HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })))
}

/// `GET /profile` — the signed-in user's profile.
///
/// Also refreshes the `users` row from the account's public Bluesky profile,
/// which is where the display name and avatar come from: repository records
/// carry neither.
async fn profile(
    state: web::Data<AppState>,
    auth: crate::auth::AuthDid,
) -> XrpcResult<HttpResponse> {
    sync_user(&state, &auth.did, None).await;

    let db = state.db();
    let mut sql = db.sql("SELECT ");
    sql.push(crate::db::models::select_list(
        crate::db::models::USER_COLS,
        db.dialect(),
        None,
    ))
    .push(" FROM users WHERE did = ")
    .bind(&auth.did)
    .push(" LIMIT 1");

    let user: Option<crate::db::models::User> = db.fetch_optional(&sql).await?;
    let user = user.ok_or_else(|| XrpcError::not_found("No profile for that account."))?;

    Ok(HttpResponse::Ok().json(ProfileResponse {
        id: user.id,
        did: user.did,
        handle: user.handle,
        display_name: user.display_name,
        avatar: user.avatar,
    }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileResponse {
    pub id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
}

/// Creates or refreshes the `users` row for `did`.
///
/// Never fails the request it is called from: a login must succeed even if the
/// Bluesky appview is unreachable, so a failure here is logged and the row is
/// left as it was.
pub async fn sync_user(state: &AppState, did: &str, known_handle: Option<&str>) {
    let db = state.db();

    if let Err(err) = ingest::upsert_user(db, did).await {
        tracing::warn!(did, error = ?err, "could not create the user row");
        return;
    }

    let profile = session::fetch_profile(state.http(), &state.config().bsky_appview_url, did).await;

    if let Some(handle) = profile.handle.as_deref().or(known_handle) {
        if let Err(err) = ingest::set_handle(db, did, handle).await {
            tracing::warn!(did, error = ?err, "could not record the handle");
        }
    }

    // Only overwrite when the lookup actually returned something, so a partial
    // or failed fetch never clobbers good data — same rule as `apps/api`.
    let mut sets: Vec<&str> = Vec::new();
    if profile.display_name.is_some() {
        sets.push("display_name");
    }
    if profile.avatar.is_some() {
        sets.push("avatar");
    }
    if sets.is_empty() {
        return;
    }

    let mut sql = db.sql("UPDATE users SET ");
    for (index, column) in sets.iter().enumerate() {
        if index > 0 {
            sql.push(", ");
        }
        sql.push(format!("{column} = "));
        match *column {
            "display_name" => sql.bind(profile.display_name.clone()),
            _ => sql.bind(profile.avatar.clone()),
        };
    }
    sql.push(", xata_updatedat = ")
        .bind(crate::db::now_timestamp())
        .push(" WHERE did = ")
        .bind(did);

    if let Err(err) = db.execute(&sql).await {
        tracing::warn!(did, error = ?err, "could not refresh the profile");
    }
}

/// Builds the redirect back to the UI after a successful OAuth callback.
pub fn frontend_redirect(frontend_url: &str, did: &str, cli: Option<&str>) -> HttpResponse {
    let separator = if frontend_url.contains('?') { '&' } else { '?' };
    let mut location = format!("{frontend_url}{separator}did={did}");
    if let Some(cli) = cli {
        location.push_str(&format!("&cli={cli}"));
    }
    HttpResponse::Found()
        .insert_header((
            LOCATION,
            HeaderValue::from_str(&location).unwrap_or_else(|_| HeaderValue::from_static("/")),
        ))
        .finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::jwt::verify_token;
    use actix_web::{test, App};

    macro_rules! app {
        ($state:expr) => {
            test::init_service(
                App::new()
                    .app_data($state.clone())
                    .app_data(web::Data::new($state.clone()))
                    .configure(configure),
            )
            .await
        };
    }

    #[tokio::test]
    async fn a_minted_token_verifies_and_carries_the_did() {
        let state = AppState::for_test().await.unwrap();
        let token = mint_token(&state.config().jwt_secret, "did:plc:alice").unwrap();

        let claims = verify_token(state.db(), &state.config().jwt_secret, &token)
            .await
            .unwrap();
        assert_eq!(claims.did.as_deref(), Some("did:plc:alice"));
        assert!(claims.exp.unwrap() > chrono::Utc::now().timestamp());
        // A session token is not an access token, so it has no jti to revoke.
        assert!(claims.jti.is_none());
        assert!(!claims.is_access_token());
    }

    #[actix_web::test]
    async fn password_login_requires_a_password() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/login")
                .set_json(serde_json::json!({ "handle": "alice.test" }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 400);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert!(
            body["message"].as_str().unwrap().contains("OAuth"),
            "the message should point at the alternative: {body}"
        );
    }

    /// `AppState::for_test` builds no OAuth service, so the OAuth routes must
    /// degrade to a message that names the working alternative.
    #[actix_web::test]
    async fn the_oauth_routes_say_what_to_do_when_oauth_is_not_configured() {
        let state = AppState::for_test().await.unwrap();
        assert!(state.oauth().is_none());
        let app = app!(state);

        for uri in [
            "/login?handle=alice.test",
            "/oauth-client-metadata.json",
            "/client-metadata.json",
            "/jwks.json",
        ] {
            let res =
                test::call_service(&app, test::TestRequest::get().uri(uri).to_request()).await;
            assert_eq!(res.status(), 501, "{uri}");
            let body: serde_json::Value = test::read_body_json(res).await;
            assert_eq!(body["error"], "OauthUnavailable", "{uri}");
            assert!(
                body["message"].as_str().unwrap().contains("app password"),
                "{uri}: {body}"
            );
        }
    }

    #[actix_web::test]
    async fn oauth_login_without_a_handle_is_rejected() {
        let state = oauth_state().await;
        let app = app!(state);

        let res =
            test::call_service(&app, test::TestRequest::get().uri("/login").to_request()).await;
        assert_eq!(res.status(), 400);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert!(
            body["message"].as_str().unwrap().contains("handle"),
            "{body}"
        );
    }

    /// A state with a real OAuth service, in confidential mode.
    async fn oauth_state() -> AppState {
        let dir = tempfile::tempdir().unwrap();
        let mut config = crate::Config::for_test();
        config.domain = Some("rocksky.example.com".into());
        config.public_url = "https://rocksky.example.com".into();
        config.data_dir = dir.path().to_path_buf();
        // The tempdir must outlive the state, so it is leaked here rather than
        // dropped at the end of this function.
        std::mem::forget(dir);
        AppState::for_test_with_oauth(config).await.unwrap()
    }

    #[actix_web::test]
    async fn the_client_metadata_document_is_served_at_the_client_id_url() {
        let state = oauth_state().await;
        let app = app!(state);

        // In confidential mode this URL *is* the client_id, so the
        // authorization server fetches exactly this path.
        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/oauth-client-metadata.json")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(
            body["client_id"],
            "https://rocksky.example.com/oauth-client-metadata.json"
        );
        assert_eq!(body["token_endpoint_auth_method"], "private_key_jwt");
        assert_eq!(body["jwks_uri"], "https://rocksky.example.com/jwks.json");
        assert_eq!(
            body["redirect_uris"][0],
            "https://rocksky.example.com/oauth/callback"
        );
        assert_eq!(body["dpop_bound_access_tokens"], true);
    }

    #[actix_web::test]
    async fn the_jwks_document_publishes_only_public_keys() {
        let state = oauth_state().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get().uri("/jwks.json").to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["keys"][0]["kty"], "EC");
        assert_eq!(body["keys"][0]["crv"], "P-256");
        // Publishing the private scalar would hand out the client's identity.
        assert!(
            !body.to_string().contains("\"d\""),
            "the private half must never be published: {body}"
        );
    }

    #[actix_web::test]
    async fn a_refused_authorization_redirects_rather_than_showing_json() {
        let state = oauth_state().await;
        let app = app!(state);

        // The user is in a browser here, so a JSON error body would just be
        // rendered as text.
        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/oauth/callback?error=access_denied&error_description=nope")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 302);
        let location = res.headers().get("location").unwrap().to_str().unwrap();
        assert!(location.contains("error=1"), "{location}");
    }

    #[actix_web::test]
    async fn a_callback_with_no_code_redirects_with_an_error() {
        let state = oauth_state().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get().uri("/oauth/callback").to_request(),
        )
        .await;
        assert_eq!(res.status(), 302);
        assert!(res
            .headers()
            .get("location")
            .unwrap()
            .to_str()
            .unwrap()
            .contains("error=1"));
    }

    #[actix_web::test]
    async fn the_token_handoff_is_single_use() {
        let state = AppState::for_test().await.unwrap();
        stash_token(&state, "did:plc:alice", "the-token").await;
        let app = app!(state);

        let request = || {
            test::TestRequest::get()
                .uri("/token")
                .insert_header(("session-did", "did:plc:alice"))
                .to_request()
        };

        let res = test::call_service(&app, request()).await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["token"], "the-token");

        // Claiming it twice must fail: the DID alone is the only credential
        // here, so the window has to close as soon as it is used.
        let res = test::call_service(&app, request()).await;
        assert_eq!(res.status(), 401);
    }

    #[actix_web::test]
    async fn the_token_endpoint_needs_the_session_did_header() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        for header in [None, Some("null"), Some("")] {
            let mut request = test::TestRequest::get().uri("/token");
            if let Some(header) = header {
                request = request.insert_header(("session-did", header));
            }
            let res = test::call_service(&app, request.to_request()).await;
            assert_eq!(res.status(), 400, "{header:?}");
        }
    }

    #[actix_web::test]
    async fn an_unknown_did_has_no_pending_sign_in() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/token")
                .insert_header(("session-did", "did:plc:stranger"))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
    }

    #[actix_web::test]
    async fn profile_requires_authentication() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res =
            test::call_service(&app, test::TestRequest::get().uri("/profile").to_request()).await;
        assert_eq!(res.status(), 401);
    }

    #[actix_web::test]
    async fn logout_requires_authentication() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res =
            test::call_service(&app, test::TestRequest::post().uri("/logout").to_request()).await;
        assert_eq!(res.status(), 401);
    }

    #[actix_web::test]
    async fn logout_forgets_the_pds_session() {
        let state = AppState::for_test().await.unwrap();
        session::store(
            state.auth_db(),
            &session::AtpSession {
                did: "did:plc:alice".into(),
                handle: "alice.test".into(),
                access_jwt: "a".into(),
                refresh_jwt: "r".into(),
                email: None,
                active: true,
                extra: Default::default(),
            },
        )
        .await
        .unwrap();

        let token = mint_token(&state.config().jwt_secret, "did:plc:alice").unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/logout")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
        assert!(session::load(state.auth_db(), "did:plc:alice")
            .await
            .unwrap()
            .is_none());
    }

    // `use actix_web::test` brings actix's `test` attribute macro into scope,
    // so a bare `#[test]` here resolves to it and demands an async fn.
    #[actix_web::test]
    async fn the_frontend_redirect_carries_the_did() {
        let response = frontend_redirect("http://localhost:5174", "did:plc:alice", None);
        let location = response.headers().get(LOCATION).unwrap().to_str().unwrap();
        assert_eq!(location, "http://localhost:5174?did=did:plc:alice");

        // An existing query string must not be broken by a second `?`.
        let response = frontend_redirect("http://localhost:5174/?x=1", "did:plc:alice", Some("1"));
        let location = response.headers().get(LOCATION).unwrap().to_str().unwrap();
        assert_eq!(
            location,
            "http://localhost:5174/?x=1&did=did:plc:alice&cli=1"
        );
    }

    #[tokio::test]
    async fn signing_in_indexes_the_account() {
        let state = AppState::for_test().await.unwrap();
        // The appview URL points nowhere in tests, so the profile lookup fails
        // — the row must still be created, with the handle we were given.
        sync_user(&state, "did:plc:alice", Some("alice.test")).await;

        let db = state.db();
        let handle: Option<String> = db
            .fetch_scalar(&db.sql("SELECT handle FROM users"))
            .await
            .unwrap();
        assert_eq!(handle.as_deref(), Some("alice.test"));
    }
}
