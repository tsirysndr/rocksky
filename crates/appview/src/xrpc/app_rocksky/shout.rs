//! `app.rocksky.shout.*` — comments on songs, albums, artists and profiles.
//!
//! # The subject
//!
//! A shout hangs off one of five things, and which one is determined by the
//! collection segment of the subject URI it was given:
//!
//! | subject URI contains    | column populated | also written to  |
//! |-------------------------|------------------|------------------|
//! | `app.rocksky.song`      | `track_id`       | —                |
//! | `app.rocksky.album`     | `album_id`       | —                |
//! | `app.rocksky.artist`    | `artist_id`      | —                |
//! | `app.rocksky.scrobble`  | `scrobble_id`    | —                |
//! | a bare `did:` (no path) | `artist_id`      | `profile_shouts` |
//!
//! That last row is the awkward one. A shout on someone's *profile* reuses the
//! `artist_id` column to hold a **user** row id, and records the pairing in
//! `profile_shouts` as well. It is not a design anyone would choose; it is
//! what the production schema does, and matching it is the point.
//!
//! # The lexicon does not declare the subject
//!
//! `app.rocksky.shout.createShout` declares only `message` in its input, yet
//! the subject has to travel somehow — and it does, as an undeclared `uri`
//! field that the TypeScript handler reads off an open input schema. That is a
//! gap in the lexicon rather than a deliberate design, so the same field is
//! read here and the reason recorded, because generated types would not have
//! it.

use crate::atproto::writer::Writer;
use crate::auth::AuthDid;
use crate::db::models::{User, USER_COLS};
use crate::db::schema::{ProfileShouts, ShoutReports, Shouts, Users};
use crate::db::{new_id, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Alias, Expr, JoinType, Order, Query, SelectStatement};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, clamp_offset, json, ok_empty};
use crate::{xrpc_procedure, xrpc_query};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.shout.getTrackShouts", get_track_shouts);
    xrpc_query!(cfg, "app.rocksky.shout.getAlbumShouts", get_album_shouts);
    xrpc_query!(cfg, "app.rocksky.shout.getArtistShouts", get_artist_shouts);
    xrpc_query!(
        cfg,
        "app.rocksky.shout.getProfileShouts",
        get_profile_shouts
    );
    xrpc_query!(cfg, "app.rocksky.shout.getShoutReplies", get_shout_replies);
    xrpc_procedure!(cfg, "app.rocksky.shout.createShout", create_shout);
    xrpc_procedure!(cfg, "app.rocksky.shout.replyShout", reply_shout);
    xrpc_procedure!(cfg, "app.rocksky.shout.removeShout", remove_shout);
    xrpc_procedure!(cfg, "app.rocksky.shout.reportShout", report_shout);
}

const SHOUT_COLLECTION: &str = "app.rocksky.shout";
const SHOUT_DEFAULT_LIMIT: i64 = 20;

/// The longest a shout may be.
///
/// Not in the lexicon, which declares only `minLength: 1`. An unbounded
/// message would let one request fill a column, so a limit is applied — and
/// 3000 bytes is what Bluesky uses for a post, which is the length users are
/// calibrated to.
const MAX_MESSAGE_BYTES: usize = 3000;

// -------------------------------------------------------------------- views

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
}

impl From<&User> for Author {
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

/// An attached GIF.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gif {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShoutView {
    pub id: String,
    pub message: String,
    pub author: Author,
    /// Mention facets, as the row stored them. Passed through rather than
    /// re-parsed: they are byte offsets into `message`, and recomputing them
    /// from the text would get a different answer for any message edited
    /// since.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub facets: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gif: Option<Gif>,
    /// The shout this replies to, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ShoutsOutput {
    pub shouts: Vec<ShoutView>,
}

// -------------------------------------------------------------------- reads

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShoutParams {
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    /// `getProfileShouts` names the actor `did` rather than `uri`.
    #[serde(default)]
    pub did: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

/// Which column a read matches on.
#[derive(Debug, Clone, Copy)]
enum Anchor {
    Track,
    Album,
    Artist,
    /// Replies to another shout.
    Parent,
}

impl Anchor {
    fn column(&self) -> &'static str {
        match self {
            Self::Track => "track_id",
            Self::Album => "album_id",
            Self::Artist => "artist_id",
            Self::Parent => "parent_id",
        }
    }

    /// The table whose `uri` column resolves the subject to a row id.
    fn table(&self) -> &'static str {
        match self {
            Self::Track => "tracks",
            Self::Album => "albums",
            Self::Artist => "artists",
            Self::Parent => "shouts",
        }
    }
}

macro_rules! shout_reader {
    ($name:ident, $anchor:expr) => {
        async fn $name(
            state: web::Data<AppState>,
            params: web::Query<ShoutParams>,
        ) -> XrpcResult<HttpResponse> {
            let params = params.into_inner();
            let Some(uri) = params.uri.clone() else {
                return json(ShoutsOutput::default());
            };

            match load_by_anchor(state.db(), $anchor, &uri, &params).await {
                Ok(shouts) => json(ShoutsOutput { shouts }),
                Err(err) => {
                    tracing::error!(error = ?err, uri = %uri, "error retrieving shouts");
                    json(ShoutsOutput::default())
                }
            }
        }
    };
}

shout_reader!(get_track_shouts, Anchor::Track);
shout_reader!(get_album_shouts, Anchor::Album);
shout_reader!(get_artist_shouts, Anchor::Artist);
shout_reader!(get_shout_replies, Anchor::Parent);

/// `app.rocksky.shout.getProfileShouts`
///
/// Reads through `profile_shouts` rather than by column, because a profile
/// shout's `artist_id` holds a user row id and matching it against `artists`
/// would find nothing.
async fn get_profile_shouts(
    state: web::Data<AppState>,
    params: web::Query<ShoutParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(did) = params.did.clone().or_else(|| params.uri.clone()) else {
        return json(ShoutsOutput::default());
    };

    let db = state.db();
    let result = async {
        let Some(user) = find_user(db, &did).await? else {
            return Ok(Vec::new());
        };

        let mut query = Query::select();
        shout_columns(&mut query, Some("s"));
        query
            .from_as(ProfileShouts::Table, Alias::new("p"))
            .join_as(
                JoinType::Join,
                Shouts::Table,
                Alias::new("s"),
                Expr::col((Alias::new("s"), Shouts::XataId))
                    .equals((Alias::new("p"), ProfileShouts::ShoutId)),
            )
            .and_where(Expr::col((Alias::new("p"), ProfileShouts::UserId)).eq(user.id.clone()))
            .order_by((Alias::new("s"), Shouts::XataCreatedat), Order::Desc)
            .limit(clamp_limit_or(params.limit, SHOUT_DEFAULT_LIMIT) as u64)
            .offset(clamp_offset(params.offset) as u64);

        hydrate(db, db.fetch_all(&query).await?).await
    }
    .await;

    match result {
        Ok(shouts) => json(ShoutsOutput { shouts }),
        Err(err) => {
            tracing::error!(error = ?err, did = %did, "error retrieving profile shouts");
            json(ShoutsOutput::default())
        }
    }
}

/// Adds every column a shout view needs, in the order [`hydrate`] expects.
///
/// `prefix` is the table alias when the shout is reached through a join.
fn shout_columns(query: &mut SelectStatement, prefix: Option<&str>) {
    let col = |column| match prefix {
        Some(alias) => Expr::col((Alias::new(alias), column)),
        None => Expr::col(column),
    };

    query
        .expr(col(Shouts::XataId))
        .expr(col(Shouts::Content))
        .expr(col(Shouts::AuthorId))
        .expr(col(Shouts::ParentId))
        .expr(col(Shouts::Facets))
        .expr(col(Shouts::GifUrl))
        .expr(col(Shouts::GifPreviewUrl))
        .expr(col(Shouts::GifAlt))
        .expr(col(Shouts::GifWidth))
        .expr(col(Shouts::GifHeight))
        .expr(col(Shouts::XataCreatedat));
}

/// A row of [`shout_columns`].
type ShoutRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<i64>,
    Option<i64>,
    chrono::DateTime<chrono::Utc>,
);

async fn load_by_anchor(
    db: &Backend,
    anchor: Anchor,
    uri: &str,
    params: &ShoutParams,
) -> anyhow::Result<Vec<ShoutView>> {
    // The subject is named by URI; the column holds a row id.
    let lookup = Query::select()
        .column(Alias::new("xata_id"))
        .from(Alias::new(anchor.table()))
        .and_where(Expr::col(Alias::new("uri")).eq(uri))
        .limit(1)
        .take();
    let Some(subject_id) = db.fetch_scalar::<String>(&lookup).await? else {
        return Ok(Vec::new());
    };

    let mut query = Query::select();
    shout_columns(&mut query, None);
    query
        .from(Shouts::Table)
        .and_where(Expr::col(Alias::new(anchor.column())).eq(subject_id));

    // A reply list wants the replies; a subject list wants only top-level
    // shouts, since the replies appear nested under their parent.
    if !matches!(anchor, Anchor::Parent) {
        query.and_where(Expr::col(Shouts::ParentId).is_null());
    }

    query
        .order_by(Shouts::XataCreatedat, Order::Desc)
        .limit(clamp_limit_or(params.limit, SHOUT_DEFAULT_LIMIT) as u64)
        .offset(clamp_offset(params.offset) as u64);

    hydrate(db, db.fetch_all(&query).await?).await
}

/// Attaches authors to a page of shout rows.
async fn hydrate(db: &Backend, rows: Vec<ShoutRow>) -> anyhow::Result<Vec<ShoutView>> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let authors =
        crate::db::loaders::users_by_id(db, rows.iter().map(|row| Some(row.2.clone()))).await?;

    Ok(rows
        .iter()
        .filter_map(|row| {
            let (
                id,
                content,
                author_id,
                parent_id,
                facets,
                gif_url,
                gif_preview_url,
                gif_alt,
                gif_width,
                gif_height,
                created_at,
            ) = row;

            // A shout whose author has gone cannot be attributed, and an
            // unattributed comment is worse than a missing one.
            let author = authors.get(author_id.as_str())?;

            Some(ShoutView {
                id: id.clone(),
                message: content.clone(),
                author: Author::from(author),
                // Stored as a JSON string; passed through as parsed JSON, and
                // dropped rather than erroring if it is unreadable.
                facets: facets
                    .as_deref()
                    .and_then(|raw| serde_json::from_str(raw).ok()),
                gif: gif_url.as_ref().map(|url| Gif {
                    url: url.clone(),
                    preview_url: gif_preview_url.clone(),
                    alt: gif_alt.clone(),
                    width: *gif_width,
                    height: *gif_height,
                }),
                parent: parent_id.clone(),
                created_at: *created_at,
            })
        })
        .collect())
}

// ------------------------------------------------------------------- writes

/// What `createShout` is sent.
///
/// `uri` is not in the lexicon — see the module note. It is the subject: a
/// song, album, artist or scrobble AT-URI, or a bare DID for a profile shout.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShoutInput {
    pub message: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    #[serde(default)]
    pub facets: Option<serde_json::Value>,
    #[serde(default)]
    pub gif: Option<Gif>,
}

/// An `app.rocksky.shout` record.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShoutRecord {
    #[serde(rename = "$type")]
    pub record_type: &'static str,
    pub message: String,
    /// The subject, as given. A DID for a profile shout, an AT-URI otherwise.
    pub subject: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub facets: Option<serde_json::Value>,
    pub created_at: String,
}

/// Where a shout's subject columns land.
#[derive(Debug, Default)]
struct Subject {
    track_id: Option<String>,
    album_id: Option<String>,
    /// For a profile shout this is a *user* row id, not an artist's. See the
    /// module note.
    artist_id: Option<String>,
    scrobble_id: Option<String>,
    /// Set only for a profile shout, and written to `profile_shouts`.
    profile_user_id: Option<String>,
}

/// Resolves a subject URI to the row it hangs off.
async fn resolve_subject(db: &Backend, uri: &str) -> Result<Subject, XrpcError> {
    // A bare DID — or a handle, which is what the legacy REST path carries
    // when the UI only had one — is a profile shout. Checked first, because
    // neither contains a collection segment and both would otherwise fall
    // through to "unknown".
    if uri.starts_with("did:") || !uri.contains('/') {
        let user = find_user(db, uri)
            .await?
            .ok_or_else(|| XrpcError::invalid_request("No such account"))?;
        return Ok(Subject {
            artist_id: Some(user.id.clone()),
            profile_user_id: Some(user.id),
            ..Default::default()
        });
    }

    let lookup = |table: &'static str| {
        Query::select()
            .column(Alias::new("xata_id"))
            .from(Alias::new(table))
            .and_where(Expr::col(Alias::new("uri")).eq(uri))
            .limit(1)
            .take()
    };

    // Matched on the collection segment, in the order the TypeScript handler
    // checks them.
    let (table, field): (&str, fn(&mut Subject, String)) = if uri.contains("app.rocksky.song") {
        ("tracks", |subject, id| subject.track_id = Some(id))
    } else if uri.contains("app.rocksky.album") {
        ("albums", |subject, id| subject.album_id = Some(id))
    } else if uri.contains("app.rocksky.artist") {
        ("artists", |subject, id| subject.artist_id = Some(id))
    } else if uri.contains("app.rocksky.scrobble") {
        ("scrobbles", |subject, id| subject.scrobble_id = Some(id))
    } else {
        return Err(XrpcError::invalid_request(format!(
            "{uri} is not a song, album, artist, scrobble or account"
        )));
    };

    let id = db
        .fetch_scalar::<String>(&lookup(table))
        .await?
        .ok_or_else(|| {
            XrpcError::invalid_request("That subject is not known to this instance")
                .named("SubjectNotFound")
        })?;

    let mut subject = Subject::default();
    field(&mut subject, id);
    Ok(subject)
}

/// `app.rocksky.shout.createShout`
///
/// `pub(crate)`: the legacy REST routes under `/users` (see
/// [`crate::rest::users`]) accept the same writes at their old paths and
/// delegate here rather than re-implementing the record write.
pub(crate) async fn create_shout(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<CreateShoutInput>,
) -> XrpcResult<HttpResponse> {
    let message = validate_message(body.message.as_deref())?;
    let uri = body
        .uri
        .as_deref()
        .map(str::trim)
        .filter(|uri| !uri.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("uri is required"))?
        .to_string();

    let db = state.db();
    let subject = resolve_subject(db, &uri).await?;
    write_shout(&state, &auth.did, message, uri, subject, None, &body).await
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplyShoutInput {
    pub shout_id: Option<String>,
    pub message: Option<String>,
    #[serde(default)]
    pub facets: Option<serde_json::Value>,
    #[serde(default)]
    pub gif: Option<Gif>,
}

/// `app.rocksky.shout.replyShout`
///
/// A reply inherits its parent's subject, so it appears under the same song or
/// album as the shout it answers.
pub(crate) async fn reply_shout(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<ReplyShoutInput>,
) -> XrpcResult<HttpResponse> {
    let message = validate_message(body.message.as_deref())?;
    let parent_id = body
        .shout_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("shoutId is required"))?
        .to_string();

    let db = state.db();

    // The parent's subject columns are copied, so a reply is anchored to the
    // same thing. Reading them from the parent rather than asking the caller
    // means a reply cannot be attached to a different subject than the shout
    // it answers.
    let query = Query::select()
        .columns([
            Shouts::TrackId,
            Shouts::AlbumId,
            Shouts::ArtistId,
            Shouts::ScrobbleId,
            Shouts::Uri,
        ])
        .from(Shouts::Table)
        .and_where(Expr::col(Shouts::XataId).eq(&parent_id))
        .limit(1)
        .take();

    type ParentRow = (
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
    );
    let parent: ParentRow = db.fetch_optional(&query).await?.ok_or_else(|| {
        XrpcError::invalid_request("No shout with that id").named("ShoutNotFound")
    })?;

    let subject = Subject {
        track_id: parent.0,
        album_id: parent.1,
        artist_id: parent.2,
        scrobble_id: parent.3,
        // A reply to a profile shout does not get its own `profile_shouts`
        // row: the parent already has one, and the reply is reached through
        // it.
        profile_user_id: None,
    };

    let input = CreateShoutInput {
        message: None,
        uri: None,
        facets: body.facets.clone(),
        gif: body.gif.clone(),
    };
    write_shout(
        &state,
        &auth.did,
        message,
        parent.4,
        subject,
        Some(parent_id),
        &input,
    )
    .await
}

/// Publishes the record and writes the row.
#[allow(clippy::too_many_arguments)]
async fn write_shout(
    state: &AppState,
    did: &str,
    message: String,
    subject_uri: String,
    subject: Subject,
    parent_id: Option<String>,
    input: &CreateShoutInput,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let author_id = caller_id(db, did).await?;

    let writer = Writer::for_did(state, did).await?;
    let rkey = crate::atproto::records::next_tid();
    let written = writer
        .create(
            SHOUT_COLLECTION,
            &rkey,
            &ShoutRecord {
                record_type: SHOUT_COLLECTION,
                message: message.clone(),
                subject: subject_uri,
                parent: parent_id.clone(),
                facets: input.facets.clone(),
                created_at: crate::views::timestamp::to_iso8601(&chrono::Utc::now()),
            },
        )
        .await?;

    let shout_id = new_id();
    let insert = Query::insert()
        .into_table(Shouts::Table)
        .columns([
            Shouts::XataId,
            Shouts::Content,
            Shouts::Uri,
            Shouts::AuthorId,
            Shouts::ParentId,
            Shouts::TrackId,
            Shouts::AlbumId,
            Shouts::ArtistId,
            Shouts::ScrobbleId,
            Shouts::Facets,
            Shouts::GifUrl,
            Shouts::GifPreviewUrl,
            Shouts::GifAlt,
            Shouts::GifWidth,
            Shouts::GifHeight,
        ])
        .values_panic([
            shout_id.clone().into(),
            message.clone().into(),
            written.uri.clone().into(),
            author_id.clone().into(),
            parent_id.clone().into(),
            subject.track_id.clone().into(),
            subject.album_id.clone().into(),
            subject.artist_id.clone().into(),
            subject.scrobble_id.clone().into(),
            input
                .facets
                .as_ref()
                .map(|facets| facets.to_string())
                .into(),
            input.gif.as_ref().map(|gif| gif.url.clone()).into(),
            input
                .gif
                .as_ref()
                .and_then(|gif| gif.preview_url.clone())
                .into(),
            input.gif.as_ref().and_then(|gif| gif.alt.clone()).into(),
            input.gif.as_ref().and_then(|gif| gif.width).into(),
            input.gif.as_ref().and_then(|gif| gif.height).into(),
        ])
        .to_owned();
    db.execute(&insert).await?;

    if let Some(user_id) = &subject.profile_user_id {
        let link = Query::insert()
            .into_table(ProfileShouts::Table)
            .columns([
                ProfileShouts::XataId,
                ProfileShouts::UserId,
                ProfileShouts::ShoutId,
            ])
            .values_panic([
                new_id().into(),
                user_id.as_str().into(),
                shout_id.clone().into(),
            ])
            .to_owned();
        db.execute(&link).await?;
    }

    tracing::info!(did, shout_id = %shout_id, "posted a shout");

    // The created shout, so the UI can render it without refetching.
    let mut query = Query::select();
    shout_columns(&mut query, None);
    query
        .from(Shouts::Table)
        .and_where(Expr::col(Shouts::XataId).eq(&shout_id));
    let created = hydrate(db, db.fetch_all(&query).await?).await?;

    match created.into_iter().next() {
        Some(view) => json(view),
        // The row was just written, so this cannot normally happen; answering
        // empty rather than erroring keeps the post from looking failed.
        None => json(serde_json::json!({})),
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RemoveShoutParams {
    #[serde(default)]
    pub id: Option<String>,
}

/// `app.rocksky.shout.removeShout`
///
/// Only the author may remove their own shout. Checked in the `WHERE` rather
/// than by reading first and then deleting, so there is no window between the
/// two.
pub(crate) async fn remove_shout(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<RemoveShoutParams>,
) -> XrpcResult<HttpResponse> {
    let id = params
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("id is required"))?;

    let db = state.db();
    let author_id = caller_id(db, &auth.did).await?;

    let lookup = Query::select()
        .column(Shouts::Uri)
        .from(Shouts::Table)
        .and_where(Expr::col(Shouts::XataId).eq(id))
        .and_where(Expr::col(Shouts::AuthorId).eq(&author_id))
        .limit(1)
        .take();

    let Some(uri) = db.fetch_scalar::<String>(&lookup).await? else {
        // Either it does not exist or it is not theirs. The two are not
        // distinguished: saying which would tell a caller that someone else's
        // shout exists.
        return Err(XrpcError::forbidden("That shout is not yours to remove"));
    };

    if let Some(rkey) = super::like::rkey_of(&uri) {
        let writer = Writer::for_did(&state, &auth.did).await?;
        writer.delete(SHOUT_COLLECTION, &rkey).await?;
    }

    // Replies are removed with their parent: the schema has no cascade, and
    // leaving them would show orphaned replies under nothing.
    let delete_replies = Query::delete()
        .from_table(Shouts::Table)
        .and_where(Expr::col(Shouts::ParentId).eq(id))
        .to_owned();
    db.execute(&delete_replies).await?;

    let delete = Query::delete()
        .from_table(Shouts::Table)
        .and_where(Expr::col(Shouts::XataId).eq(id))
        .and_where(Expr::col(Shouts::AuthorId).eq(&author_id))
        .to_owned();
    db.execute(&delete).await?;

    tracing::info!(did = %auth.did, shout_id = id, "removed a shout");
    ok_empty()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportShoutInput {
    pub shout_id: Option<String>,
    /// Declared by the lexicon, accepted, and then dropped: `shout_reports`
    /// has no column to put it in. Recording it needs a migration, so it is
    /// not stored rather than stored somewhere it does not belong — which is
    /// what the TypeScript handler does too, silently.
    #[serde(default)]
    pub reason: Option<String>,
}

/// `app.rocksky.shout.reportShout`
pub(crate) async fn report_shout(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<ReportShoutInput>,
) -> XrpcResult<HttpResponse> {
    let shout_ref = body
        .shout_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("shoutId is required"))?;

    let db = state.db();
    let shout_id = record_report(db, &auth.did, shout_ref).await?;

    // The lexicon declares a `shoutView` here. The TypeScript handler answers
    // `{}` instead, which nothing can render, so the reported shout is sent.
    let mut query = Query::select();
    shout_columns(&mut query, None);
    query
        .from(Shouts::Table)
        .and_where(Expr::col(Shouts::XataId).eq(&shout_id));

    match hydrate(db, db.fetch_all(&query).await?)
        .await?
        .into_iter()
        .next()
    {
        Some(view) => json(view),
        // Only reachable if the author row has gone; the report is written
        // either way, so this must not read as a failed report.
        None => ok_empty(),
    }
}

/// Files one report, and answers the row id of the shout it was filed against.
///
/// A second report of the same shout by the same person is the same report:
/// the pair is looked up first, so a double tap in the UI does not inflate a
/// moderation queue.
async fn record_report(db: &Backend, did: &str, shout_ref: &str) -> Result<String, XrpcError> {
    let user_id = caller_id(db, did).await?;
    let shout_id = resolve_shout_id(db, shout_ref).await?;

    let existing = Query::select()
        .column(ShoutReports::XataId)
        .from(ShoutReports::Table)
        .and_where(Expr::col(ShoutReports::UserId).eq(&user_id))
        .and_where(Expr::col(ShoutReports::ShoutId).eq(&shout_id))
        .limit(1)
        .take();

    if db.fetch_scalar::<String>(&existing).await?.is_none() {
        let insert = Query::insert()
            .into_table(ShoutReports::Table)
            .columns([
                ShoutReports::XataId,
                ShoutReports::UserId,
                ShoutReports::ShoutId,
            ])
            .values_panic([
                new_id().into(),
                user_id.as_str().into(),
                shout_id.as_str().into(),
            ])
            .to_owned();
        db.execute(&insert).await?;
        tracing::info!(did, shout_id = %shout_id, "reported a shout");
    }

    Ok(shout_id)
}

/// `shoutId` may be a row id or the shout's AT-URI; both are accepted, as the
/// TypeScript handler accepts them.
pub(crate) async fn resolve_shout_id(db: &Backend, id_or_uri: &str) -> Result<String, XrpcError> {
    let column = if id_or_uri.starts_with("at://") {
        Shouts::Uri
    } else {
        Shouts::XataId
    };

    let query = Query::select()
        .column(Shouts::XataId)
        .from(Shouts::Table)
        .and_where(Expr::col(column).eq(id_or_uri))
        .limit(1)
        .take();

    db.fetch_scalar::<String>(&query)
        .await?
        .ok_or_else(|| XrpcError::invalid_request("No shout with that id").named("ShoutNotFound"))
}

// ------------------------------------------------------------------- shared

/// Checks a message is present and not absurdly long.
fn validate_message(message: Option<&str>) -> Result<String, XrpcError> {
    let message = message
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("message is required"))?;

    if message.len() > MAX_MESSAGE_BYTES {
        return Err(XrpcError::invalid_request(format!(
            "A shout may be at most {MAX_MESSAGE_BYTES} bytes; that one is {}",
            message.len()
        )));
    }

    Ok(message.to_string())
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

async fn find_user(db: &Backend, did_or_handle: &str) -> Result<Option<User>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, USER_COLS, None);
    query
        .from(Users::Table)
        .and_where(
            Expr::col(Users::Did)
                .eq(did_or_handle)
                .or(Expr::col(Users::Handle).eq(did_or_handle)),
        )
        .limit(1);
    db.fetch_optional::<User>(&query).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::sea_query::Asterisk;
    use crate::sea_query::Func;

    /// Alice has posted one shout; Bob is there to report it.
    async fn report_fixture() -> Backend {
        let backend = db::connect_in_memory().await.unwrap();

        let statements = [
            "INSERT INTO users (xata_id, did, handle, avatar) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'a'), \
             ('rec_bob', 'did:plc:bob', 'bob.test', 'b')",
            "INSERT INTO shouts (xata_id, content, uri, author_id) VALUES \
             ('rec_shout', 'listen to this', \
              'at://did:plc:alice/app.rocksky.shout/3shout', 'rec_alice')",
        ];
        for text in statements {
            backend.execute(&backend.sql(text)).await.expect(text);
        }
        backend
    }

    async fn report_count(db: &Backend) -> i64 {
        let query = Query::select()
            .expr(Func::count(Expr::col(Asterisk)))
            .from(ShoutReports::Table)
            .to_owned();
        db.count(&query).await.unwrap()
    }

    #[tokio::test]
    async fn a_report_is_written() {
        let db = report_fixture().await;

        let shout_id = record_report(&db, "did:plc:bob", "rec_shout")
            .await
            .unwrap();
        assert_eq!(shout_id, "rec_shout");

        let query = Query::select()
            .columns([ShoutReports::UserId, ShoutReports::ShoutId])
            .from(ShoutReports::Table)
            .to_owned();
        let rows: Vec<(String, String)> = db.fetch_all(&query).await.unwrap();
        assert_eq!(rows, vec![("rec_bob".to_string(), "rec_shout".to_string())]);
    }

    /// A double tap in the UI must not file two reports.
    #[tokio::test]
    async fn reporting_the_same_shout_twice_does_not_duplicate() {
        let db = report_fixture().await;

        record_report(&db, "did:plc:bob", "rec_shout")
            .await
            .unwrap();
        record_report(&db, "did:plc:bob", "rec_shout")
            .await
            .unwrap();
        assert_eq!(report_count(&db).await, 1);

        // A different reporter is a different report.
        record_report(&db, "did:plc:alice", "rec_shout")
            .await
            .unwrap();
        assert_eq!(report_count(&db).await, 2);
    }

    #[tokio::test]
    async fn a_shout_may_be_named_by_its_uri() {
        let db = report_fixture().await;
        let shout_id = record_report(
            &db,
            "did:plc:bob",
            "at://did:plc:alice/app.rocksky.shout/3shout",
        )
        .await
        .unwrap();
        assert_eq!(shout_id, "rec_shout");
    }

    #[tokio::test]
    async fn reporting_an_unknown_shout_is_a_400_and_writes_nothing() {
        let db = report_fixture().await;
        let error = record_report(&db, "did:plc:bob", "rec_nope")
            .await
            .unwrap_err();

        assert_eq!(error.kind.status(), 400);
        assert_eq!(error.body().error, "ShoutNotFound");
        assert_eq!(report_count(&db).await, 0);
    }

    #[test]
    fn a_message_is_required_and_trimmed() {
        assert!(validate_message(None).is_err());
        assert!(validate_message(Some("")).is_err());
        assert!(validate_message(Some("   ")).is_err());
        assert_eq!(validate_message(Some("  hi  ")).unwrap(), "hi");
    }

    /// The lexicon sets no maximum, so one is applied here — an unbounded
    /// message would let one request fill the column.
    #[test]
    fn an_over_long_message_is_refused_with_its_size() {
        let long = "x".repeat(MAX_MESSAGE_BYTES + 1);
        let error = validate_message(Some(&long)).unwrap_err();
        assert_eq!(error.kind.status(), 400);
        assert!(
            error
                .body()
                .message
                .contains(&MAX_MESSAGE_BYTES.to_string()),
            "{}",
            error.body().message
        );

        // Exactly at the limit is fine.
        assert!(validate_message(Some(&"x".repeat(MAX_MESSAGE_BYTES))).is_ok());
    }

    /// Each anchor must read its own column, or a track's shouts show an
    /// album's.
    #[test]
    fn the_anchors_map_to_distinct_columns() {
        let pairs = [
            (Anchor::Track, "track_id", "tracks"),
            (Anchor::Album, "album_id", "albums"),
            (Anchor::Artist, "artist_id", "artists"),
            (Anchor::Parent, "parent_id", "shouts"),
        ];
        for (anchor, column, table) in pairs {
            assert_eq!(anchor.column(), column);
            assert_eq!(anchor.table(), table);
        }

        let columns: std::collections::HashSet<&str> =
            pairs.iter().map(|(a, _, _)| a.column()).collect();
        assert_eq!(columns.len(), 4, "the columns must all differ");
    }

    /// A record must carry the subject and, for a reply, the parent.
    #[test]
    fn a_shout_record_serializes_as_the_lexicon_declares() {
        let record = ShoutRecord {
            record_type: SHOUT_COLLECTION,
            message: "nice".into(),
            subject: "at://did:plc:alice/app.rocksky.song/3song".into(),
            parent: None,
            facets: None,
            created_at: "2026-01-01T00:00:00.000Z".into(),
        };
        let value = serde_json::to_value(&record).unwrap();

        assert_eq!(value["$type"], "app.rocksky.shout");
        assert_eq!(value["message"], "nice");
        assert_eq!(
            value["subject"],
            "at://did:plc:alice/app.rocksky.song/3song"
        );
        assert_eq!(value["createdAt"], "2026-01-01T00:00:00.000Z");
        // Absent rather than null, so a top-level shout carries no parent key.
        assert!(value.get("parent").is_none(), "{value}");
        assert!(value.get("facets").is_none(), "{value}");

        let reply = ShoutRecord {
            parent: Some("at://did:plc:alice/app.rocksky.shout/3parent".into()),
            ..record
        };
        assert_eq!(
            serde_json::to_value(&reply).unwrap()["parent"],
            "at://did:plc:alice/app.rocksky.shout/3parent"
        );
    }

    /// A profile shout writes the *user* id into `artist_id` and also links
    /// `profile_shouts`. Surprising, and what production does.
    #[test]
    fn a_profile_subject_uses_the_artist_column_and_links_separately() {
        let subject = Subject {
            artist_id: Some("u1".into()),
            profile_user_id: Some("u1".into()),
            ..Default::default()
        };

        assert_eq!(subject.artist_id.as_deref(), Some("u1"));
        assert_eq!(subject.profile_user_id.as_deref(), Some("u1"));
        assert!(subject.track_id.is_none());
        assert!(subject.album_id.is_none());
        assert!(subject.scrobble_id.is_none());
    }

    /// A gif's optional parts are omitted rather than nulled.
    #[test]
    fn a_gif_omits_what_it_does_not_have() {
        let gif = Gif {
            url: "https://example/a.gif".into(),
            preview_url: None,
            alt: None,
            width: None,
            height: None,
        };
        let value = serde_json::to_value(&gif).unwrap();
        assert_eq!(value["url"], "https://example/a.gif");
        for field in ["previewUrl", "alt", "width", "height"] {
            assert!(value.get(field).is_none(), "{field}: {value}");
        }
    }
}
