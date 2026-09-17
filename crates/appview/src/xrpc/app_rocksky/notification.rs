//! `app.rocksky.notification.*` — the bell icon.
//!
//! Notifications are written by whatever caused them (a like, a shout, a
//! follow) and only read here, so this module has no insert. What it does have
//! is the two rules that make the UI behave:
//!
//! **The unread count is a separate query.** The bell shows a number on every
//! page, so it must not require loading the list. Both are answered here, and
//! `listNotifications` returns the count too, so opening the panel is one call
//! rather than two.
//!
//! **Marking as read is explicit.** Listing does not clear anything: the panel
//! shows unread ones highlighted, and `updateSeen` is what clears them. A list
//! that cleared as a side effect would lose the highlight the moment the panel
//! re-rendered.
//!
//! Enrichment happens here rather than at write time. A notification row
//! records its subject as a URI; the title, artist and cover the panel shows
//! are looked up when it is read. That way a renamed track shows its new name
//! instead of whatever it was called when the notification was created.

use crate::auth::AuthDid;
use crate::db::models::User;
use crate::db::schema::{Albums, Artists, Notifications, Shouts, Tracks, Users};
use crate::db::{loaders, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Alias, Asterisk, Expr, Func, Order, Query};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, json};
use crate::{xrpc_procedure, xrpc_query};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(
        cfg,
        "app.rocksky.notification.getUnreadCount",
        get_unread_count
    );
    xrpc_query!(
        cfg,
        "app.rocksky.notification.listNotifications",
        list_notifications
    );
    xrpc_procedure!(cfg, "app.rocksky.notification.updateSeen", update_seen);
}

const NOTIFICATION_DEFAULT_LIMIT: i64 = 30;

/// Whoever caused the notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationActor {
    pub id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
}

impl From<&User> for NotificationActor {
    fn from(user: &User) -> Self {
        Self {
            id: user.id.clone(),
            did: user.did.clone(),
            handle: user.handle.clone(),
            display_name: user.display_name.clone(),
            avatar: user.avatar.clone(),
        }
    }
}

/// What the notification is about, enriched for display.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectView {
    pub uri: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album_art: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationView {
    pub id: String,
    /// `like`, `shout`, `reply`, `follow` — kept as the string the writer
    /// used rather than an enum, so a type this build predates still renders
    /// instead of failing to deserialize.
    #[serde(rename = "type")]
    pub notification_type: String,
    pub actor: NotificationActor,
    pub read: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shout_id: Option<String>,
    /// The shout's text, so the panel can show it without a second call.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shout_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, with = "crate::views::uri")]
    pub subject_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<SubjectView>,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnreadCountOutput {
    pub count: i64,
}

/// `app.rocksky.notification.getUnreadCount`
async fn get_unread_count(state: web::Data<AppState>, auth: AuthDid) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    json(UnreadCountOutput {
        count: unread_count(db, &user_id).await?,
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListParams {
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub cursor: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListOutput {
    pub notifications: Vec<NotificationView>,
    /// Sent alongside the list so opening the panel is one call.
    pub unread_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// `app.rocksky.notification.listNotifications`
///
/// Newest first, paged by timestamp cursor for the same reason the follow
/// graph is: notifications arrive while the list is being read, and an offset
/// would skip one every time a new arrival shifts the rows down.
async fn list_notifications(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<ListParams>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let limit = clamp_limit_or(params.limit, NOTIFICATION_DEFAULT_LIMIT);

    match load(db, &user_id, limit, params.cursor.as_deref()).await {
        Ok((notifications, cursor)) => json(ListOutput {
            notifications,
            unread_count: unread_count(db, &user_id).await?,
            cursor,
        }),
        Err(err) => {
            tracing::error!(error = ?err, did = %auth.did, "error listing notifications");
            json(ListOutput::default())
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSeenInput {
    /// The ids to mark read. An empty list marks *everything* read, which is
    /// what the panel's "mark all read" button sends.
    #[serde(default)]
    pub ids: Option<Vec<String>>,
}

/// `app.rocksky.notification.updateSeen`
async fn update_seen(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<UpdateSeenInput>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let now = crate::views::timestamp::to_iso8601(&chrono::Utc::now());

    let mut update = Query::update();
    update
        .table(Notifications::Table)
        .value(Notifications::Read, true)
        .value(Notifications::ReadAt, now)
        // Scoped to the caller: an id belonging to someone else must not be
        // markable, and without this clause any id would be.
        .and_where(Expr::col(Notifications::UserId).eq(&user_id))
        .and_where(Expr::col(Notifications::Read).eq(false));

    if let Some(ids) = body.ids.as_ref().filter(|ids| !ids.is_empty()) {
        update.and_where(Expr::col(Notifications::XataId).is_in(ids.iter().map(|id| id.as_str())));
    }

    let marked = db.execute(&update).await?;
    tracing::debug!(did = %auth.did, marked, "marked notifications read");

    json(UnreadCountOutput {
        count: unread_count(db, &user_id).await?,
    })
}

// ------------------------------------------------------------------- shared

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

async fn unread_count(db: &Backend, user_id: &str) -> Result<i64, sqlx::Error> {
    let query = Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from(Notifications::Table)
        .and_where(Expr::col(Notifications::UserId).eq(user_id))
        .and_where(Expr::col(Notifications::Read).eq(false))
        .take();

    db.count(&query).await
}

type Loaded = (Vec<NotificationView>, Option<String>);

async fn load(
    db: &Backend,
    user_id: &str,
    limit: i64,
    cursor: Option<&str>,
) -> anyhow::Result<Loaded> {
    let mut query = Query::select();
    query
        .columns([
            Notifications::XataId,
            Notifications::Type,
            Notifications::ActorId,
            Notifications::Read,
            Notifications::ShoutId,
            Notifications::SubjectUri,
        ])
        // Cast, because the row reads it as a `DateTime<Utc>` and the Postgres
        // column is `timestamp without time zone`, which will not decode into
        // one — the same cast every `models::*_COLS` list applies.
        .expr_as(
            db.cast_timestamp(Expr::col(Notifications::XataCreatedat)),
            Alias::new("created_at"),
        )
        .from(Notifications::Table)
        .and_where(Expr::col(Notifications::UserId).eq(user_id));

    if let Some(after) = cursor.and_then(parse_cursor) {
        // As text, not a native timestamp: the column is TEXT on SQLite and is
        // compared lexicographically.
        query.and_where(
            Expr::col(Notifications::XataCreatedat)
                .lt(db.timestamp_value(crate::db::format_timestamp(after))),
        );
    }
    query
        .order_by(Notifications::XataCreatedat, Order::Desc)
        .limit(limit as u64);

    type Row = (
        String,
        String,
        String,
        bool,
        Option<String>,
        Option<String>,
        chrono::DateTime<chrono::Utc>,
    );
    let rows: Vec<Row> = db.fetch_all(&query).await?;
    if rows.is_empty() {
        return Ok((Vec::new(), None));
    }

    let cursor = (rows.len() as i64 == limit)
        .then(|| rows.last().map(|row| row.6.timestamp_millis().to_string()))
        .flatten();

    // Three batched lookups rather than one per row: the actors, the shouts'
    // text, and the subjects.
    let actors = loaders::users_by_id(db, rows.iter().map(|row| Some(row.2.clone()))).await?;
    let shout_ids: Vec<String> = rows.iter().filter_map(|row| row.4.clone()).collect();
    let shouts = shout_content(db, &shout_ids).await?;
    let subject_uris: Vec<String> = rows.iter().filter_map(|row| row.5.clone()).collect();
    let subjects = subjects_by_uri(db, &subject_uris).await?;

    let notifications = rows
        .iter()
        .filter_map(
            |(id, kind, actor_id, read, shout_id, subject_uri, created_at)| {
                // A notification whose actor has gone cannot be rendered — the
                // panel shows an avatar and a name — so it is skipped rather than
                // shown blank.
                let actor = actors.get(actor_id.as_str())?;
                Some(NotificationView {
                    id: id.clone(),
                    notification_type: kind.clone(),
                    actor: NotificationActor::from(actor),
                    read: *read,
                    shout_id: shout_id.clone(),
                    shout_content: shout_id.as_deref().and_then(|id| shouts.get(id).cloned()),
                    subject_uri: subject_uri.clone(),
                    subject: subject_uri
                        .as_deref()
                        .and_then(|uri| subjects.get(uri).cloned()),
                    created_at: *created_at,
                })
            },
        )
        .collect();

    Ok((notifications, cursor))
}

fn parse_cursor(cursor: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let millis: i64 = cursor.trim().parse().ok()?;
    chrono::DateTime::from_timestamp_millis(millis)
}

async fn shout_content(
    db: &Backend,
    ids: &[String],
) -> Result<std::collections::HashMap<String, String>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(Default::default());
    }

    let query = Query::select()
        .columns([Shouts::XataId, Shouts::Content])
        .from(Shouts::Table)
        .and_where(Expr::col(Shouts::XataId).is_in(ids.iter().map(|id| id.as_str())))
        .take();

    Ok(db
        .fetch_all::<(String, String)>(&query)
        .await?
        .into_iter()
        .collect())
}

/// Titles and covers for a set of subject URIs.
///
/// A subject is a song, an album or an artist, and which one is only knowable
/// from the URI's collection segment. Three queries rather than a union,
/// because the three tables have different columns and a union would need
/// every one aliased into a common shape.
async fn subjects_by_uri(
    db: &Backend,
    uris: &[String],
) -> Result<std::collections::HashMap<String, SubjectView>, sqlx::Error> {
    let mut found = std::collections::HashMap::new();
    if uris.is_empty() {
        return Ok(found);
    }

    let by_collection =
        |needle: &str| -> Vec<&String> { uris.iter().filter(|uri| uri.contains(needle)).collect() };

    // Songs carry all three fields.
    let songs = by_collection("app.rocksky.song");
    if !songs.is_empty() {
        let query = Query::select()
            .columns([Tracks::Uri, Tracks::Title, Tracks::Artist, Tracks::AlbumArt])
            .from(Tracks::Table)
            .and_where(Expr::col(Tracks::Uri).is_in(songs.iter().map(|uri| uri.as_str())))
            .take();
        for (uri, title, artist, album_art) in db
            .fetch_all::<(String, String, String, Option<String>)>(&query)
            .await?
        {
            found.insert(
                uri.clone(),
                SubjectView {
                    uri,
                    title: Some(title),
                    artist: Some(artist),
                    album_art,
                },
            );
        }
    }

    let albums = by_collection("app.rocksky.album");
    if !albums.is_empty() {
        let query = Query::select()
            .columns([Albums::Uri, Albums::Title, Albums::Artist, Albums::AlbumArt])
            .from(Albums::Table)
            .and_where(Expr::col(Albums::Uri).is_in(albums.iter().map(|uri| uri.as_str())))
            .take();
        for (uri, title, artist, album_art) in db
            .fetch_all::<(String, String, String, Option<String>)>(&query)
            .await?
        {
            found.insert(
                uri.clone(),
                SubjectView {
                    uri,
                    title: Some(title),
                    artist: Some(artist),
                    album_art,
                },
            );
        }
    }

    // An artist has a name and a picture, and no separate artist field.
    let artists = by_collection("app.rocksky.artist");
    if !artists.is_empty() {
        let query = Query::select()
            .columns([Artists::Uri, Artists::Name, Artists::Picture])
            .from(Artists::Table)
            .and_where(Expr::col(Artists::Uri).is_in(artists.iter().map(|uri| uri.as_str())))
            .take();
        for (uri, name, picture) in db
            .fetch_all::<(String, String, Option<String>)>(&query)
            .await?
        {
            found.insert(
                uri.clone(),
                SubjectView {
                    uri,
                    title: Some(name.clone()),
                    artist: Some(name),
                    album_art: picture,
                },
            );
        }
    }

    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Alice has two notifications and Bob one, so the caller scoping has
    /// something to exclude. The newer of Alice's points at a song.
    async fn fixture() -> (Backend, String) {
        let db = crate::db::connect_in_memory().await.unwrap();
        let alice = crate::ingest::upsert_user(&db, "did:plc:alice")
            .await
            .unwrap();
        let bob = crate::ingest::upsert_user(&db, "did:plc:bob")
            .await
            .unwrap();

        db.execute(&db.sql(
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256, uri, album_art) \
             VALUES ('rec_t1', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1, \
             'sha-t1', 'at://did:plc:bob/app.rocksky.song/3k2a', 'https://example.invalid/a.png')",
        ))
        .await
        .unwrap();

        for (id, user, actor, subject, created) in [
            ("rec_n1", &alice, &bob, None, "2026-01-01T00:00:00.000Z"),
            (
                "rec_n2",
                &alice,
                &bob,
                Some("at://did:plc:bob/app.rocksky.song/3k2a"),
                "2026-01-02T00:00:00.000Z",
            ),
            ("rec_n3", &bob, &alice, None, "2026-01-03T00:00:00.000Z"),
        ] {
            let mut sql = db.sql(
                "INSERT INTO notifications \
                 (xata_id, user_id, actor_id, type, subject_uri, xata_createdat) VALUES (",
            );
            sql.bind(id)
                .push(", ")
                .bind(user)
                .push(", ")
                .bind(actor)
                .push(", ")
                .bind("like")
                .push(", ")
                .bind(subject)
                .push(", ")
                .bind(created)
                .push(")");
            db.execute(&sql).await.unwrap();
        }

        (db, alice)
    }

    /// The list, the count and the cursor have to *run*, not just compile —
    /// and the cursor in particular compares against a TEXT column, where a
    /// rendered datetime literal would page to the wrong place.
    #[tokio::test]
    async fn the_list_is_scoped_paged_and_enriched() {
        let (db, alice) = fixture().await;

        assert_eq!(unread_count(&db, &alice).await.unwrap(), 2);

        let (notifications, cursor) = load(&db, &alice, 10, None).await.unwrap();
        assert_eq!(notifications.len(), 2, "bob's notification leaked");
        // Newest first.
        assert_eq!(notifications[0].id, "rec_n2");
        assert_eq!(notifications[0].actor.did, "did:plc:bob");
        // And the subject was enriched from the track it points at.
        let subject = notifications[0].subject.as_ref().expect("enriched");
        assert_eq!(subject.title.as_deref(), Some("Roygbiv"));
        assert_eq!(subject.artist.as_deref(), Some("Boards of Canada"));
        // A full page was not returned, so there is nothing to page to.
        assert!(cursor.is_none());

        // One at a time: the cursor must reach the older row, not repeat the
        // newer one or skip both.
        let (first, cursor) = load(&db, &alice, 1, None).await.unwrap();
        assert_eq!(first[0].id, "rec_n2");
        let (second, _) = load(&db, &alice, 1, cursor.as_deref()).await.unwrap();
        assert_eq!(second.len(), 1, "the cursor paged past every row");
        assert_eq!(second[0].id, "rec_n1");
    }

    #[test]
    fn a_cursor_round_trips_as_epoch_milliseconds() {
        let at = parse_cursor("1783500678456").expect("parses");
        assert_eq!(at.timestamp_millis().to_string(), "1783500678456");
    }

    #[test]
    fn an_unusable_cursor_restarts_the_list() {
        for cursor in ["", "  ", "yesterday", "3k2a"] {
            assert!(parse_cursor(cursor).is_none(), "{cursor:?}");
        }
    }

    /// The type is a string, not an enum: a notification kind this build
    /// predates must still render rather than fail to deserialize.
    #[test]
    fn an_unknown_notification_type_still_deserializes() {
        let raw = serde_json::json!({
            "id": "n1",
            "type": "somethingNewWeHaveNotSeen",
            "actor": {
                "id": "u1",
                "did": "did:plc:alice",
                "handle": "alice.test",
                "displayName": null,
                "avatar": "",
            },
            "read": false,
            "createdAt": "2026-01-01T00:00:00.000Z",
        });

        let view: NotificationView = serde_json::from_value(raw).expect("parses");
        assert_eq!(view.notification_type, "somethingNewWeHaveNotSeen");
        assert!(!view.read);
        assert!(view.subject.is_none());
    }

    /// The optional fields are omitted rather than sent as null, which is what
    /// keeps a list of thirty notifications small.
    #[test]
    fn absent_detail_is_omitted_not_nulled() {
        let view = NotificationView {
            id: "n1".into(),
            notification_type: "follow".into(),
            actor: NotificationActor {
                id: "u1".into(),
                did: "did:plc:alice".into(),
                handle: "alice.test".into(),
                display_name: None,
                avatar: String::new(),
            },
            read: false,
            shout_id: None,
            shout_content: None,
            subject_uri: None,
            subject: None,
            created_at: chrono::Utc::now(),
        };

        let value = serde_json::to_value(&view).unwrap();
        for field in ["shoutId", "shoutContent", "subjectUri", "subject"] {
            assert!(
                value.get(field).is_none(),
                "{field} should be omitted: {value}"
            );
        }
        // And `type` is the wire name, not `notificationType`.
        assert_eq!(value["type"], "follow");
    }
}
