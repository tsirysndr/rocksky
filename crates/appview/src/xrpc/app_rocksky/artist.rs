//! `app.rocksky.artist.*` — the artist page.
//!
//! The albums and tracks lists go through the `artist_albums` and
//! `artist_tracks` junctions rather than matching on `tracks.artist`, because
//! the artist column holds the *credited* string — "Kendrick Lamar, Jay Rock"
//! — while the junction points at the album artist's row. Matching on text
//! would miss every collaboration.

use super::ranking::{self, Scope};
use crate::db::models::{Artist, ARTIST_COLS};
use crate::db::schema::{Artists, Scrobbles, Tracks, Users};
use crate::db::Backend;
use crate::error::XrpcResult;
use crate::sea_query::{Alias, Asterisk, Expr, Func, JoinType, Order, Query, SimpleExpr};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, clamp_offset, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.artist.getArtist", get_artist);
    xrpc_query!(cfg, "app.rocksky.artist.getArtists", get_artists);
    xrpc_query!(cfg, "app.rocksky.artist.getArtistAlbums", get_artist_albums);
    xrpc_query!(cfg, "app.rocksky.artist.getArtistTracks", get_artist_tracks);
    xrpc_query!(
        cfg,
        "app.rocksky.artist.getArtistListeners",
        get_artist_listeners
    );
    xrpc_query!(
        cfg,
        "app.rocksky.artist.getArtistRecentListeners",
        get_artist_recent_listeners
    );
}

const ARTIST_DEFAULT_LIMIT: i64 = 20;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistParams {
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    /// Comma-separated artist names to look up instead of ranking.
    ///
    /// The lexicon declares it and `rockbox-zig` depends on it to fill in
    /// pictures and genres for a local library; ignoring it answered the
    /// global top artists instead, which silently attaches the wrong picture
    /// to every artist the caller asked about.
    #[serde(default)]
    pub names: Option<String>,
}

// ------------------------------------------------------------------- detail

/// The artist page's payload: the full record plus its totals.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistViewDetailed {
    #[serde(flatten)]
    pub artist: crate::views::ArtistView,
    pub play_count: i64,
    pub unique_listeners: i64,
}

async fn find_artist(db: &Backend, uri: &str) -> Result<Option<Artist>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, ARTIST_COLS, None);
    query
        .from(Artists::Table)
        .and_where(Expr::col(Artists::Uri).eq(uri))
        .limit(1);
    db.fetch_optional::<Artist>(&query).await
}

/// `app.rocksky.artist.getArtist`
async fn get_artist(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let Some(uri) = params.uri.clone() else {
        return json(serde_json::json!({}));
    };

    let db = state.db();
    let result = async {
        let Some(artist) = find_artist(db, &uri).await? else {
            return Ok(None);
        };
        let totals = ranking::totals_for(db, "artist_id", &artist.id).await?;
        Ok::<_, anyhow::Error>(Some(ArtistViewDetailed {
            artist: crate::views::ArtistView::from(&artist),
            play_count: totals.play_count,
            unique_listeners: totals.unique_listeners,
        }))
    }
    .await;

    match result {
        Ok(Some(artist)) => json(artist),
        Ok(None) => json(serde_json::json!({})),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving an artist");
            json(serde_json::json!({}))
        }
    }
}

// -------------------------------------------------------------------- lists

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ArtistsOutput {
    pub artists: Vec<super::actor::ArtistViewBasic>,
}

/// `app.rocksky.artist.getArtists`
///
/// The global top artists, ranked by everyone's plays.
async fn get_artists(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let db = state.db().reads_may_lag();

    // A lookup by name, not a ranking. Answered first because `names` and
    // `limit` are unrelated: a caller naming forty artists wants those forty.
    if let Some(names) = params.names.as_deref() {
        return match artists_by_name(&db, names).await {
            Ok(artists) => json(ArtistsOutput { artists }),
            Err(err) => {
                tracing::error!(error = ?err, "error looking artists up by name");
                json(ArtistsOutput::default())
            }
        };
    }

    // Cached, global, and nobody expects it to reflect a scrobble from a
    // second ago — so the replica is safe here.
    match top_artists(
        &db,
        &Scope::global(),
        clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
        clamp_offset(params.offset),
    )
    .await
    {
        Ok(artists) => json(ArtistsOutput { artists }),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving artists");
            json(ArtistsOutput::default())
        }
    }
}

/// Artists named in a comma-separated list.
///
/// Matched on the content hash rather than the name, so the caller's casing
/// and surrounding whitespace do not have to match what is stored — which is
/// the whole reason the hash exists.
///
/// A name the instance does not know is simply absent from the answer, as
/// upstream does: the caller asked about a set and gets back the ones that
/// exist, rather than an error naming the one that does not.
async fn artists_by_name(
    db: &Backend,
    names: &str,
) -> anyhow::Result<Vec<super::actor::ArtistViewBasic>> {
    let hashes: Vec<String> = names
        .split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .take(MAX_NAMES)
        .map(rocksky_core::identity::artist_hash)
        .collect();

    if hashes.is_empty() {
        return Ok(Vec::new());
    }

    let mut query = Query::select();
    db.select_model(&mut query, ARTIST_COLS, None);
    query
        .from(Artists::Table)
        .and_where(Expr::col(Artists::Sha256).is_in(hashes.iter().map(String::as_str)));

    let artists: Vec<Artist> = db.fetch_all(&query).await?;
    if artists.is_empty() {
        return Ok(Vec::new());
    }

    // The play counts, so the answer carries the same fields a ranked one
    // does rather than a second, narrower shape for the same view.
    let ids: Vec<String> = artists.iter().map(|artist| artist.id.clone()).collect();
    let scope = Scope::global();
    let plays = ranking::play_counts(db, "artist_id", &ids, &scope).await?;
    let listeners = ranking::unique_listeners(db, "artist_id", &ids, &scope).await?;

    Ok(artists
        .into_iter()
        .map(|artist| super::actor::ArtistViewBasic {
            play_count: plays.get(artist.id.as_str()).copied().unwrap_or(0),
            unique_listeners: listeners.get(artist.id.as_str()).copied().unwrap_or(0),
            tags: artist.genres.as_deref().map(|_| artist.genres()),
            id: artist.id,
            name: artist.name,
            picture: artist.picture,
            sha256: artist.sha256,
            uri: artist.uri,
        })
        .collect())
}

/// Most names one call may look up.
///
/// The bound that matters is the SQL parameter limit, not the URL: a caller
/// with a large library batches, as `rockbox-zig` does.
const MAX_NAMES: usize = 200;

/// Ranks artists within `scope` and hydrates the winners.
pub async fn top_artists(
    db: &Backend,
    scope: &Scope,
    limit: i64,
    offset: i64,
) -> anyhow::Result<Vec<super::actor::ArtistViewBasic>> {
    let ranked = ranking::by_plays(db, "artist_id", scope, limit, offset).await?;
    if ranked.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    let listeners = ranking::unique_listeners(db, "artist_id", &ids, scope).await?;

    let by_id = crate::db::loaders::artists_by_id(db, ids.iter().cloned().map(Some)).await?;

    Ok(ranked
        .iter()
        .filter_map(|(id, plays)| {
            let artist = by_id.get(id.as_str())?;
            Some(super::actor::ArtistViewBasic {
                id: artist.id.clone(),
                name: artist.name.clone(),
                picture: artist.picture.clone(),
                sha256: artist.sha256.clone(),
                uri: artist.uri.clone(),
                tags: artist.genres.as_deref().map(|_| artist.genres()),
                play_count: *plays,
                unique_listeners: listeners.get(id.as_str()).copied().unwrap_or(0),
            })
        })
        .collect())
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ArtistAlbumsOutput {
    pub albums: Vec<super::actor::AlbumViewBasic>,
}

/// `app.rocksky.artist.getArtistAlbums`
///
/// This artist's albums, most-played first. Restricted through the junction:
/// an artist's albums are the ones credited to them as album artist, which is
/// not the same as every album their name appears on.
async fn get_artist_albums(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(ArtistAlbumsOutput::default());
    };

    let db = state.db();
    let result = async {
        let Some(artist) = find_artist(db, &uri).await? else {
            return Ok(Vec::new());
        };
        let album_ids =
            ranking::junction_ids(db, "artist_albums", "artist_id", "album_id", &artist.id).await?;

        super::album::top_albums(
            db,
            &Scope::global().restricted_to(album_ids),
            clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
            clamp_offset(params.offset),
        )
        .await
    }
    .await;

    match result {
        Ok(albums) => json(ArtistAlbumsOutput { albums }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving artist albums");
            json(ArtistAlbumsOutput::default())
        }
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ArtistTracksOutput {
    pub tracks: Vec<super::actor::SongViewBasic>,
}

/// `app.rocksky.artist.getArtistTracks`
async fn get_artist_tracks(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(ArtistTracksOutput::default());
    };

    let db = state.db();
    let result = async {
        let Some(artist) = find_artist(db, &uri).await? else {
            return Ok(Vec::new());
        };
        let track_ids =
            ranking::junction_ids(db, "artist_tracks", "artist_id", "track_id", &artist.id).await?;

        super::song::top_songs(
            db,
            &Scope::global().restricted_to(track_ids),
            clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
            clamp_offset(params.offset),
        )
        .await
    }
    .await;

    match result {
        Ok(tracks) => json(ArtistTracksOutput { tracks }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving artist tracks");
            json(ArtistTracksOutput::default())
        }
    }
}

// ---------------------------------------------------------------- listeners

/// The track a listener played most of this artist's.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MostListenedSong {
    pub title: String,
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    pub play_count: i64,
}

/// One row of an artist's listener leaderboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenerView {
    pub id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
    /// `None` when the listener's most-played track row has gone.
    pub most_listened_song: Option<MostListenedSong>,
    pub total_plays: i64,
    /// Position in the leaderboard, 1-based. Sent by the server because the
    /// UI pages the list and cannot derive it from the index alone.
    pub rank: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ListenersOutput {
    pub listeners: Vec<ListenerView>,
}

/// `app.rocksky.artist.getArtistListeners`
///
/// Who has played this artist most, with each listener's own top track.
async fn get_artist_listeners(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(ListenersOutput::default());
    };

    match load_listeners(
        state.db(),
        &uri,
        clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
        clamp_offset(params.offset),
        false,
    )
    .await
    {
        Ok(listeners) => json(ListenersOutput { listeners }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving artist listeners");
            json(ListenersOutput::default())
        }
    }
}

/// `app.rocksky.artist.getArtistRecentListeners`
///
/// The same rows ordered by when they last played the artist rather than by
/// how much — "who is listening now" against "who listens most".
async fn get_artist_recent_listeners(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(ListenersOutput::default());
    };

    match load_listeners(
        state.db(),
        &uri,
        clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
        clamp_offset(params.offset),
        true,
    )
    .await
    {
        Ok(listeners) => json(ListenersOutput { listeners }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving recent listeners");
            json(ListenersOutput::default())
        }
    }
}

async fn load_listeners(
    db: &Backend,
    uri: &str,
    limit: i64,
    offset: i64,
    by_recency: bool,
) -> anyhow::Result<Vec<ListenerView>> {
    let Some(artist) = find_artist(db, uri).await? else {
        return Ok(Vec::new());
    };

    // The leaderboard itself: one row per user who has played this artist.
    let ranked_by: SimpleExpr = if by_recency {
        Func::max(Expr::col((Alias::new("s"), Scrobbles::Timestamp))).into()
    } else {
        Expr::col(Alias::new("plays")).into()
    };

    let mut query = Query::select();
    query
        .expr(Expr::col((Alias::new("u"), Users::XataId)))
        .expr(Expr::col((Alias::new("u"), Users::Did)))
        .expr(Expr::col((Alias::new("u"), Users::Handle)))
        .expr(Expr::col((Alias::new("u"), Users::DisplayName)))
        .expr(Expr::col((Alias::new("u"), Users::Avatar)))
        .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("plays"))
        .from_as(Scrobbles::Table, Alias::new("s"))
        .join_as(
            JoinType::InnerJoin,
            Users::Table,
            Alias::new("u"),
            Expr::col((Alias::new("u"), Users::XataId))
                .equals((Alias::new("s"), Scrobbles::UserId)),
        )
        .and_where(Expr::col((Alias::new("s"), Scrobbles::ArtistId)).eq(&artist.id))
        // Every non-aggregated column, because Postgres requires it — SQLite
        // would accept grouping by the id alone.
        .add_group_by([
            Expr::col((Alias::new("u"), Users::XataId)).into(),
            Expr::col((Alias::new("u"), Users::Did)).into(),
            Expr::col((Alias::new("u"), Users::Handle)).into(),
            Expr::col((Alias::new("u"), Users::DisplayName)).into(),
            Expr::col((Alias::new("u"), Users::Avatar)).into(),
        ])
        .order_by_expr(ranked_by, Order::Desc)
        .order_by((Alias::new("u"), Users::XataId), Order::Asc)
        .limit(limit as u64)
        .offset(offset as u64);

    type Row = (String, String, String, Option<String>, String, i64);
    let rows: Vec<Row> = db.fetch_all(&query).await?;
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let user_ids: Vec<String> = rows.iter().map(|row| row.0.clone()).collect();
    let top = most_listened(db, &artist.id, &user_ids).await?;

    Ok(rows
        .into_iter()
        .enumerate()
        .map(
            |(index, (id, did, handle, display_name, avatar, plays))| ListenerView {
                most_listened_song: top.get(&id).cloned(),
                id,
                did,
                handle,
                display_name,
                avatar,
                total_plays: plays,
                // 1-based, and continuing across pages.
                rank: offset + index as i64 + 1,
            },
        )
        .collect())
}

/// Each user's most-played track by this artist.
///
/// One query for the whole page rather than one per listener: a window
/// function would be tidier, but SQLite's support for them is recent enough
/// that a self-hoster on an older build would break, and the result set here
/// is bounded by the page size times an artist's track count.
async fn most_listened(
    db: &Backend,
    artist_id: &str,
    user_ids: &[String],
) -> anyhow::Result<std::collections::HashMap<String, MostListenedSong>> {
    if user_ids.is_empty() {
        return Ok(Default::default());
    }

    let query = Query::select()
        .expr(Expr::col((Alias::new("s"), Scrobbles::UserId)))
        .expr(Expr::col((Alias::new("t"), Tracks::Title)))
        .expr(Expr::col((Alias::new("t"), Tracks::Uri)))
        .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("plays"))
        .from_as(Scrobbles::Table, Alias::new("s"))
        .join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("s"), Scrobbles::TrackId)),
        )
        .and_where(Expr::col((Alias::new("s"), Scrobbles::ArtistId)).eq(artist_id))
        .and_where(
            Expr::col((Alias::new("s"), Scrobbles::UserId))
                .is_in(user_ids.iter().map(String::as_str)),
        )
        .add_group_by([
            Expr::col((Alias::new("s"), Scrobbles::UserId)).into(),
            Expr::col((Alias::new("t"), Tracks::Title)).into(),
            Expr::col((Alias::new("t"), Tracks::Uri)).into(),
        ])
        .order_by(Alias::new("plays"), Order::Desc)
        .order_by((Alias::new("t"), Tracks::Title), Order::Asc)
        .take();

    type Row = (String, String, Option<String>, i64);
    let rows: Vec<Row> = db.fetch_all(&query).await?;

    // Ordered by plays, so the first row seen for a user is their top track.
    let mut top = std::collections::HashMap::new();
    for (user_id, title, uri, plays) in rows {
        top.entry(user_id).or_insert(MostListenedSong {
            title,
            uri,
            play_count: plays,
        });
    }
    Ok(top)
}

/// The `names` lookup, which `rockbox-zig` uses to fill in a local library's
/// artist pictures and genres.
#[cfg(test)]
mod by_name {
    use super::*;

    async fn seeded() -> Backend {
        let db = crate::db::connect_in_memory().await.unwrap();
        for (name, picture, genres) in [
            (
                "Boards of Canada",
                Some("https://cdn/boc.jpg"),
                Some(r#"["electronic"]"#),
            ),
            ("Jamiroquai", Some("https://cdn/jamiroquai.jpg"), None),
            ("Earth, Wind & Fire", Some("https://cdn/ewf.jpg"), None),
        ] {
            let insert = Query::insert()
                .into_table(Artists::Table)
                .columns([
                    Artists::XataId,
                    Artists::Name,
                    Artists::Sha256,
                    Artists::Picture,
                    Artists::Genres,
                ])
                .values_panic([
                    crate::db::new_id().into(),
                    name.into(),
                    rocksky_core::identity::artist_hash(name).into(),
                    picture.into(),
                    genres.into(),
                ])
                .to_owned();
            db.execute(&insert).await.unwrap();
        }
        db
    }

    /// The whole point: several names in, the matching artists out, with the
    /// pictures a caller is asking for.
    #[tokio::test]
    async fn several_names_return_their_artists() {
        let db = seeded().await;

        let found = artists_by_name(&db, "Boards of Canada,Jamiroquai")
            .await
            .unwrap();

        let mut names: Vec<&str> = found.iter().map(|a| a.name.as_str()).collect();
        names.sort_unstable();
        assert_eq!(names, vec!["Boards of Canada", "Jamiroquai"]);

        let boc = found.iter().find(|a| a.name == "Boards of Canada").unwrap();
        assert_eq!(boc.picture.as_deref(), Some("https://cdn/boc.jpg"));
        assert_eq!(boc.tags.as_deref(), Some(&["electronic".to_string()][..]));
    }

    /// Matched on the content hash, so a caller's casing and spacing do not
    /// have to match what is stored.
    #[tokio::test]
    async fn casing_and_spacing_do_not_matter() {
        let db = seeded().await;

        let found = artists_by_name(&db, "  boards of canada , JAMIROQUAI ")
            .await
            .unwrap();
        assert_eq!(found.len(), 2, "{found:?}");
    }

    /// A name the instance does not know is absent rather than an error — the
    /// caller asked about a set and gets the ones that exist.
    #[tokio::test]
    async fn unknown_names_are_simply_absent() {
        let db = seeded().await;

        let found = artists_by_name(&db, "Boards of Canada,Nobody At All")
            .await
            .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Boards of Canada");

        assert!(artists_by_name(&db, "Nobody At All")
            .await
            .unwrap()
            .is_empty());
        assert!(artists_by_name(&db, "").await.unwrap().is_empty());
        assert!(artists_by_name(&db, " , , ").await.unwrap().is_empty());
    }

    /// A name containing a comma cannot be expressed in this parameter at
    /// all — it arrives as two names. Worth pinning, because it is why the
    /// enrichment sweep sends those one per request.
    #[tokio::test]
    async fn a_name_containing_a_comma_cannot_be_batched() {
        let db = seeded().await;

        let found = artists_by_name(&db, "Earth, Wind & Fire").await.unwrap();
        assert!(
            found.is_empty(),
            "the comma split it into two names, neither of which exists: {found:?}"
        );

        // Asked for on its own it is still unreachable through this
        // parameter, which is the limitation of the lexicon's `names` being
        // one comma-separated string.
        assert!(artists_by_name(&db, "Earth").await.unwrap().is_empty());
    }

    #[cfg(test)]
    #[tokio::test]
    async fn the_batch_is_bounded() {
        let db = seeded().await;
        let many = (0..MAX_NAMES + 50)
            .map(|n| format!("Artist {n}"))
            .collect::<Vec<_>>()
            .join(",");
        // Nothing matches, but it must answer rather than build a statement
        // with two hundred and fifty bound parameters.
        assert!(artists_by_name(&db, &many).await.unwrap().is_empty());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The rank continues across pages: the first row of page two is rank 21,
    /// not rank 1.
    #[test]
    fn ranks_continue_across_pages() {
        let rank_for = |offset: i64, index: usize| offset + index as i64 + 1;

        assert_eq!(rank_for(0, 0), 1, "the leaderboard is 1-based");
        assert_eq!(rank_for(0, 19), 20);
        assert_eq!(rank_for(20, 0), 21, "page two continues the numbering");
    }

    /// The top track is the first row for a user in a plays-descending
    /// result, so later rows must not overwrite it.
    #[test]
    fn the_first_row_per_user_wins() {
        let rows: Vec<(String, String, Option<String>, i64)> = vec![
            ("u1".into(), "Most played".into(), None, 27),
            ("u1".into(), "Less played".into(), None, 3),
            ("u2".into(), "Theirs".into(), None, 5),
        ];

        let mut top = std::collections::HashMap::new();
        for (user_id, title, uri, plays) in rows {
            top.entry(user_id).or_insert(MostListenedSong {
                title,
                uri,
                play_count: plays,
            });
        }

        assert_eq!(top["u1"].title, "Most played");
        assert_eq!(top["u1"].play_count, 27);
        assert_eq!(top["u2"].title, "Theirs");
    }
}
