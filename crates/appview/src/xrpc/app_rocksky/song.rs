//! `app.rocksky.song.*` — the song page, resolving a song, and adding one.
//!
//! # `matchSong` ranks its lookups rather than OR-ing them
//!
//! A caller describes a song loosely — a title and an artist, sometimes an
//! MBID, an ISRC or an album — and asks which catalogue row that is. The
//! identifiers are tried in the order **content hash, MBID, ISRC, then
//! title/artist**, and that order is the whole point: the same ISRC belongs to
//! several `tracks` rows when a recording is released as a single and again on
//! a compilation, so an unranked `OR` picks whichever row the planner reaches
//! first and silently crosses albums. This is the same ranking
//! [`crate::ingest`] applies when it projects a record, for the same reason.
//!
//! The optional `album` narrows further: only a row from that album counts as
//! a hit, so a remaster or a live edition cannot shadow the requested release
//! just by sorting first. A filter that matches nothing **degrades to the most
//! canonical-looking row** rather than to no match — answering "no such song"
//! because an edition is spelled differently in two catalogues would be worse
//! than answering with the wrong edition of the right song.
//!
//! # `createSong` projects locally, then publishes
//!
//! `apps/api` publishes the ATProto records first and then polls its own
//! database for up to 15 seconds waiting for its firehose indexer to write the
//! rows back. That assumes an indexer is always running. Here the sync source
//! is optional, so — as with uploads ([`crate::rest::ingest`]) and playlists —
//! the catalogue rows are projected locally through
//! [`crate::ingest::upsert_catalogue`] and the records published afterwards.
//! The projection is keyed on content hashes, so the same records arriving
//! later over Tap dedupe against the rows already written.

use super::ranking::{self, Scope};
use crate::atproto::records;
use crate::atproto::writer::Writer;
use crate::auth::AuthDid;
use crate::db::models::{Album, Artist, Track, ALBUM_COLS, ARTIST_COLS, TRACK_COLS};
use crate::db::schema::{AlbumTracks, Albums, Artists, Scrobbles, Tracks, Users};
use crate::db::Backend;
use crate::error::{XrpcError, XrpcResult};
use crate::ingest::{album_hash, artist_hash, track_hash, SongRecord, PLACEHOLDER_ALBUM_ART};
use crate::sea_query::{
    Alias, CaseStatement, Expr, Func, JoinType, Order, Query, SelectStatement, SimpleExpr,
};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, clamp_offset, json};
use crate::{xrpc_procedure, xrpc_query};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.song.getSong", get_song);
    xrpc_query!(cfg, "app.rocksky.song.getSongs", get_songs);
    xrpc_query!(
        cfg,
        "app.rocksky.song.getSongRecentListeners",
        get_song_recent_listeners
    );
    xrpc_query!(cfg, "app.rocksky.song.matchSong", match_song);
    xrpc_procedure!(cfg, "app.rocksky.song.createSong", create_song);
}

const SONG_DEFAULT_LIMIT: i64 = 20;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongParams {
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

/// The song page's payload: the full record, its totals and the like state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongViewDetailed {
    #[serde(flatten)]
    pub track: crate::views::TrackView,
    pub play_count: i64,
    pub unique_listeners: i64,
    pub liked: bool,
    pub likes_count: i64,
}

async fn find_track(db: &Backend, uri: &str) -> Result<Option<Track>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, None);
    query
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Uri).eq(uri))
        .limit(1);

    db.fetch_optional::<Track>(&query).await
}

/// `app.rocksky.song.getSong`
async fn get_song(
    state: web::Data<AppState>,
    params: web::Query<SongParams>,
    auth: crate::auth::Auth,
) -> XrpcResult<HttpResponse> {
    let Some(uri) = params.uri.clone() else {
        return json(serde_json::json!({}));
    };

    let db = state.db();
    let result = async {
        let Some(track) = find_track(db, &uri).await? else {
            return Ok(None);
        };
        let totals = ranking::totals_for(db, "track_id", &track.id).await?;
        let likes = crate::likes::for_track_ids(db, &[track.id.clone()], auth.did()).await?;
        let like = likes.get(&track.id).copied().unwrap_or_default();

        Ok::<_, anyhow::Error>(Some(SongViewDetailed {
            track: crate::views::TrackView::from(&track),
            play_count: totals.play_count,
            unique_listeners: totals.unique_listeners,
            liked: like.liked,
            likes_count: like.count,
        }))
    }
    .await;

    match result {
        Ok(Some(song)) => json(song),
        Ok(None) => json(serde_json::json!({})),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving a song");
            json(serde_json::json!({}))
        }
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct SongsOutput {
    pub tracks: Vec<super::actor::SongViewBasic>,
}

/// `app.rocksky.song.getSongs`
///
/// The global top songs, ranked by everyone's plays.
async fn get_songs(
    state: web::Data<AppState>,
    params: web::Query<SongParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();

    // As with the album and artist charts: global, cached, lag-tolerant.
    match top_songs(
        &state.db().reads_may_lag(),
        &Scope::global(),
        clamp_limit_or(params.limit, SONG_DEFAULT_LIMIT),
        clamp_offset(params.offset),
    )
    .await
    {
        Ok(tracks) => json(SongsOutput { tracks }),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving songs");
            json(SongsOutput::default())
        }
    }
}

/// Ranks tracks within `scope` and hydrates the winners.
///
/// Shared with the actor and artist track lists, which pass a user scope and
/// an id restriction respectively.
pub async fn top_songs(
    db: &Backend,
    scope: &Scope,
    limit: i64,
    offset: i64,
) -> anyhow::Result<Vec<super::actor::SongViewBasic>> {
    let ranked = ranking::by_plays(db, "track_id", scope, limit, offset).await?;
    if ranked.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    let listeners = ranking::unique_listeners(db, "track_id", &ids, scope).await?;

    let by_id = crate::db::loaders::tracks_by_id(db, ids.iter().cloned().map(Some)).await?;

    Ok(ranked
        .iter()
        .filter_map(|(id, plays)| {
            let track = by_id.get(id.as_str())?;
            Some(super::actor::SongViewBasic {
                id: track.id.clone(),
                uri: track.uri.clone(),
                title: track.title.clone(),
                artist: track.artist.clone(),
                artist_uri: track.artist_uri.clone(),
                album: track.album.clone(),
                album_uri: track.album_uri.clone(),
                album_art: track.album_art.clone(),
                album_artist: track.album_artist.clone(),
                copyright_message: track.copyright_message.clone(),
                disc_number: track.disc_number,
                duration: track.duration,
                sha256: track.sha256.clone(),
                track_number: track.track_number,
                play_count: *plays,
                unique_listeners: listeners.get(id.as_str()).copied().unwrap_or(0),
                created_at: track.created_at,
            })
        })
        .collect())
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct RecentListenersOutput {
    pub listeners: Vec<super::artist::ListenerView>,
}

/// `app.rocksky.song.getSongRecentListeners`
///
/// Who played this song most recently. Shares the listener row with the
/// artist leaderboard, so the UI renders both with one component.
async fn get_song_recent_listeners(
    state: web::Data<AppState>,
    params: web::Query<SongParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(RecentListenersOutput::default());
    };

    let db = state.db();
    let limit = clamp_limit_or(params.limit, SONG_DEFAULT_LIMIT);
    let offset = clamp_offset(params.offset);

    let result = async {
        let Some(track) = find_track(db, &uri).await? else {
            return Ok(Vec::new());
        };

        let mut query = Query::select();
        query
            .expr(Expr::col((Alias::new("u"), Users::XataId)))
            .expr(Expr::col((Alias::new("u"), Users::Did)))
            .expr(Expr::col((Alias::new("u"), Users::Handle)))
            .expr(Expr::col((Alias::new("u"), Users::DisplayName)))
            .expr(Expr::col((Alias::new("u"), Users::Avatar)))
            .expr_as(db.cast_int(Func::count(Expr::val(1))), Alias::new("plays"))
            .from_as(Scrobbles::Table, Alias::new("s"))
            .join_as(
                JoinType::InnerJoin,
                Users::Table,
                Alias::new("u"),
                Expr::col((Alias::new("u"), Users::XataId))
                    .equals((Alias::new("s"), Scrobbles::UserId)),
            )
            .and_where(Expr::col((Alias::new("s"), Scrobbles::TrackId)).eq(track.id.clone()))
            // Every non-aggregated column, because Postgres requires it —
            // SQLite would accept grouping by the id alone.
            .add_group_by([
                Expr::col((Alias::new("u"), Users::XataId)).into(),
                Expr::col((Alias::new("u"), Users::Did)).into(),
                Expr::col((Alias::new("u"), Users::Handle)).into(),
                Expr::col((Alias::new("u"), Users::DisplayName)).into(),
                Expr::col((Alias::new("u"), Users::Avatar)).into(),
            ])
            // Most recent listener first, then by id so the page is stable.
            .order_by_expr(
                Func::max(Expr::col((Alias::new("s"), Scrobbles::Timestamp))).into(),
                Order::Desc,
            )
            .order_by((Alias::new("u"), Users::XataId), Order::Asc)
            .limit(limit as u64)
            .offset(offset as u64);

        type Row = (String, String, String, Option<String>, String, i64);
        let rows: Vec<Row> = db.fetch_all(&query).await?;

        Ok::<_, anyhow::Error>(
            rows.into_iter()
                .enumerate()
                .map(|(index, (id, did, handle, display_name, avatar, plays))| {
                    super::artist::ListenerView {
                        id,
                        did,
                        handle,
                        display_name,
                        avatar,
                        // There is only one song here, so "the song they
                        // played most" is this song — the field carries no
                        // information and is left absent.
                        most_listened_song: None,
                        total_plays: plays,
                        rank: offset + index as i64 + 1,
                    }
                })
                .collect(),
        )
    }
    .await;

    match result {
        Ok(listeners) => json(RecentListenersOutput { listeners }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving song listeners");
            json(RecentListenersOutput::default())
        }
    }
}

// --------------------------------------------------------------- matchSong

/// How long a resolved match is cached. A day, as `apps/api` does.
const MATCH_CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

/// Most candidate rows one lookup will consider.
///
/// A common title by a prolific artist matches a great many rows once the
/// album join fans them out, and all of them would be read only to pick one.
const CANDIDATE_LIMIT: u64 = 200;

/// Which identifier a candidate matched on. Lower is a stronger claim.
const TIER_HASH: i64 = 0;
const TIER_MBID: i64 = 1;
const TIER_ISRC: i64 = 2;
const TIER_TITLE_ARTIST: i64 = 3;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchSongParams {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub mb_id: Option<String>,
    #[serde(default)]
    pub isrc: Option<String>,
}

/// A validated `matchSong` request.
#[derive(Debug, Clone)]
pub struct MatchQuery {
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub mb_id: Option<String>,
    pub isrc: Option<String>,
}

impl MatchQuery {
    fn from_params(params: MatchSongParams) -> Result<Self, XrpcError> {
        Ok(Self {
            title: required(&params.title, "title")?,
            artist: required(&params.artist, "artist")?,
            album: present(&params.album),
            mb_id: present(&params.mb_id),
            isrc: present(&params.isrc),
        })
    }

    /// The content hash this request describes, which needs an album.
    fn content_hash(&self) -> Option<String> {
        self.album
            .as_deref()
            .map(|album| track_hash(&self.title, &self.artist, album))
    }

    /// The cache key, mirroring `apps/api`'s `getCacheKey`.
    ///
    /// The album is part of the key because it is part of the answer: the same
    /// title/artist — or even the same ISRC — resolves to different editions
    /// per requested album.
    fn cache_key(&self) -> String {
        let album = self
            .album
            .as_deref()
            .map(|album| format!(":album:{}", album.to_lowercase()))
            .unwrap_or_default();

        match (&self.mb_id, &self.isrc) {
            (Some(mb_id), _) => format!("matchSong:mbId:{mb_id}{album}"),
            (None, Some(isrc)) => format!("matchSong:isrc:{isrc}{album}"),
            (None, None) => format!(
                "matchSong:{}:{}{album}",
                self.title.to_lowercase(),
                self.artist.to_lowercase()
            ),
        }
    }
}

/// A MusicBrainz artist credit.
///
/// Always absent here: resolving one needs the MusicBrainz proxy, which this
/// binary has no client for. The field is kept so the response shape still
/// matches what `apps/api` answers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MbArtistView {
    pub mbid: Option<String>,
    pub name: String,
}

/// What `matchSong` answers: the resolved track, flattened, plus the album and
/// artist detail the caller would otherwise have to fetch separately.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedSongView {
    #[serde(flatten)]
    pub track: crate::views::TrackView,
    pub release_date: Option<String>,
    pub year: Option<i64>,
    pub artist_picture: Option<String>,
    pub genres: Option<Vec<String>>,
    pub mb_artists: Option<Vec<MbArtistView>>,
    /// Candidate matches from the external metadata providers. Always empty
    /// here — see the note on [`MbArtistView`] — but always an array, which is
    /// what the UI iterates.
    pub matches: Vec<crate::lexicon::app::rocksky::song::defs::SongMatchView>,
    pub play_count: i64,
    pub unique_listeners: i64,
}

/// One row of the candidate lookup: a track, the tier it matched on, and the
/// albums it belongs to.
#[derive(Debug, Clone)]
struct Candidate {
    track_id: String,
    tier: i64,
    track_album: String,
    album_title: Option<String>,
}

impl Candidate {
    /// The album title to judge this candidate by.
    fn album_name(&self) -> Option<&str> {
        Some(self.track_album.as_str())
            .filter(|album| !album.is_empty())
            .or(self.album_title.as_deref())
    }

    fn is_from(&self, wanted_lowercase: &str) -> bool {
        self.track_album.to_lowercase() == wanted_lowercase
            || self
                .album_title
                .as_deref()
                .is_some_and(|title| title.to_lowercase() == wanted_lowercase)
    }
}

/// The ranked candidate lookup.
///
/// One statement rather than `apps/api`'s three sequential queries, with the
/// identifier that matched carried out as `tier` so the album filter can still
/// be applied one tier at a time.
fn candidate_query(db: &Backend, query: &MatchQuery) -> SelectStatement {
    let track = |column| Expr::col((Alias::new("t"), column));
    let lower = |column| Expr::expr(Func::lower(track(column)));

    // Tiers in ascending order of strength; the `CASE` below relies on it.
    let mut tiers: Vec<(i64, SimpleExpr)> = Vec::new();
    if let Some(hash) = query.content_hash() {
        tiers.push((TIER_HASH, track(Tracks::Sha256).eq(hash)));
    }
    if let Some(mb_id) = &query.mb_id {
        tiers.push((TIER_MBID, track(Tracks::MbId).eq(mb_id.clone())));
    }
    if let Some(isrc) = &query.isrc {
        tiers.push((TIER_ISRC, track(Tracks::Isrc).eq(isrc.clone())));
    }
    tiers.push((
        TIER_TITLE_ARTIST,
        lower(Tracks::Title).eq(query.title.to_lowercase()).and(
            lower(Tracks::Artist)
                .eq(query.artist.to_lowercase())
                .or(lower(Tracks::AlbumArtist).eq(query.artist.to_lowercase())),
        ),
    ));

    let matched = tiers
        .iter()
        .cloned()
        .map(|(_, condition)| condition)
        .reduce(|left, right| left.or(right))
        // There is always the title/artist tier.
        .expect("at least one tier");

    let mut rank = CaseStatement::new();
    for (tier, condition) in tiers {
        rank = rank.case(condition, tier);
    }
    // Unreachable given the `WHERE`, but a `CASE` needs an else branch.
    let rank = rank.finally(TIER_TITLE_ARTIST + 1);

    let mut select = Query::select();
    select
        .expr_as(track(Tracks::XataId), Alias::new("track_id"))
        .expr_as(db.cast_int(rank), Alias::new("tier"))
        .expr_as(track(Tracks::Album), Alias::new("track_album"))
        .expr_as(
            Expr::col((Alias::new("al"), Albums::Title)),
            Alias::new("album_title"),
        )
        .from_as(Tracks::Table, Alias::new("t"))
        .join_as(
            JoinType::LeftJoin,
            AlbumTracks::Table,
            Alias::new("at"),
            Expr::col((Alias::new("at"), AlbumTracks::TrackId))
                .equals((Alias::new("t"), Tracks::XataId)),
        )
        .join_as(
            JoinType::LeftJoin,
            Albums::Table,
            Alias::new("al"),
            Expr::col((Alias::new("al"), Albums::XataId))
                .equals((Alias::new("at"), AlbumTracks::AlbumId)),
        )
        .and_where(matched)
        .order_by(Alias::new("tier"), Order::Asc)
        // Ties are broken by id so the answer does not depend on the planner.
        .order_by((Alias::new("t"), Tracks::XataId), Order::Asc)
        .limit(CANDIDATE_LIMIT);

    select
}

/// Alternate-edition markers in an album title.
///
/// A preference signal, never a filter: an album legitimately named with one
/// of these words ("Live Through This") only loses to a marker-free candidate
/// for the same track, which is the case the ranking is for.
const EDITION_MARKERS: &[&str] = &[
    "remaster",
    "remastered",
    "live",
    "deluxe",
    "single",
    "demo",
    "acoustic",
    "instrumental",
    "karaoke",
    "anniversary",
    "expanded",
    "edition",
    "remix",
    "remixes",
    "mono",
    "stereo",
    "reissue",
    "bside",
    "bsides",
];

/// Whether an album title carries an edition marker as a whole word.
///
/// Hyphens are dropped inside a word so "re-issue" and "b-sides" read as the
/// markers they are, which is what `apps/api`'s `re-?issue` alternatives do.
fn has_edition_marker(album: &str) -> bool {
    album
        .split(|c: char| !c.is_alphanumeric() && c != '-')
        .map(|word| word.replace('-', "").to_lowercase())
        .any(|word| EDITION_MARKERS.contains(&word.as_str()))
}

/// Ranks how canonical a release looks: a plain studio album beats singles,
/// compilations and remaster/live/deluxe editions.
///
/// `album_type` is a provider's own classification ("album", "single",
/// "compilation") where there is one; catalogue rows only have the title to go
/// on.
fn canonical_score(album_name: Option<&str>, album_type: Option<&str>) -> i64 {
    let mut score = 0;
    match album_type {
        Some("album") => score += 2,
        Some(_) => score -= 1,
        None => {}
    }
    if album_name.is_some_and(has_edition_marker) {
        score -= 2;
    }
    score
}

/// The most canonical-looking candidate. Ties keep the first occurrence, which
/// the query has already ordered deterministically.
fn most_canonical<'a>(rows: &[&'a Candidate]) -> Option<&'a Candidate> {
    rows.iter()
        .copied()
        .fold(None, |best: Option<(&Candidate, i64)>, row| {
            let score = canonical_score(row.album_name(), None);
            match best {
                Some((_, best_score)) if best_score >= score => best,
                _ => Some((row, score)),
            }
        })
        .map(|(row, _)| row)
}

/// Which candidate answers the request.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Pick {
    track_id: String,
    /// True when no row came from the requested album and the filter was
    /// relaxed to answer at all.
    degraded: bool,
}

/// Applies the album filter tier by tier.
///
/// A stronger tier with no row from the requested album does not win, so the
/// weaker tiers still get their chance — but the row it would have returned is
/// remembered, because degrading to it beats answering "no such song" when
/// every tier's album is spelled differently from the caller's.
fn pick_candidate(rows: &[Candidate], album: Option<&str>) -> Option<Pick> {
    let wanted = album.map(str::to_lowercase);
    let mut relaxed: Option<&Candidate> = None;

    for tier in TIER_HASH..=TIER_TITLE_ARTIST {
        let in_tier: Vec<&Candidate> = rows.iter().filter(|row| row.tier == tier).collect();
        if in_tier.is_empty() {
            continue;
        }

        match &wanted {
            None => {
                if let Some(row) = most_canonical(&in_tier) {
                    return Some(Pick {
                        track_id: row.track_id.clone(),
                        degraded: false,
                    });
                }
            }
            Some(wanted) => {
                if let Some(row) = in_tier.iter().find(|row| row.is_from(wanted)) {
                    return Some(Pick {
                        track_id: row.track_id.clone(),
                        degraded: false,
                    });
                }
                if relaxed.is_none() {
                    relaxed = most_canonical(&in_tier);
                }
            }
        }
    }

    relaxed.map(|row| Pick {
        track_id: row.track_id.clone(),
        degraded: true,
    })
}

/// `app.rocksky.song.matchSong`
async fn match_song(
    state: web::Data<AppState>,
    params: web::Query<MatchSongParams>,
) -> XrpcResult<HttpResponse> {
    let query = MatchQuery::from_params(params.into_inner())?;
    let key = query.cache_key();

    if let Some(cached) = state.cache().get_json::<MatchedSongView>(&key).await {
        return json(cached);
    }

    match resolve(state.db(), &query).await {
        Ok(Some(view)) => {
            state.cache().set_json(&key, MATCH_CACHE_TTL, &view).await;
            json(view)
        }
        // No match is an empty body, not an error: the caller asked what this
        // song is and the answer is "nothing here yet".
        Ok(None) => json(serde_json::json!({})),
        Err(err) => {
            tracing::error!(
                error = ?err,
                title = %query.title,
                artist = %query.artist,
                "error matching a song"
            );
            json(serde_json::json!({}))
        }
    }
}

/// Runs the ranked lookup and the album filter over its result.
async fn find_candidate(db: &Backend, query: &MatchQuery) -> Result<Option<Pick>, sqlx::Error> {
    type Row = (String, i64, String, Option<String>);
    let rows: Vec<Candidate> = db
        .fetch_all::<Row>(&candidate_query(db, query))
        .await?
        .into_iter()
        .map(|(track_id, tier, track_album, album_title)| Candidate {
            track_id,
            tier,
            track_album,
            album_title,
        })
        .collect();

    Ok(pick_candidate(&rows, query.album.as_deref()))
}

async fn resolve(db: &Backend, query: &MatchQuery) -> anyhow::Result<Option<MatchedSongView>> {
    let Some(pick) = find_candidate(db, query).await? else {
        return Ok(None);
    };
    if pick.degraded {
        tracing::debug!(
            album = query.album.as_deref().unwrap_or_default(),
            title = %query.title,
            "no candidate from the requested album; relaxed the filter"
        );
    }

    let Some(track) = track_by_id(db, &pick.track_id).await? else {
        return Ok(None);
    };
    let album = album_of(db, &track).await?;
    let artist = artist_of(db, &track.album_artist).await?;
    // From the scrobbles rather than `user_tracks`, which is what every other
    // total in this appview counts, so two endpoints cannot disagree about how
    // many people have played one song.
    let totals = ranking::totals_for(db, "track_id", &track.id).await?;

    Ok(Some(MatchedSongView {
        track: crate::views::TrackView::from(&track),
        release_date: album.as_ref().and_then(|album| album.release_date.clone()),
        year: album.as_ref().and_then(|album| album.year),
        artist_picture: artist.as_ref().and_then(|artist| artist.picture.clone()),
        genres: artist.as_ref().map(Artist::genres),
        mb_artists: None,
        matches: Vec::new(),
        play_count: totals.play_count,
        unique_listeners: totals.unique_listeners,
    }))
}

async fn track_by_id(db: &Backend, id: &str) -> Result<Option<Track>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, None);
    query
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::XataId).eq(id))
        .limit(1);

    db.fetch_optional::<Track>(&query).await
}

/// The album row a track belongs to, found by content hash.
///
/// By hash rather than through `album_tracks`, because a track can be joined
/// to more than one album row and the hash names exactly the one its own
/// `album`/`albumArtist` describe.
async fn album_of(db: &Backend, track: &Track) -> Result<Option<Album>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, ALBUM_COLS, None);
    query
        .from(Albums::Table)
        .and_where(Expr::col(Albums::Sha256).eq(album_hash(&track.album, &track.album_artist)))
        .limit(1);

    db.fetch_optional::<Album>(&query).await
}

async fn artist_of(db: &Backend, album_artist: &str) -> Result<Option<Artist>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, ARTIST_COLS, None);
    query
        .from(Artists::Table)
        .and_where(Expr::col(Artists::Sha256).eq(artist_hash(album_artist)))
        .limit(1);

    db.fetch_optional::<Artist>(&query).await
}

// -------------------------------------------------------------- createSong

/// The lexicon's input, plus the fields `apps/api`'s own schema accepts beyond
/// it — a client already sending them keeps working.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSongInput {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    #[serde(default)]
    pub duration: Option<i64>,
    #[serde(default)]
    pub mb_id: Option<String>,
    #[serde(default)]
    pub isrc: Option<String>,
    #[serde(default)]
    pub album_art: Option<String>,
    #[serde(default)]
    pub track_number: Option<i64>,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub year: Option<i64>,
    #[serde(default)]
    pub disc_number: Option<i64>,
    #[serde(default)]
    pub lyrics: Option<String>,
    #[serde(default)]
    pub composer: Option<String>,
    #[serde(default)]
    pub copyright_message: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub artist_picture: Option<String>,
    #[serde(default)]
    pub spotify_link: Option<String>,
}

/// `app.rocksky.song.createSong`
async fn create_song(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<CreateSongInput>,
) -> XrpcResult<HttpResponse> {
    let input = body.into_inner();
    // Not a column on any row this writes — only the artist record carries it.
    let artist_picture = present(&input.artist_picture);
    let song = song_from_input(input)?;
    let db = state.db();

    let track_id = crate::ingest::upsert_catalogue(db, &song)
        .await
        .map_err(XrpcError::internal)?;

    // The track, its album and its artist, so a brand-new song is findable
    // immediately rather than after the next restart. This stands in for the
    // `rocksky.track` event `apps/api` publishes, whose only subscriber is its
    // own Typesense indexer.
    crate::search::index_track_tree(&state, &track_id).await;

    publish_records(&state, &auth.did, &song, artist_picture, &track_id).await;

    let Some(track) = track_by_id(db, &track_id).await? else {
        // The row was written a moment ago, so this is a genuine failure
        // rather than a missing song.
        return Err(XrpcError::internal(anyhow::anyhow!(
            "the track row for {track_id} disappeared"
        )));
    };

    tracing::info!(
        did = %auth.did,
        title = %song.title,
        artist = %song.artist,
        "created a song"
    );

    json(crate::views::TrackView::from(&track))
}

/// Validates the input and coerces it into the shape the projection takes.
fn song_from_input(input: CreateSongInput) -> Result<SongRecord, XrpcError> {
    let release_date = present(&input.release_date);
    if let Some(date) = &release_date {
        if !is_iso_date(date) {
            return Err(XrpcError::invalid_request(
                "releaseDate must be formatted as YYYY-MM-DD",
            ));
        }
    }

    Ok(SongRecord {
        title: canonical(&required(&input.title, "title")?),
        artist: canonical(&required(&input.artist, "artist")?),
        album: canonical(&required(&input.album, "album")?),
        album_artist: canonical(&required(&input.album_artist, "albumArtist")?),
        duration: input.duration.unwrap_or(0),
        created_at: chrono::Utc::now(),
        // Album art is optional, but a NULL cover renders as a broken image
        // everywhere downstream, so the placeholder is substituted here —
        // before both the row and the record, so the two agree.
        album_art: Some(
            present(&input.album_art).unwrap_or_else(|| PLACEHOLDER_ALBUM_ART.to_string()),
        ),
        track_number: input.track_number,
        // Zero is not a disc; a single-disc release is disc 1.
        disc_number: Some(input.disc_number.filter(|disc| *disc > 0).unwrap_or(1)),
        year: input.year,
        release_date,
        genre: present(&input.genre),
        composer: present(&input.composer),
        lyrics: present(&input.lyrics),
        copyright_message: present(&input.copyright_message),
        label: present(&input.label),
        mb_id: present(&input.mb_id),
        isrc: present(&input.isrc),
        spotify_link: present(&input.spotify_link),
        youtube_link: None,
        tidal_link: None,
        apple_music_link: None,
    })
}

/// The record shape the song, album and artist writes are built from.
fn track_record(song: &SongRecord, artist_picture: Option<String>) -> records::TrackRecord {
    records::TrackRecord {
        title: song.title.clone(),
        artist: song.artist.clone(),
        album: song.album.clone(),
        album_artist: song.album_artist.clone(),
        duration: song.duration,
        track_number: song.track_number,
        disc_number: song.disc_number,
        year: song.year,
        release_date: song.release_date.clone(),
        album_art: song.album_art.clone(),
        genre: song.genre.clone(),
        tags: Vec::new(),
        composer: song.composer.clone(),
        lyrics: song.lyrics.clone(),
        copyright_message: song.copyright_message.clone(),
        label: song.label.clone(),
        mb_id: song.mb_id.clone(),
        isrc: song.isrc.clone(),
        spotify_link: song.spotify_link.clone(),
        artist_picture,
    }
}

/// Publishes the song, album and artist records and backfills their URIs.
///
/// Best effort: an account with no usable PDS session, or a PDS that refuses
/// the write, leaves local rows that a later re-publish or a firehose ingest
/// can still fill in. Refusing the request instead would lose the song over
/// something the caller cannot fix.
async fn publish_records(
    state: &AppState,
    did: &str,
    song: &SongRecord,
    artist_picture: Option<String>,
    track_id: &str,
) {
    let writer = match Writer::for_did(state, did).await {
        Ok(writer) => writer,
        Err(err) => {
            tracing::info!(did, error = %err, "cannot publish; the song is local only");
            return;
        }
    };

    let db = state.db();
    // A URI is only reusable if it points into *this* repo: an album row is
    // shared between users, so the one on it may be someone else's record.
    let mine = |uri: Option<String>| uri.filter(|uri| uri.starts_with(&format!("at://{did}/")));
    let known_album = mine(crate::ingest::album_uri(db, song).await.ok().flatten());
    let known_artist = mine(
        crate::ingest::artist_uri(db, &song.album_artist)
            .await
            .ok()
            .flatten(),
    );

    let record = track_record(song, artist_picture);
    let created_at = crate::views::timestamp::to_iso8601(&song.created_at);

    match writer
        .create(
            crate::ingest::SONG_NSID,
            &records::next_tid(),
            &records::song_record(&record, &created_at),
        )
        .await
    {
        Ok(written) => {
            let _ = crate::ingest::set_record_uri(
                db,
                crate::ingest::UriTable::Tracks,
                track_id,
                &written.uri,
            )
            .await;
        }
        Err(err) => tracing::warn!(did, error = %err, "could not publish the song record"),
    }

    if known_album.is_none() {
        match writer
            .create(
                crate::ingest::ALBUM_NSID,
                &records::next_tid(),
                &records::album_record(&record, &created_at),
            )
            .await
        {
            Ok(written) => {
                let _ = crate::ingest::set_album_uri(db, song, &written.uri).await;
            }
            Err(err) => tracing::warn!(did, error = %err, "could not publish the album record"),
        }
    }

    if known_artist.is_none() {
        match writer
            .create(
                crate::ingest::ARTIST_NSID,
                &records::next_tid(),
                &records::artist_record(&record, &created_at),
            )
            .await
        {
            Ok(written) => {
                let _ = crate::ingest::set_artist_uri(db, &song.album_artist, &written.uri).await;
            }
            Err(err) => tracing::warn!(did, error = %err, "could not publish the artist record"),
        }
    }
}

// ------------------------------------------------------------------ shared

fn required(value: &Option<String>, field: &str) -> Result<String, XrpcError> {
    present(value).ok_or_else(|| XrpcError::invalid_request(format!("{field} is required")))
}

/// Trims, and treats blank as absent.
fn present(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

/// Canonicalizes a free-text field the content hashes are computed from.
///
/// The curly apostrophe (U+2019) becomes the ASCII one so "Guns N’ Roses" and
/// "Guns N' Roses" hash to one artist instead of two. `apps/api`'s input
/// schema and `crates/mirror` both do this, and disagreeing with them would
/// split the catalogue.
fn canonical(text: &str) -> String {
    text.trim().replace('\u{2019}', "'")
}

fn is_iso_date(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;
    // `actix_web::test` shadows the built-in `#[test]` attribute, and both are
    // needed here.
    use actix_web::test as http;
    use actix_web::App;

    /// A macro rather than a function so the test service's request type,
    /// which comes from a crate this one does not depend on directly, never
    /// has to be named.
    macro_rules! app {
        ($state:expr) => {
            http::init_service(
                App::new()
                    // Twice: the auth extractor reads the bare `AppState` out
                    // of app data, the handlers take `web::Data`.
                    .app_data($state.clone())
                    .app_data(web::Data::new($state.clone()))
                    .configure(configure),
            )
            .await
        };
    }

    async fn signed_in() -> (AppState, String) {
        let state = AppState::for_test().await.unwrap();
        let token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:alice").unwrap();
        (state, token)
    }

    fn a_song(title: &str, artist: &str, album: &str) -> SongRecord {
        SongRecord {
            title: title.into(),
            artist: artist.into(),
            album: album.into(),
            album_artist: artist.into(),
            duration: 200_000,
            created_at: chrono::Utc::now(),
            album_art: Some("https://example.invalid/cover.png".into()),
            track_number: Some(1),
            disc_number: Some(1),
            year: Some(2004),
            release_date: Some("2004-05-10".into()),
            genre: None,
            composer: None,
            lyrics: None,
            copyright_message: None,
            label: None,
            mb_id: None,
            isrc: None,
            spotify_link: None,
            youtube_link: None,
            tidal_link: None,
            apple_music_link: None,
        }
    }

    fn query(title: &str, artist: &str) -> MatchQuery {
        MatchQuery {
            title: title.into(),
            artist: artist.into(),
            album: None,
            mb_id: None,
            isrc: None,
        }
    }

    async fn rows_in(db: &Backend, table: &str) -> i64 {
        let query = Query::select()
            .expr(Func::count(Expr::col(Alias::new("xata_id"))))
            .from(Alias::new(table))
            .take();
        db.count(&query).await.unwrap()
    }

    async fn track_row(db: &Backend, id: &str) -> Track {
        track_by_id(db, id).await.unwrap().expect("the track row")
    }

    // -------------------------------------------------------- matchSong

    /// The three identifiers are a ranking, not an `OR`: each one must win
    /// over the weaker ones even when all three match a different row.
    #[tokio::test]
    async fn the_lookup_ranks_the_hash_then_the_mbid_then_the_isrc() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let mut exact = a_song(
            "Roygbiv",
            "Boards of Canada",
            "Music Has the Right to Children",
        );
        exact.mb_id = Some("mb-exact".into());
        let by_hash = crate::ingest::upsert_catalogue(&db, &exact).await.unwrap();

        let mut session = a_song("Roygbiv", "Boards of Canada", "Peel Session");
        session.mb_id = Some("mb-session".into());
        session.isrc = Some("isrc-session".into());
        let by_mbid = crate::ingest::upsert_catalogue(&db, &session)
            .await
            .unwrap();

        let mut compilation = a_song("Roygbiv (Edit)", "Various Artists", "A Compilation");
        compilation.isrc = Some("isrc-comp".into());
        let by_isrc = crate::ingest::upsert_catalogue(&db, &compilation)
            .await
            .unwrap();
        assert_ne!(by_hash, by_mbid);
        assert_ne!(by_mbid, by_isrc);

        // The content hash outranks both identifiers.
        let mut with_everything = query("Roygbiv", "Boards of Canada");
        with_everything.album = Some("Music Has the Right to Children".into());
        with_everything.mb_id = Some("mb-session".into());
        with_everything.isrc = Some("isrc-comp".into());
        assert_eq!(
            find_candidate(&db, &with_everything).await.unwrap(),
            Some(Pick {
                track_id: by_hash.clone(),
                degraded: false
            })
        );

        // Without an album there is no hash to compute, so the MBID wins —
        // over the ISRC and over the title/artist match on `by_hash`.
        let mut with_mbid = query("Roygbiv", "Boards of Canada");
        with_mbid.mb_id = Some("mb-session".into());
        with_mbid.isrc = Some("isrc-comp".into());
        assert_eq!(
            find_candidate(&db, &with_mbid).await.unwrap(),
            Some(Pick {
                track_id: by_mbid.clone(),
                degraded: false
            })
        );

        // And the ISRC wins over the title/artist match, which would otherwise
        // return one of the two Boards of Canada rows.
        let mut with_isrc = query("Roygbiv", "Boards of Canada");
        with_isrc.isrc = Some("isrc-comp".into());
        assert_eq!(
            find_candidate(&db, &with_isrc).await.unwrap(),
            Some(Pick {
                track_id: by_isrc,
                degraded: false
            })
        );

        // With neither identifier, the title and artist still resolve.
        let picked = find_candidate(&db, &query("Roygbiv", "Boards of Canada"))
            .await
            .unwrap()
            .expect("title and artist match");
        assert!(picked.track_id == by_hash || picked.track_id == by_mbid);
        assert!(!picked.degraded);
    }

    /// The album narrows the answer, and a filter that matches nothing
    /// degrades to the most canonical row rather than to no match.
    #[tokio::test]
    async fn the_album_filter_narrows_and_then_degrades() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let mut plain = a_song("Somewhere Only We Know", "Keane", "Hopes and Fears");
        plain.isrc = Some("isrc-9".into());
        let plain_id = crate::ingest::upsert_catalogue(&db, &plain).await.unwrap();

        let mut deluxe = a_song(
            "Somewhere Only We Know",
            "Keane",
            "Hopes and Fears (Deluxe Edition)",
        );
        deluxe.isrc = Some("isrc-9".into());
        let deluxe_id = crate::ingest::upsert_catalogue(&db, &deluxe).await.unwrap();

        let of = |album: &str| MatchQuery {
            title: "Somewhere Only We Know".into(),
            artist: "Keane".into(),
            album: Some(album.into()),
            mb_id: None,
            isrc: Some("isrc-9".into()),
        };

        // The requested edition wins even though it is the less canonical one.
        assert_eq!(
            find_candidate(&db, &of("Hopes and Fears (Deluxe Edition)"))
                .await
                .unwrap(),
            Some(Pick {
                track_id: deluxe_id,
                degraded: false
            })
        );

        // Case-insensitively, as `apps/api` compares.
        assert_eq!(
            find_candidate(&db, &of("HOPES AND FEARS")).await.unwrap(),
            Some(Pick {
                track_id: plain_id.clone(),
                degraded: false
            })
        );

        // An edition nobody has: still the right song, and flagged as relaxed.
        assert_eq!(
            find_candidate(&db, &of("Hopes and Fears (Japanese Edition)"))
                .await
                .unwrap(),
            Some(Pick {
                track_id: plain_id,
                degraded: true
            })
        );
    }

    /// Nothing resembling the request is an empty answer, not a degraded one.
    #[tokio::test]
    async fn an_unknown_song_matches_nothing() {
        let db = crate::db::connect_in_memory().await.unwrap();
        crate::ingest::upsert_catalogue(&db, &a_song("Roygbiv", "Boards of Canada", "MHTRTC"))
            .await
            .unwrap();

        assert_eq!(
            find_candidate(&db, &query("A Song Nobody Wrote", "Nobody"))
                .await
                .unwrap(),
            None
        );
    }

    #[test]
    fn a_plain_album_outranks_an_alternate_edition() {
        assert!(has_edition_marker("Hopes and Fears (Deluxe Edition)"));
        assert!(has_edition_marker("Nevermind - Remastered"));
        assert!(has_edition_marker("MTV Unplugged [Live]"));
        assert!(has_edition_marker("B-Sides"));
        assert!(has_edition_marker("The Re-Issue"));
        // A marker as part of a longer word is not a marker.
        assert!(!has_edition_marker("Hopes and Fears"));
        assert!(!has_edition_marker("Liverpool"));
        assert!(!has_edition_marker("Singles Collection 2"));

        assert!(
            canonical_score(Some("Hopes and Fears"), None)
                > canonical_score(Some("Hopes and Fears (Deluxe Edition)"), None)
        );
        // A provider that says which kind of release this is: an album beats a
        // single, and both beat a marked-up edition.
        assert!(
            canonical_score(Some("X"), Some("album")) > canonical_score(Some("X"), Some("single"))
        );
        assert_eq!(canonical_score(None, None), 0);
    }

    /// The whole handler, so the joins, the `CASE` and the totals actually
    /// run rather than only compile.
    #[actix_web::test]
    async fn matching_a_song_answers_the_catalogue_row() {
        let state = AppState::for_test().await.unwrap();
        crate::ingest::ingest(
            state.db(),
            &crate::ingest::IncomingRecord {
                did: "did:plc:alice".into(),
                collection: crate::ingest::SCROBBLE_NSID.into(),
                rkey: "3k2a".into(),
                value: serde_json::json!({
                    "title": "Roygbiv",
                    "artist": "Boards of Canada",
                    "album": "Music Has the Right to Children",
                    "albumArtist": "Boards of Canada",
                    "duration": 151_000,
                    "year": 1998,
                    "releaseDate": "1998-04-20",
                    "albumArtUrl": "https://example.invalid/mhtrtc.png",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                }),
            },
        )
        .await
        .unwrap();

        let app = app!(state);
        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri(
                    "/xrpc/app.rocksky.song.matchSong?title=roygbiv\
                     &artist=boards%20of%20canada\
                     &album=music%20has%20the%20right%20to%20children",
                )
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["title"], "Roygbiv");
        assert_eq!(body["album"], "Music Has the Right to Children");
        assert_eq!(
            body["sha256"],
            track_hash(
                "Roygbiv",
                "Boards of Canada",
                "Music Has the Right to Children"
            )
        );
        // The album and artist detail the joins are there for.
        assert_eq!(body["year"], 1998);
        assert_eq!(body["releaseDate"], "1998-04-20");
        // One listen, from one person.
        assert_eq!(body["playCount"], 1);
        assert_eq!(body["uniqueListeners"], 1);
        // Always an array, even with no provider to fill it.
        assert_eq!(body["matches"], serde_json::json!([]));

        // The same question again comes from the cache, which means the view
        // has to survive a JSON round trip — a flattened track with its own
        // timestamp format does not do that for free.
        let again = http::call_service(
            &app,
            http::TestRequest::get()
                .uri(
                    "/xrpc/app.rocksky.song.matchSong?title=roygbiv\
                     &artist=boards%20of%20canada\
                     &album=music%20has%20the%20right%20to%20children",
                )
                .to_request(),
        )
        .await;
        assert_eq!(again.status(), 200);
        let cached: serde_json::Value = http::read_body_json(again).await;
        assert_eq!(cached, body);
    }

    #[actix_web::test]
    async fn matching_an_unknown_song_answers_an_empty_body() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.song.matchSong?title=nothing&artist=nobody")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body, serde_json::json!({}));
    }

    #[actix_web::test]
    async fn matching_without_a_title_is_a_bad_request() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.song.matchSong?artist=nobody")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 400);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["error"], "InvalidRequest");
        assert!(body["message"].as_str().unwrap().contains("title"));
    }

    /// The album is part of the answer, so it has to be part of the key.
    #[test]
    fn the_cache_key_follows_the_typescript_one() {
        let mut params = query("Roygbiv", "Boards of Canada");
        assert_eq!(params.cache_key(), "matchSong:roygbiv:boards of canada");

        params.album = Some("Music Has The Right To Children".into());
        assert_eq!(
            params.cache_key(),
            "matchSong:roygbiv:boards of canada:album:music has the right to children"
        );

        params.isrc = Some("isrc-1".into());
        assert_eq!(
            params.cache_key(),
            "matchSong:isrc:isrc-1:album:music has the right to children"
        );

        // The MBID is the strongest anchor, so it names the key.
        params.mb_id = Some("mb-1".into());
        assert_eq!(
            params.cache_key(),
            "matchSong:mbId:mb-1:album:music has the right to children"
        );
    }

    // ------------------------------------------------------- createSong

    fn create_body(album_art: Option<&str>) -> serde_json::Value {
        let mut body = serde_json::json!({
            "title": "Roygbiv",
            "artist": "Boards of Canada",
            "album": "Music Has the Right to Children",
            "albumArtist": "Boards of Canada",
            "duration": 151_000,
            "trackNumber": 4,
            "discNumber": 1,
            "year": 1998,
            "releaseDate": "1998-04-20",
        });
        if let Some(art) = album_art {
            body["albumArt"] = serde_json::Value::String(art.to_string());
        }
        body
    }

    /// A macro for the same reason [`app`] is one: the test service's request
    /// type comes from a crate this one does not depend on directly.
    macro_rules! create {
        ($app:expr, $token:expr, $body:expr) => {{
            let res = http::call_service(
                &$app,
                http::TestRequest::post()
                    .uri("/xrpc/app.rocksky.song.createSong")
                    .insert_header(("authorization", format!("Bearer {}", $token)))
                    .set_json($body)
                    .to_request(),
            )
            .await;
            let status = res.status().as_u16();
            let body: serde_json::Value = http::read_body_json(res).await;
            (status, body)
        }};
    }

    /// The catalogue rows appear, and a second identical call reuses them:
    /// identity is the content hash, not the request.
    #[actix_web::test]
    async fn creating_a_song_writes_the_catalogue_and_is_idempotent() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        let (status, body) = create!(
            app,
            token,
            create_body(Some("https://example.invalid/a.png"))
        );
        assert_eq!(status, 200);
        assert_eq!(body["title"], "Roygbiv");
        assert_eq!(
            body["sha256"],
            track_hash(
                "Roygbiv",
                "Boards of Canada",
                "Music Has the Right to Children"
            )
        );
        assert_eq!(body["albumArt"], "https://example.invalid/a.png");
        assert_eq!(body["duration"], 151_000);
        assert_eq!(body["trackNumber"], 4);

        let db = state.db();
        for table in [
            "tracks",
            "albums",
            "artists",
            "album_tracks",
            "artist_tracks",
            "artist_albums",
        ] {
            assert_eq!(rows_in(db, table).await, 1, "one {table} row");
        }

        // The album row carries what the song said about it.
        let album = album_of(db, &track_row(db, body["id"].as_str().unwrap()).await)
            .await
            .unwrap()
            .expect("the album row");
        assert_eq!(album.year, Some(1998));
        assert_eq!(album.release_date.as_deref(), Some("1998-04-20"));

        // Again, with the same song.
        let (status, second) = create!(
            app,
            token,
            create_body(Some("https://example.invalid/a.png"))
        );
        assert_eq!(status, 200);
        assert_eq!(second["id"], body["id"]);
        for table in ["tracks", "albums", "artists", "album_tracks"] {
            assert_eq!(rows_in(db, table).await, 1, "still one {table} row");
        }
    }

    /// Album art is optional, and its absence must not cost the caller the
    /// song — the placeholder stands in, in the row *and* in the record.
    #[actix_web::test]
    async fn a_song_with_no_album_art_gets_the_placeholder() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        let (status, body) = create!(app, token, create_body(None));
        assert_eq!(status, 200);
        assert_eq!(body["albumArt"], PLACEHOLDER_ALBUM_ART);

        let db = state.db();
        let track = track_row(db, body["id"].as_str().unwrap()).await;
        assert_eq!(track.album_art.as_deref(), Some(PLACEHOLDER_ALBUM_ART));

        // And the record that is published carries the same URL, so a row
        // written here and the same record arriving over the firehose agree.
        let song = song_from_input(serde_json::from_value(create_body(None)).unwrap()).unwrap();
        let record = records::song_record(&track_record(&song, None), "2026-01-01T00:00:00.000Z");
        assert_eq!(record["albumArtUrl"], PLACEHOLDER_ALBUM_ART);
        assert_eq!(record["$type"], "app.rocksky.song");
    }

    #[actix_web::test]
    async fn creating_a_song_requires_authentication() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res = http::call_service(
            &app,
            http::TestRequest::post()
                .uri("/xrpc/app.rocksky.song.createSong")
                .set_json(create_body(None))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
    }

    #[actix_web::test]
    async fn the_required_fields_are_enforced() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        let mut body = create_body(None);
        body["title"] = serde_json::Value::String("   ".into());
        let (status, error) = create!(app, token, body);
        assert_eq!(status, 400);
        assert!(error["message"].as_str().unwrap().contains("title"));

        // A release date that is not YYYY-MM-DD is refused rather than stored
        // in a shape nothing can read.
        let mut body = create_body(None);
        body["releaseDate"] = serde_json::Value::String("20 April 1998".into());
        let (status, error) = create!(app, token, body);
        assert_eq!(status, 400);
        assert!(error["message"].as_str().unwrap().contains("YYYY-MM-DD"));

        assert_eq!(
            rows_in(state.db(), "tracks").await,
            0,
            "nothing was written"
        );
    }

    /// The hashes are computed from the canonical spelling, so the two ways of
    /// writing an apostrophe cannot split one artist into two.
    #[test]
    fn a_curly_apostrophe_is_canonicalized_before_hashing() {
        let input: CreateSongInput = serde_json::from_value(serde_json::json!({
            "title": "Sweet Child O\u{2019} Mine",
            "artist": " Guns N\u{2019} Roses ",
            "album": "Appetite for Destruction",
            "albumArtist": "Guns N\u{2019} Roses",
        }))
        .unwrap();

        let song = song_from_input(input).unwrap();
        assert_eq!(song.artist, "Guns N' Roses");
        assert_eq!(song.title, "Sweet Child O' Mine");
        assert_eq!(
            track_hash(&song.title, &song.artist, &song.album),
            track_hash(
                "Sweet Child O' Mine",
                "Guns N' Roses",
                "Appetite for Destruction"
            )
        );
        // Duration is optional in the lexicon, so its absence is zero rather
        // than a rejection.
        assert_eq!(song.duration, 0);
        assert_eq!(song.disc_number, Some(1));
    }

    #[test]
    fn a_zero_disc_number_becomes_disc_one() {
        let mut body = create_body(None);
        body["discNumber"] = serde_json::json!(0);
        let song = song_from_input(serde_json::from_value(body).unwrap()).unwrap();
        assert_eq!(song.disc_number, Some(1));
    }
}
