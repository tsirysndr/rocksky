use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;
use serde_json::json;

use crate::{
    auth::{self, AuthedUser},
    convert::now_iso,
    dto::{
        AuthenticationResult, ItemsResult, SessionInfoDto, UserConfiguration, UserDto, UserPolicy,
    },
    guid,
    state::AppState,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct AuthenticateBody {
    pub username: Option<String>,
    pub pw: Option<String>,
    pub password: Option<String>,
}

pub fn user_dto(state: &AppState, user: &AuthedUser) -> UserDto {
    UserDto {
        name: Some(user.handle.clone()),
        server_id: Some(state.server_id.clone()),
        server_name: Some(state.server_name.clone()),
        id: guid::user_guid(&user.handle),
        primary_image_tag: user.avatar.as_ref().map(|_| user.handle.clone()),
        primary_image_aspect_ratio: user.avatar.as_ref().map(|_| 1.0),
        has_password: Some(true),
        has_configured_password: Some(true),
        has_configured_easy_password: Some(false),
        enable_auto_login: Some(false),
        last_login_date: Some(now_iso()),
        last_activity_date: Some(now_iso()),
        configuration: Some(UserConfiguration::default()),
        policy: Some(UserPolicy::rocksky()),
    }
}

/// `POST /Users/AuthenticateByName` — username is the Rocksky handle, password
/// is one of the account's enabled API keys. Exactly the credentials the
/// Subsonic service takes, so a user needs nothing new to add this server.
pub async fn authenticate_by_name(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<AuthenticateBody>,
) -> HttpResponse {
    let body = body.into_inner();
    let username = body.username.unwrap_or_default();
    let password = body.pw.or(body.password).unwrap_or_default();

    if username.is_empty() || password.is_empty() {
        return HttpResponse::Unauthorized().json(json!({
            "Message": "Invalid username or password"
        }));
    }

    let user = match auth::verify_credentials(&state.pool, &username, &password).await {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!(handle = %username, "jellyfin: auth failed: {}", e);
            return HttpResponse::Unauthorized().json(json!({
                "Message": "Invalid username or password"
            }));
        }
    };

    let parsed = auth::parse_auth(&req);
    let token = auth::random_hex(16);
    if let Err(e) = auth::store_token(&state.pool, &token, &user.id, &parsed).await {
        tracing::error!(handle = %username, "jellyfin: could not store token: {}", e);
        return HttpResponse::InternalServerError().finish();
    }

    tracing::info!(handle = %username, client = ?parsed.client, "jellyfin: authenticated");

    let dto = user_dto(&state, &user);
    let now = now_iso();
    let session = SessionInfoDto {
        play_state: None,
        additional_users: Some(vec![]),
        capabilities: None,
        remote_end_point: Some(
            req.connection_info()
                .realip_remote_addr()
                .unwrap_or("")
                .to_string(),
        ),
        playable_media_types: vec!["Audio".into()],
        id: Some(auth::random_hex(16)),
        user_id: dto.id.clone(),
        user_name: dto.name.clone(),
        client: parsed.client.clone(),
        last_activity_date: now.clone(),
        last_playback_check_in: now,
        last_paused_date: None,
        device_name: parsed.device.clone(),
        device_type: None,
        now_playing_item: None,
        now_viewing_item: None,
        device_id: parsed.device_id.clone(),
        application_version: parsed.version.clone(),
        transcoding_info: None,
        is_active: true,
        supports_media_control: false,
        supports_remote_control: false,
        now_playing_queue: Some(vec![]),
        has_custom_device_name: false,
        playlist_item_id: None,
        server_id: Some(state.server_id.clone()),
        user_primary_image_tag: None,
        supported_commands: vec![],
    };

    HttpResponse::Ok().json(AuthenticationResult {
        user: Some(dto),
        session_info: Some(session),
        access_token: Some(token),
        server_id: Some(state.server_id.clone()),
    })
}

/// `GET /Users/Public` — the login-screen user picker.
///
/// Always empty. This server fronts every Rocksky account, so there is no
/// public list to publish; clients that get an empty array fall back to the
/// manual handle + API key form, which is what we want them to use.
pub async fn users_public() -> HttpResponse {
    HttpResponse::Ok().json(Vec::<UserDto>::new())
}

pub async fn users_list(user: AuthedUser, state: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok().json(vec![user_dto(&state, &user)])
}

pub async fn users_me(user: AuthedUser, state: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok().json(user_dto(&state, &user))
}

/// `GET /Users/{id}` — the id in the path is ignored on purpose: a token only
/// ever names one account, and answering for anybody else would hand a client
/// somebody else's profile.
pub async fn user_by_id(
    user: AuthedUser,
    state: web::Data<AppState>,
    _path: web::Path<String>,
) -> HttpResponse {
    HttpResponse::Ok().json(user_dto(&state, &user))
}

// ── Views ───────────────────────────────────────────────────────────────────

pub async fn user_views(
    _user: AuthedUser,
    state: web::Data<AppState>,
    _path: web::Path<String>,
) -> HttpResponse {
    views(&state)
}

pub async fn user_views_query(_user: AuthedUser, state: web::Data<AppState>) -> HttpResponse {
    views(&state)
}

pub async fn media_folders(_user: AuthedUser, state: web::Data<AppState>) -> HttpResponse {
    views(&state)
}

fn views(state: &AppState) -> HttpResponse {
    let items = crate::convert::all_libraries(state);
    HttpResponse::Ok().json(ItemsResult::whole(items))
}

pub async fn library_virtual_folders(
    _user: AuthedUser,
    _state: web::Data<AppState>,
) -> HttpResponse {
    HttpResponse::Ok().json(json!([
        {
            "Name": "Music",
            "Locations": [],
            "CollectionType": "music",
            "ItemId": guid::library_guid(),
        },
        {
            "Name": "Playlists",
            "Locations": [],
            "CollectionType": "playlists",
            "ItemId": guid::playlists_library_guid(),
        },
    ]))
}
