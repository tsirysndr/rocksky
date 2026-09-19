//! The legacy `/users/*` REST surface the web UI still calls.
//!
//! Most of `apps/api`'s `/users` router duplicates what the `app.rocksky.*`
//! methods answer, and the web UI calls the XRPC spellings — but not for
//! everything. Playlist pages, the shout threads and like-by-row-id go through
//! these paths (`usePlaylists.tsx`, `useShout.tsx`, `api/likes.ts`), and with
//! nothing registered here they fell through to the SPA fallback: the page
//! asked for JSON and was answered `index.html`, which is how "Cannot read
//! properties of undefined (reading 'displayName')" reached production —
//! `playlist.curatedBy` on a response that was never a playlist.
//!
//! Only what the web UI calls is ported, which is the same line the rest of
//! this module draws. The `/users/{did}/albums`-style listing routes stay
//! absent: nothing calls them.
//!
//! # Shapes are the wire shapes, not the XRPC ones
//!
//! The shout responses reproduce `apps/api`'s drizzle join rows —
//! `[{ "shouts": {…}, "users": {…} }]`, `content` not `message`, `likes`,
//! `liked` and `gifUrl` inline — because `Shout.tsx` destructures exactly
//! that. The XRPC `shoutView` is a different, deliberate shape; converting it
//! here would mean maintaining a third.
//!
//! # Writes delegate
//!
//! POST/DELETE all hand off to [`crate::xrpc::app_rocksky::shout`] and
//! [`crate::xrpc::app_rocksky::like`] — the record write, the row, the event
//! and the authorization checks live there once. These handlers only
//! translate the path (`/users/{did}/app.rocksky.song/{rkey}/shouts`) into
//! the subject URI the procedure takes.

use crate::auth::{Auth, AuthDid};
use crate::db::models::{Track, User, TRACK_COLS, USER_COLS};
use crate::db::schema::{
    PlaylistTracks, Playlists, ProfileShouts, ShoutLikes, ShoutReports, Shouts, Tracks, Users,
};
use crate::db::Backend;
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{
    Alias, Asterisk, CaseStatement, Expr, Func, IntoTableRef, JoinType, Order, Query,
    SelectStatement, SimpleExpr,
};
use crate::state::AppState;
use crate::xrpc::app_rocksky::like::{like_track, unlike_track};
use crate::xrpc::app_rocksky::shout::{
    create_shout, remove_shout, reply_shout, report_shout, resolve_shout_id, CreateShoutInput, Gif,
    RemoveShoutParams, ReplyShoutInput, ReportShoutInput,
};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;

pub fn configure(cfg: &mut ServiceConfig) {
    // Before the `{did}` routes: actix tries routes in registration order,
    // and `/users/tracks/…` must not be read as did = "tracks".
    cfg.route("/users/tracks/{track_id}/likes", web::post().to(like_by_id));
    cfg.route(
        "/users/tracks/{track_id}/likes",
        web::delete().to(unlike_by_id),
    );

    cfg.route("/users/{did}/playlists", web::get().to(playlists));
    cfg.route(
        "/users/{did}/app.rocksky.playlist/{rkey}",
        web::get().to(playlist_detail),
    );

    cfg.route("/users/{did}/shouts", web::get().to(profile_shouts));
    cfg.route("/users/{did}/shouts", web::post().to(post_profile_shout));

    // One route per collection rather than a `{collection}` segment, so an
    // unknown collection is a 404 here and not a half-resolved subject.
    for collection in [
        "app.rocksky.artist",
        "app.rocksky.album",
        "app.rocksky.song",
        "app.rocksky.scrobble",
    ] {
        cfg.route(
            &format!("/users/{{did}}/{collection}/{{rkey}}/shouts"),
            web::get().to(subject_shouts),
        );
        cfg.route(
            &format!("/users/{{did}}/{collection}/{{rkey}}/shouts"),
            web::post().to(post_subject_shout),
        );
    }

    cfg.route(
        "/users/{did}/app.rocksky.shout/{rkey}/replies",
        web::get().to(shout_replies),
    );
    cfg.route(
        "/users/{did}/app.rocksky.shout/{rkey}/replies",
        web::post().to(post_reply),
    );
    cfg.route(
        "/users/{did}/app.rocksky.shout/{rkey}/report",
        web::post().to(report),
    );
    cfg.route(
        "/users/{did}/app.rocksky.shout/{rkey}/report",
        web::delete().to(cancel_report),
    );
    cfg.route(
        "/users/{did}/app.rocksky.shout/{rkey}",
        web::delete().to(delete_shout),
    );
}

/// Rebuilds the AT-URI the path spells out.
///
/// The UI produces these paths as `uri.replace("at://", "")`, so joining the
/// segments back together is exact, not a guess.
fn at_uri(did: &str, collection: &str, rkey: &str) -> String {
    format!("at://{did}/{collection}/{rkey}")
}

/// A `SELECT` usable as a scalar expression — sea-query names the wrapper but
/// gives it no direct constructor.
fn scalar(select: SelectStatement) -> SimpleExpr {
    SimpleExpr::SubQuery(None, Box::new(select.into_sub_query_statement()))
}

// ---------------------------------------------------------------- playlists

#[derive(Debug, Deserialize)]
struct PageQuery {
    #[serde(default)]
    size: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
}

/// One playlist row plus its curator, in `apps/api`'s field names.
#[derive(Debug, sqlx::FromRow)]
struct PlaylistRestRow {
    id: String,
    name: String,
    picture: Option<String>,
    description: Option<String>,
    uri: Option<String>,
    cid: Option<String>,
    spotify_link: Option<String>,
    tidal_link: Option<String>,
    apple_music_link: Option<String>,
    created_by: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    track_count: i64,
    curator_id: Option<String>,
    curator_did: Option<String>,
    curator_handle: Option<String>,
    curator_name: Option<String>,
    curator_avatar: Option<String>,
}

impl PlaylistRestRow {
    /// The playlist part of the response — `...x.playlists` upstream.
    fn playlist_json(&self) -> serde_json::Value {
        json!({
            "id": self.id,
            "name": self.name,
            "picture": self.picture,
            "description": self.description,
            "uri": self.uri,
            "cid": self.cid,
            // Reserved and never written — see `schema/playlists.ts`.
            "collaborators": serde_json::Value::Null,
            "spotifyLink": self.spotify_link,
            "tidalLink": self.tidal_link,
            "appleMusicLink": self.apple_music_link,
            "createdBy": self.created_by,
            "createdAt": crate::views::timestamp::to_iso8601(&self.created_at),
            "updatedAt": crate::views::timestamp::to_iso8601(&self.updated_at),
            "trackCount": self.track_count,
        })
    }

    /// `curatedBy` — the joined user row, which is what the page renders the
    /// "Curated By" block from. `null` only if the owner row is gone.
    fn curator_json(&self) -> serde_json::Value {
        match &self.curator_id {
            Some(id) => json!({
                "id": id,
                "did": self.curator_did,
                "handle": self.curator_handle,
                "displayName": self.curator_name,
                "avatar": self.curator_avatar,
            }),
            None => serde_json::Value::Null,
        }
    }
}

/// The shared projection of `playlists` joined to its owner.
fn playlist_rest_query(db: &Backend) -> crate::sea_query::SelectStatement {
    let p = |column| Expr::col((Alias::new("p"), column));
    let u = |column| Expr::col((Alias::new("u"), column));

    let mut query = Query::select();
    query
        .expr_as(p(Playlists::XataId), Alias::new("id"))
        .expr_as(p(Playlists::Name), Alias::new("name"))
        .expr(p(Playlists::Picture))
        .expr(p(Playlists::Description))
        .expr(p(Playlists::Uri))
        .expr(p(Playlists::Cid))
        .expr(p(Playlists::SpotifyLink))
        .expr(p(Playlists::TidalLink))
        .expr(p(Playlists::AppleMusicLink))
        .expr(p(Playlists::CreatedBy))
        .expr_as(
            db.cast_timestamp(p(Playlists::XataCreatedat)),
            Alias::new("created_at"),
        )
        .expr_as(
            db.cast_timestamp(p(Playlists::XataUpdatedat)),
            Alias::new("updated_at"),
        )
        .expr_as(
            // A correlated count, matching the drizzle subselect — cheaper
            // than a join-and-group over every column.
            db.cast_int(scalar(
                Query::select()
                    .expr(Func::count(Expr::col(Asterisk)))
                    .from_as(PlaylistTracks::Table, Alias::new("pt"))
                    .and_where(
                        Expr::col((Alias::new("pt"), PlaylistTracks::PlaylistId))
                            .equals((Alias::new("p"), Playlists::XataId)),
                    )
                    .take(),
            )),
            Alias::new("track_count"),
        )
        .expr_as(u(Users::XataId), Alias::new("curator_id"))
        .expr_as(u(Users::Did), Alias::new("curator_did"))
        .expr_as(u(Users::Handle), Alias::new("curator_handle"))
        .expr_as(u(Users::DisplayName), Alias::new("curator_name"))
        .expr_as(u(Users::Avatar), Alias::new("curator_avatar"))
        .from_as(Playlists::Table, Alias::new("p"))
        .join_as(
            JoinType::LeftJoin,
            Users::Table,
            Alias::new("u"),
            Expr::col((Alias::new("u"), Users::XataId))
                .equals((Alias::new("p"), Playlists::CreatedBy)),
        );
    query
}

/// `GET /users/{did}/playlists`
async fn playlists(
    state: web::Data<AppState>,
    path: web::Path<String>,
    page: web::Query<PageQuery>,
) -> XrpcResult<HttpResponse> {
    let did = path.into_inner();
    let db = state.db();

    let mut query = playlist_rest_query(db);
    query
        .and_where(
            Expr::col((Alias::new("u"), Users::Did))
                .eq(&did)
                .or(Expr::col((Alias::new("u"), Users::Handle)).eq(&did)),
        )
        .order_by((Alias::new("p"), Playlists::XataCreatedat), Order::Desc)
        .limit(page.size.unwrap_or(10).clamp(1, 100) as u64)
        .offset(page.offset.unwrap_or(0).max(0) as u64);

    let rows: Vec<PlaylistRestRow> = db.fetch_all(&query).await?;
    Ok(HttpResponse::Ok().json(
        rows.iter()
            .map(PlaylistRestRow::playlist_json)
            .collect::<Vec<_>>(),
    ))
}

/// `GET /users/{did}/app.rocksky.playlist/{rkey}`
///
/// Public; a bearer token only decides whether the tracks carry `liked`, and
/// a bad token must not fail the read — same posture as `apps/api`.
async fn playlist_detail(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let (did, rkey) = path.into_inner();
    let uri = at_uri(&did, "app.rocksky.playlist", &rkey);
    let db = state.db();

    let mut query = playlist_rest_query(db);
    query
        .and_where(Expr::col((Alias::new("p"), Playlists::Uri)).eq(&uri))
        .limit(1);

    let Some(row) = db.fetch_optional::<PlaylistRestRow>(&query).await? else {
        return Err(XrpcError::invalid_request("Playlist not found").named("PlaylistNotFound"));
    };

    let tracks = crate::xrpc::app_rocksky::playlist::entries(db, &row.id).await?;
    let track_ids: Vec<String> = tracks.iter().map(|track| track.id.clone()).collect();
    let likes = crate::likes::for_track_ids(db, &track_ids, auth.did()).await?;

    let tracks: Vec<serde_json::Value> = tracks
        .into_iter()
        .map(|track| {
            let like = likes.get(&track.id).copied().unwrap_or_default();
            let mut value = serde_json::to_value(&track).unwrap_or_default();
            if let Some(object) = value.as_object_mut() {
                object.insert("liked".into(), json!(like.liked));
            }
            value
        })
        .collect();

    let mut body = row.playlist_json();
    if let Some(object) = body.as_object_mut() {
        object.insert("curatedBy".into(), row.curator_json());
        object.insert("tracks".into(), json!(tracks));
    }
    Ok(HttpResponse::Ok().json(body))
}

// ------------------------------------------------------------------- shouts

/// One row of the wire shape.
#[derive(Debug, sqlx::FromRow)]
struct ShoutRestRow {
    id: String,
    content: String,
    uri: Option<String>,
    parent: Option<String>,
    created_at: DateTime<Utc>,
    facets: Option<String>,
    gif_url: Option<String>,
    gif_preview_url: Option<String>,
    gif_alt: Option<String>,
    gif_width: Option<i64>,
    gif_height: Option<i64>,
    likes: i64,
    liked: i64,
    reported: i64,
    author_id: Option<String>,
    author_did: Option<String>,
    author_handle: Option<String>,
    author_name: Option<String>,
    author_avatar: Option<String>,
}

impl ShoutRestRow {
    /// `{ shouts, users }`, as the drizzle join names them and `Shout.tsx`
    /// destructures them.
    fn to_json(&self) -> serde_json::Value {
        json!({
            "shouts": {
                "id": self.id,
                "content": self.content,
                "uri": self.uri,
                "parent": self.parent,
                "createdAt": crate::views::timestamp::to_iso8601(&self.created_at),
                "likes": self.likes,
                "liked": self.liked != 0,
                "reported": self.reported != 0,
                "gifUrl": self.gif_url,
                "gifPreviewUrl": self.gif_preview_url,
                "gifAlt": self.gif_alt,
                "gifWidth": self.gif_width,
                "gifHeight": self.gif_height,
                // Stored as JSON text; the wire carries it parsed.
                "facets": self.facets.as_deref()
                    .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok()),
            },
            "users": {
                "id": self.author_id,
                "did": self.author_did,
                "handle": self.author_handle,
                "displayName": self.author_name,
                "avatar": self.author_avatar,
            },
        })
    }
}

/// What a shout page is anchored to.
enum ShoutScope {
    /// Every shout whose subject column holds this row id — replies included,
    /// because the UI nests them client-side from the same array.
    Subject { column: Shouts, id: String },
    /// Replies to one shout.
    Replies { parent_id: String },
    /// Shouts on a profile, reached through `profile_shouts`.
    Profile { did_or_handle: String },
}

/// The shout page, in `apps/api`'s shape.
///
/// `likes` is a correlated count and `liked`/`reported` are `EXISTS` folded
/// through a CASE to an integer — a boolean decodes differently on the two
/// backends, an integer does not.
async fn load_shout_rows(
    db: &Backend,
    scope: ShoutScope,
    viewer_id: Option<&str>,
) -> Result<Vec<ShoutRestRow>, sqlx::Error> {
    let s = |column| Expr::col((Alias::new("s"), column));
    let u = |column| Expr::col((Alias::new("u"), column));

    let count_likes = Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from_as(ShoutLikes::Table, Alias::new("sl"))
        .and_where(
            Expr::col((Alias::new("sl"), ShoutLikes::ShoutId))
                .equals((Alias::new("s"), Shouts::XataId)),
        )
        .take();

    // `0` when nobody is looking: an anonymous page has no hearts to fill
    // in. An integer rather than the natural boolean because EXISTS decodes
    // differently on the two backends; folded through CASE it does not.
    fn viewer_flag(
        table: impl IntoTableRef,
        shout_col: Expr,
        user_col: Expr,
        viewer: Option<&str>,
    ) -> SimpleExpr {
        match viewer {
            Some(viewer) => CaseStatement::new()
                .case(
                    Expr::exists(
                        Query::select()
                            .expr(Expr::val(1))
                            .from(table)
                            .and_where(shout_col.equals((Alias::new("s"), Shouts::XataId)))
                            .and_where(user_col.eq(viewer))
                            .take(),
                    ),
                    1,
                )
                .finally(0)
                .into(),
            None => Expr::val(0).into(),
        }
    }

    let mut query = Query::select();
    query
        .expr_as(s(Shouts::XataId), Alias::new("id"))
        .expr_as(s(Shouts::Content), Alias::new("content"))
        .expr(s(Shouts::Uri))
        .expr_as(s(Shouts::ParentId), Alias::new("parent"))
        .expr_as(
            db.cast_timestamp(s(Shouts::XataCreatedat)),
            Alias::new("created_at"),
        )
        .expr(s(Shouts::Facets))
        .expr(s(Shouts::GifUrl))
        .expr(s(Shouts::GifPreviewUrl))
        .expr(s(Shouts::GifAlt))
        .expr_as(db.cast_int(s(Shouts::GifWidth)), Alias::new("gif_width"))
        .expr_as(db.cast_int(s(Shouts::GifHeight)), Alias::new("gif_height"))
        .expr_as(db.cast_int(scalar(count_likes)), Alias::new("likes"))
        .expr_as(
            db.cast_int(viewer_flag(
                ShoutLikes::Table,
                Expr::col(ShoutLikes::ShoutId),
                Expr::col(ShoutLikes::UserId),
                viewer_id,
            )),
            Alias::new("liked"),
        )
        .expr_as(
            db.cast_int(viewer_flag(
                ShoutReports::Table,
                Expr::col(ShoutReports::ShoutId),
                Expr::col(ShoutReports::UserId),
                viewer_id,
            )),
            Alias::new("reported"),
        )
        .expr_as(u(Users::XataId), Alias::new("author_id"))
        .expr_as(u(Users::Did), Alias::new("author_did"))
        .expr_as(u(Users::Handle), Alias::new("author_handle"))
        .expr_as(u(Users::DisplayName), Alias::new("author_name"))
        .expr_as(u(Users::Avatar), Alias::new("author_avatar"))
        .from_as(Shouts::Table, Alias::new("s"))
        .join_as(
            JoinType::LeftJoin,
            Users::Table,
            Alias::new("u"),
            Expr::col((Alias::new("u"), Users::XataId)).equals((Alias::new("s"), Shouts::AuthorId)),
        );

    match scope {
        ShoutScope::Subject { column, id } => {
            query.and_where(s(column).eq(id));
        }
        ShoutScope::Replies { parent_id } => {
            query.and_where(s(Shouts::ParentId).eq(parent_id));
        }
        ShoutScope::Profile { did_or_handle } => {
            let linked = Query::select()
                .column((Alias::new("ps"), ProfileShouts::ShoutId))
                .from_as(ProfileShouts::Table, Alias::new("ps"))
                .join_as(
                    JoinType::InnerJoin,
                    Users::Table,
                    Alias::new("pu"),
                    Expr::col((Alias::new("pu"), Users::XataId))
                        .equals((Alias::new("ps"), ProfileShouts::UserId)),
                )
                .and_where(
                    Expr::col((Alias::new("pu"), Users::Did))
                        .eq(&did_or_handle)
                        .or(Expr::col((Alias::new("pu"), Users::Handle)).eq(&did_or_handle)),
                )
                .take();
            query.and_where(s(Shouts::XataId).in_subquery(linked));
        }
    }

    query.order_by((Alias::new("s"), Shouts::XataCreatedat), Order::Desc);
    db.fetch_all(&query).await
}

/// The caller's user row id, when there is a caller — a bad or absent token
/// reads as anonymous, never as an error, because these pages are public.
async fn viewer_id(db: &Backend, auth: &Auth) -> Result<Option<String>, sqlx::Error> {
    let Some(did) = auth.did() else {
        return Ok(None);
    };
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .take();
    db.fetch_scalar(&query).await
}

async fn respond_shouts(db: &Backend, scope: ShoutScope, auth: &Auth) -> XrpcResult<HttpResponse> {
    let viewer = viewer_id(db, auth).await?;
    let rows = load_shout_rows(db, scope, viewer.as_deref()).await?;
    Ok(HttpResponse::Ok().json(rows.iter().map(ShoutRestRow::to_json).collect::<Vec<_>>()))
}

/// Resolves a subject URI to its shout column and row id, or `None` when the
/// subject is unknown here — which answers an empty list, not an error.
async fn subject_scope(db: &Backend, uri: &str) -> Result<Option<(Shouts, String)>, sqlx::Error> {
    let (table, column) = if uri.contains("app.rocksky.song") {
        ("tracks", Shouts::TrackId)
    } else if uri.contains("app.rocksky.album") {
        ("albums", Shouts::AlbumId)
    } else if uri.contains("app.rocksky.artist") {
        ("artists", Shouts::ArtistId)
    } else {
        ("scrobbles", Shouts::ScrobbleId)
    };

    let lookup = Query::select()
        .column(Alias::new("xata_id"))
        .from(Alias::new(table))
        .and_where(Expr::col(Alias::new("uri")).eq(uri))
        .limit(1)
        .take();
    Ok(db
        .fetch_scalar::<String>(&lookup)
        .await?
        .map(|id| (column, id)))
}

/// `GET /users/{did}/app.rocksky.{artist,album,song,scrobble}/{rkey}/shouts`
async fn subject_shouts(
    state: web::Data<AppState>,
    request: actix_web::HttpRequest,
    path: web::Path<(String, String)>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let (did, rkey) = path.into_inner();
    let collection = collection_of(&request);
    let uri = at_uri(&did, collection, &rkey);
    let db = state.db();

    match subject_scope(db, &uri).await? {
        Some((column, id)) => respond_shouts(db, ShoutScope::Subject { column, id }, &auth).await,
        None => Ok(HttpResponse::Ok().json(serde_json::Value::Array(Vec::new()))),
    }
}

/// The collection segment of the matched path.
///
/// Read back out of the URL rather than passed as a third parameter, because
/// four routes share one handler and actix's path tuple only carries the
/// bracketed segments.
fn collection_of(request: &actix_web::HttpRequest) -> &str {
    request
        .path()
        .split('/')
        .rev()
        .nth(2)
        .unwrap_or("app.rocksky.song")
}

/// `GET /users/{did}/shouts`
async fn profile_shouts(
    state: web::Data<AppState>,
    path: web::Path<String>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let did_or_handle = path.into_inner();
    respond_shouts(state.db(), ShoutScope::Profile { did_or_handle }, &auth).await
}

/// `GET /users/{did}/app.rocksky.shout/{rkey}/replies`
async fn shout_replies(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let (did, rkey) = path.into_inner();
    let db = state.db();
    let parent_id = resolve_shout_id(db, &at_uri(&did, "app.rocksky.shout", &rkey)).await?;
    respond_shouts(db, ShoutScope::Replies { parent_id }, &auth).await
}

// ------------------------------------------------------------ shout writes

/// `{ message, gif, facets }`, as `useShout.tsx` posts it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShoutBody {
    message: Option<String>,
    #[serde(default)]
    facets: Option<serde_json::Value>,
    #[serde(default)]
    gif: Option<Gif>,
}

impl ShoutBody {
    fn into_create(self, subject_uri: String) -> CreateShoutInput {
        CreateShoutInput {
            message: self.message,
            uri: Some(subject_uri),
            facets: self.facets,
            gif: self.gif,
        }
    }
}

/// `POST /users/{did}/app.rocksky.{…}/{rkey}/shouts`
async fn post_subject_shout(
    state: web::Data<AppState>,
    request: actix_web::HttpRequest,
    path: web::Path<(String, String)>,
    auth: AuthDid,
    body: web::Json<ShoutBody>,
) -> XrpcResult<HttpResponse> {
    let (did, rkey) = path.into_inner();
    let collection = collection_of(&request).to_string();
    let input = body
        .into_inner()
        .into_create(at_uri(&did, &collection, &rkey));
    create_shout(state, auth, web::Json(input)).await
}

/// `POST /users/{did}/shouts` — a shout on a profile; the subject is the
/// account itself.
async fn post_profile_shout(
    state: web::Data<AppState>,
    path: web::Path<String>,
    auth: AuthDid,
    body: web::Json<ShoutBody>,
) -> XrpcResult<HttpResponse> {
    let subject = path.into_inner();
    let input = body.into_inner().into_create(subject);
    create_shout(state, auth, web::Json(input)).await
}

/// `POST /users/{did}/app.rocksky.shout/{rkey}/replies`
async fn post_reply(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    auth: AuthDid,
    body: web::Json<ShoutBody>,
) -> XrpcResult<HttpResponse> {
    let (did, rkey) = path.into_inner();
    let parent_id = resolve_shout_id(state.db(), &at_uri(&did, "app.rocksky.shout", &rkey)).await?;
    let body = body.into_inner();
    let input = ReplyShoutInput {
        shout_id: Some(parent_id),
        message: body.message,
        facets: body.facets,
        gif: body.gif,
    };
    reply_shout(state, auth, web::Json(input)).await
}

/// `POST /users/{did}/app.rocksky.shout/{rkey}/report`
async fn report(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    auth: AuthDid,
) -> XrpcResult<HttpResponse> {
    let (did, rkey) = path.into_inner();
    let input = ReportShoutInput {
        shout_id: Some(at_uri(&did, "app.rocksky.shout", &rkey)),
        reason: None,
    };
    report_shout(state, auth, web::Json(input)).await
}

/// `DELETE /users/{did}/app.rocksky.shout/{rkey}/report`
///
/// No XRPC counterpart — `apps/api` only ever had the REST spelling — so the
/// row is removed here. Scoped to the caller's own report; someone else's is
/// simply not matched.
async fn cancel_report(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    auth: AuthDid,
) -> XrpcResult<HttpResponse> {
    let (did, rkey) = path.into_inner();
    let db = state.db();
    let shout_id = resolve_shout_id(db, &at_uri(&did, "app.rocksky.shout", &rkey)).await?;

    let caller = viewer_of(db, &auth.did).await?;
    let delete = Query::delete()
        .from_table(ShoutReports::Table)
        .and_where(Expr::col(ShoutReports::ShoutId).eq(&shout_id))
        .and_where(Expr::col(ShoutReports::UserId).eq(&caller.id))
        .to_owned();
    db.execute(&delete).await?;
    Ok(HttpResponse::Ok().json(json!({})))
}

/// `DELETE /users/{did}/app.rocksky.shout/{rkey}`
async fn delete_shout(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    auth: AuthDid,
) -> XrpcResult<HttpResponse> {
    let (did, rkey) = path.into_inner();
    let id = resolve_shout_id(state.db(), &at_uri(&did, "app.rocksky.shout", &rkey)).await?;
    remove_shout(state, auth, web::Query(RemoveShoutParams { id: Some(id) })).await
}

// ---------------------------------------------------------- likes by row id

/// The caller's user row, or a 401 — a write with no account is not a write.
async fn viewer_of(db: &Backend, did: &str) -> Result<User, XrpcError> {
    let mut query = Query::select();
    db.select_model(&mut query, USER_COLS, None);
    query
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1);
    db.fetch_optional::<User>(&query)
        .await?
        .ok_or_else(|| XrpcError::auth_required("No account for this token"))
}

async fn track_by_id(db: &Backend, track_id: &str) -> Result<Track, XrpcError> {
    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, None);
    query
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::XataId).eq(track_id))
        .limit(1);
    db.fetch_optional::<Track>(&query)
        .await?
        .ok_or_else(|| XrpcError::invalid_request("Track not found").named("TrackNotFound"))
}

/// `POST /users/tracks/{track_id}/likes`
///
/// Liking by row id, for rows with no `app.rocksky.song` record to address —
/// a track ingested from a scrobble has `uri = NULL` until one is published.
async fn like_by_id(
    state: web::Data<AppState>,
    path: web::Path<String>,
    auth: AuthDid,
) -> XrpcResult<HttpResponse> {
    let track = track_by_id(state.db(), &path.into_inner()).await?;
    like_track(&state, &auth.did, &track).await?;
    Ok(HttpResponse::Ok().json(json!({})))
}

/// `DELETE /users/tracks/{track_id}/likes`
async fn unlike_by_id(
    state: web::Data<AppState>,
    path: web::Path<String>,
    auth: AuthDid,
) -> XrpcResult<HttpResponse> {
    let track = track_by_id(state.db(), &path.into_inner()).await?;
    unlike_track(&state, &auth.did, &track).await?;
    Ok(HttpResponse::Ok().json(json!({})))
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test as http, App};

    macro_rules! app {
        ($state:expr) => {
            http::init_service(
                App::new()
                    .app_data(web::Data::new($state.clone()))
                    .configure(configure),
            )
            .await
        };
    }

    /// A playlist with an owner and two tracks, plus a shout thread on a song.
    async fn state() -> AppState {
        let state = AppState::for_test().await.unwrap();
        let db = state.db();
        let statements = [
            "INSERT INTO users (xata_id, did, handle, display_name, avatar) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'Alice', 'http://a/alice.png'), \
             ('rec_bob',   'did:plc:bob',   'bob.test',   'Bob',   'http://a/bob.png')",
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256, uri) VALUES \
             ('rec_t1', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1000, 'sha-t1', 'at://did:plc:alice/app.rocksky.song/1'), \
             ('rec_t2', 'Olson',   'Boards of Canada', 'Boards of Canada', 'MHTRTC', 2000, 'sha-t2', NULL)",
            "INSERT INTO playlists (xata_id, name, description, uri, created_by) VALUES \
             ('rec_p1', 'Warm Tapes', 'IDM for mornings', 'at://did:plc:alice/app.rocksky.playlist/1', 'rec_alice')",
            "INSERT INTO playlist_tracks (xata_id, playlist_id, track_id) VALUES \
             ('rec_pt1', 'rec_p1', 'rec_t1'), \
             ('rec_pt2', 'rec_p1', 'rec_t2')",
            "INSERT INTO shouts (xata_id, content, uri, author_id, track_id) VALUES \
             ('rec_sh1', 'this one', 'at://did:plc:bob/app.rocksky.shout/1', 'rec_bob', 'rec_t1')",
            "INSERT INTO shouts (xata_id, content, uri, author_id, track_id, parent_id) VALUES \
             ('rec_sh2', 'agreed', 'at://did:plc:alice/app.rocksky.shout/2', 'rec_alice', 'rec_t1', 'rec_sh1')",
            "INSERT INTO shout_likes (xata_id, user_id, shout_id, uri) VALUES \
             ('rec_sl1', 'rec_alice', 'rec_sh1', 'at://did:plc:alice/app.rocksky.like/1')",
            "INSERT INTO profile_shouts (xata_id, user_id, shout_id) VALUES \
             ('rec_ps1', 'rec_alice', 'rec_sh1')",
        ];
        for text in statements {
            db.execute(&db.sql(text)).await.expect(text);
        }
        state
    }

    /// The exact reads `Playlist.tsx` makes of the detail response — above
    /// all `curatedBy.displayName`, which crashed the page when this route
    /// fell through to the SPA fallback and answered HTML.
    #[actix_web::test]
    async fn the_playlist_detail_carries_its_curator_and_tracks() {
        let state = state().await;
        let app = app!(state);

        let request = http::TestRequest::get()
            .uri("/users/did:plc:alice/app.rocksky.playlist/1")
            .to_request();
        let body: serde_json::Value = http::call_and_read_body_json(&app, request).await;

        assert_eq!(body["name"], "Warm Tapes");
        assert_eq!(body["curatedBy"]["displayName"], "Alice");
        assert_eq!(body["curatedBy"]["handle"], "alice.test");
        assert_eq!(body["curatedBy"]["did"], "did:plc:alice");
        assert_eq!(body["trackCount"], 2);
        let tracks = body["tracks"].as_array().expect("tracks is an array");
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0]["title"], "Roygbiv");
        // No token on the request: every heart renders empty, not absent.
        assert_eq!(tracks[0]["liked"], false);
    }

    #[actix_web::test]
    async fn the_playlists_list_answers_rows_with_counts() {
        let state = state().await;
        let app = app!(state);

        for who in ["did:plc:alice", "alice.test"] {
            let request = http::TestRequest::get()
                .uri(&format!("/users/{who}/playlists"))
                .to_request();
            let body: serde_json::Value = http::call_and_read_body_json(&app, request).await;
            let rows = body.as_array().expect("an array");
            assert_eq!(rows.len(), 1, "for {who}");
            assert_eq!(rows[0]["name"], "Warm Tapes");
            assert_eq!(rows[0]["trackCount"], 2);
        }
    }

    /// The drizzle join shape, exactly: `Shout.tsx` destructures
    /// `x.shouts.content` and `x.users.displayName`, and nests replies
    /// client-side by matching `x.shouts.parent` — so the reply must be in
    /// the same array as its parent.
    #[actix_web::test]
    async fn subject_shouts_answer_the_join_shape_with_replies_inline() {
        let state = state().await;
        let app = app!(state);

        let request = http::TestRequest::get()
            .uri("/users/did:plc:alice/app.rocksky.song/1/shouts")
            .to_request();
        let body: serde_json::Value = http::call_and_read_body_json(&app, request).await;
        let rows = body.as_array().expect("an array");
        assert_eq!(rows.len(), 2, "the reply rides in the same array");

        let parent = rows
            .iter()
            .find(|row| row["shouts"]["parent"].is_null())
            .expect("the top-level shout");
        assert_eq!(parent["shouts"]["content"], "this one");
        assert_eq!(parent["shouts"]["likes"], 1);
        assert_eq!(parent["shouts"]["liked"], false, "anonymous never liked");
        assert_eq!(parent["users"]["displayName"], "Bob");

        let reply = rows
            .iter()
            .find(|row| !row["shouts"]["parent"].is_null())
            .expect("the reply");
        assert_eq!(reply["shouts"]["parent"], "rec_sh1");
        assert_eq!(reply["users"]["displayName"], "Alice");
    }

    #[actix_web::test]
    async fn profile_shouts_read_through_the_link_table() {
        let state = state().await;
        let app = app!(state);

        // By DID and by handle, as `apps/api` matches either.
        for who in ["did:plc:alice", "alice.test"] {
            let request = http::TestRequest::get()
                .uri(&format!("/users/{who}/shouts"))
                .to_request();
            let body: serde_json::Value = http::call_and_read_body_json(&app, request).await;
            let rows = body.as_array().expect("an array");
            assert_eq!(rows.len(), 1, "for {who}");
            assert_eq!(rows[0]["shouts"]["content"], "this one");
        }
    }

    #[actix_web::test]
    async fn replies_are_read_by_the_parents_uri() {
        let state = state().await;
        let app = app!(state);

        let request = http::TestRequest::get()
            .uri("/users/did:plc:bob/app.rocksky.shout/1/replies")
            .to_request();
        let body: serde_json::Value = http::call_and_read_body_json(&app, request).await;
        let rows = body.as_array().expect("an array");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["shouts"]["content"], "agreed");
    }

    /// `/users/tracks/…` must never be swallowed by the `{did}` routes — a
    /// like landing on the shouts handler would answer 200 and do nothing.
    #[actix_web::test]
    async fn the_tracks_routes_win_over_the_did_routes() {
        let state = state().await;
        let app = app!(state);

        let request = http::TestRequest::post()
            .uri("/users/tracks/rec_t1/likes")
            .to_request();
        let response = http::call_service(&app, request).await;
        // 401 — the like handler demanding auth — proves the route matched
        // the likes handler and not anything did-shaped.
        assert_eq!(response.status(), 401);
    }

    /// An unknown subject answers an empty list, not an error: the shout
    /// panel sits under a page that may render before its subject is indexed.
    #[actix_web::test]
    async fn shouts_on_an_unknown_subject_answer_empty() {
        let state = state().await;
        let app = app!(state);

        let request = http::TestRequest::get()
            .uri("/users/did:plc:alice/app.rocksky.album/nope/shouts")
            .to_request();
        let body: serde_json::Value = http::call_and_read_body_json(&app, request).await;
        assert_eq!(body, serde_json::json!([]));
    }
}
