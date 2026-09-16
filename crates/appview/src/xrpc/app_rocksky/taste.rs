//! `app.rocksky.actor.getActorNeighbours` and `getActorCompatibility` — who
//! listens like you.
//!
//! Both work from the set of artists a person has played, which
//! `user_artists_mv` holds as distinct `(user, artist)` pairs with a play
//! count. "Various Artists" is excluded there, because a compilation credit is
//! not a taste: nearly everyone has it, and including it would make every pair
//! of listeners look similar.
//!
//! # Compatibility is a Jaccard index
//!
//! `shared / (mine + theirs - shared) × 100`. The union in the denominator is
//! the part that matters: dividing by *either* set alone would say a listener
//! with twelve artists is highly compatible with one who has ten thousand,
//! because all twelve are in the larger set. Dividing by the union penalises
//! that asymmetry, which is what makes the number mean something.
//!
//! The level is `min(10, round(percentage / 10))` — a 0–10 bucket for the UI
//! to render as a bar, so it does not have to decide where the thresholds are.
//!
//! # Neighbours rank by raw overlap, not by Jaccard
//!
//! Deliberately different: the neighbours list answers "who else likes this
//! much of what I like", and someone with a huge, overlapping library is a
//! *better* neighbour even though their Jaccard score is diluted. The two
//! questions have different answers and the API asks them separately.

use crate::auth::Auth;
use crate::db::models::{User, USER_COLS};
use crate::db::schema::{Artists, UserArtistsMv, Users};
use crate::db::Backend;
use crate::error::XrpcResult;
use crate::sea_query::{Alias, Asterisk, Expr, Func, JoinType, Order, Query};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.actor.getActorNeighbours", get_neighbours);
    xrpc_query!(
        cfg,
        "app.rocksky.actor.getActorCompatibility",
        get_compatibility
    );
}

/// Neighbours to return by default.
const NEIGHBOURS_DEFAULT_LIMIT: i64 = 50;

/// How many shared artists each neighbour lists.
///
/// Enough for the UI's "you both like …" line. Every extra one is a row in the
/// per-neighbour lookup, so this is a real cost rather than a formality.
const TOP_SHARED: usize = 5;

/// Shared artists named in a compatibility answer.
const TOP_SHARED_COMPATIBILITY: usize = 20;

#[derive(Debug, Clone, Deserialize)]
pub struct ActorParams {
    #[serde(default)]
    pub did: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
}

/// One shared artist, as both endpoints name them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedArtist {
    pub id: String,
    pub name: String,
    pub picture: Option<String>,
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeighbourView {
    pub id: String,
    pub user_id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
    pub shared_artists_count: i64,
    /// Jaccard percentage, so the list can be re-sorted client-side without
    /// another call.
    pub similarity_score: f64,
    pub top_shared_artist_names: Vec<String>,
    pub top_shared_artists_details: Vec<SharedArtist>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct NeighboursOutput {
    pub neighbours: Vec<NeighbourView>,
}

/// `app.rocksky.actor.getActorNeighbours`
async fn get_neighbours(
    state: web::Data<AppState>,
    params: web::Query<ActorParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let Some(did) = params
        .did
        .clone()
        .or_else(|| auth.did().map(str::to_string))
    else {
        return json(NeighboursOutput::default());
    };

    // Lag-tolerant: a neighbour list is a taste summary, not something anyone
    // expects to change with the last scrobble.
    let db = state.db().reads_may_lag();
    match load_neighbours(
        &db,
        &did,
        clamp_limit_or(params.limit, NEIGHBOURS_DEFAULT_LIMIT),
    )
    .await
    {
        Ok(neighbours) => json(NeighboursOutput { neighbours }),
        Err(err) => {
            tracing::error!(error = ?err, did = %did, "error retrieving neighbours");
            json(NeighboursOutput::default())
        }
    }
}

async fn load_neighbours(
    db: &Backend,
    did: &str,
    limit: i64,
) -> anyhow::Result<Vec<NeighbourView>> {
    let Some(subject) = find_user(db, did).await? else {
        return Ok(Vec::new());
    };

    let mine = artist_ids(db, &subject.id).await?;
    if mine.is_empty() {
        // Nobody has listened to anything yet, so there is nothing to compare.
        return Ok(Vec::new());
    }

    // Everyone who shares at least one artist, most overlap first. One query
    // rather than one per candidate: on a busy instance the candidate set is
    // every other user.
    let ranked_query = Query::select()
        .column(UserArtistsMv::UserId)
        .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("shared"))
        .from(UserArtistsMv::Table)
        .and_where(Expr::col(UserArtistsMv::ArtistId).is_in(mine.iter().map(String::as_str)))
        .and_where(Expr::col(UserArtistsMv::UserId).ne(&subject.id))
        .add_group_by([Expr::col(UserArtistsMv::UserId).into()])
        .order_by(Alias::new("shared"), Order::Desc)
        .order_by(UserArtistsMv::UserId, Order::Asc)
        .limit(limit as u64)
        .take();

    let ranked: Vec<(String, i64)> = db.fetch_all(&ranked_query).await?;
    if ranked.is_empty() {
        return Ok(Vec::new());
    }

    // Their profiles, and how many artists each has in total — the latter is
    // the other half of the Jaccard denominator.
    let user_ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    let profiles = crate::db::loaders::users_by_id(db, user_ids.iter().cloned().map(Some)).await?;
    let totals = artist_counts(db, &user_ids).await?;

    let mut neighbours = Vec::with_capacity(ranked.len());
    for (user_id, shared) in &ranked {
        // A neighbour whose profile has gone cannot be rendered.
        let Some(user) = profiles.get(user_id.as_str()) else {
            continue;
        };

        let theirs = totals.get(user_id.as_str()).copied().unwrap_or(0);
        let shared_artists = shared_with(db, &subject.id, user_id, TOP_SHARED).await?;

        neighbours.push(NeighbourView {
            id: user.id.clone(),
            user_id: user.id.clone(),
            did: user.did.clone(),
            handle: user.handle.clone(),
            display_name: user.display_name.clone(),
            avatar: user.avatar.clone(),
            shared_artists_count: *shared,
            similarity_score: jaccard_percentage(mine.len() as i64, theirs, *shared),
            top_shared_artist_names: shared_artists
                .iter()
                .map(|artist| artist.name.clone())
                .collect(),
            top_shared_artists_details: shared_artists,
        });
    }

    Ok(neighbours)
}

// --------------------------------------------------------------- compatibility

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Compatibility {
    /// 0–100.
    pub compatibility_percentage: f64,
    /// 0–10, for a bar the UI does not have to bucket itself.
    pub compatibility_level: i64,
    pub shared_artists_count: i64,
    pub user_artists_count: i64,
    pub other_artists_count: i64,
    pub top_shared_artists: Vec<SharedArtist>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct CompatibilityOutput {
    /// `null` when there is nobody to compare with — an unauthenticated
    /// caller, or a subject with no listening history.
    pub compatibility: Option<Compatibility>,
}

/// `app.rocksky.actor.getActorCompatibility`
///
/// Compares the caller with `did`. Needs both, so an unauthenticated caller
/// gets `{ compatibility: null }` rather than an error — the UI shows the
/// panel only when signed in and asks unconditionally.
async fn get_compatibility(
    state: web::Data<AppState>,
    params: web::Query<ActorParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let (Some(viewer), Some(subject)) = (auth.did(), params.did.as_deref()) else {
        return json(CompatibilityOutput::default());
    };

    if viewer == subject {
        // Comparing someone with themselves is 100% and says nothing.
        return json(CompatibilityOutput::default());
    }

    let db = state.db().reads_may_lag();
    match load_compatibility(&db, viewer, subject).await {
        Ok(compatibility) => json(CompatibilityOutput { compatibility }),
        Err(err) => {
            tracing::error!(error = ?err, subject, "error computing compatibility");
            json(CompatibilityOutput::default())
        }
    }
}

async fn load_compatibility(
    db: &Backend,
    viewer_did: &str,
    subject_did: &str,
) -> anyhow::Result<Option<Compatibility>> {
    let (Some(viewer), Some(subject)) = (
        find_user(db, viewer_did).await?,
        find_user(db, subject_did).await?,
    ) else {
        return Ok(None);
    };

    let mine = artist_ids(db, &viewer.id).await?;
    let theirs = artist_ids(db, &subject.id).await?;
    if mine.is_empty() || theirs.is_empty() {
        // A percentage over an empty set is not zero, it is undefined — so
        // `null` rather than 0%, which would read as "no taste in common".
        return Ok(None);
    }

    let theirs_set: std::collections::HashSet<&String> = theirs.iter().collect();
    let shared: Vec<String> = mine
        .iter()
        .filter(|id| theirs_set.contains(id))
        .cloned()
        .collect();

    let percentage =
        jaccard_percentage(mine.len() as i64, theirs.len() as i64, shared.len() as i64);

    Ok(Some(Compatibility {
        compatibility_percentage: percentage,
        compatibility_level: level_for(percentage),
        shared_artists_count: shared.len() as i64,
        user_artists_count: mine.len() as i64,
        other_artists_count: theirs.len() as i64,
        top_shared_artists: artists_by_id(
            db,
            &shared
                .iter()
                .take(TOP_SHARED_COMPATIBILITY)
                .cloned()
                .collect::<Vec<_>>(),
        )
        .await?,
    }))
}

// ------------------------------------------------------------------- shared

/// `shared / (mine + theirs - shared) × 100`.
///
/// The union is the denominator — see the module note on why dividing by
/// either set alone gives a misleading number.
pub fn jaccard_percentage(mine: i64, theirs: i64, shared: i64) -> f64 {
    let union = mine + theirs - shared;
    if union <= 0 {
        return 0.0;
    }
    (shared as f64 / union as f64) * 100.0
}

/// The 0–10 bucket the UI renders.
pub fn level_for(percentage: f64) -> i64 {
    // Capped at 10: a rounding artefact at 99.6% would otherwise produce 11
    // and overflow a ten-segment bar.
    (percentage / 10.0).round().min(10.0).max(0.0) as i64
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

/// Every artist one person has played.
async fn artist_ids(db: &Backend, user_id: &str) -> Result<Vec<String>, sqlx::Error> {
    let query = Query::select()
        .column(UserArtistsMv::ArtistId)
        .from(UserArtistsMv::Table)
        .and_where(Expr::col(UserArtistsMv::UserId).eq(user_id))
        .take();
    db.fetch_scalars(&query).await
}

/// How many artists each of `user_ids` has played.
async fn artist_counts(
    db: &Backend,
    user_ids: &[String],
) -> Result<std::collections::HashMap<String, i64>, sqlx::Error> {
    if user_ids.is_empty() {
        return Ok(Default::default());
    }

    let query = Query::select()
        .column(UserArtistsMv::UserId)
        .expr(Func::count(Expr::col(Asterisk)))
        .from(UserArtistsMv::Table)
        .and_where(Expr::col(UserArtistsMv::UserId).is_in(user_ids.iter().map(String::as_str)))
        .add_group_by([Expr::col(UserArtistsMv::UserId).into()])
        .take();

    Ok(db
        .fetch_all::<(String, i64)>(&query)
        .await?
        .into_iter()
        .collect())
}

/// The artists two people share, most-played-by-the-subject first.
async fn shared_with(
    db: &Backend,
    subject_id: &str,
    other_id: &str,
    limit: usize,
) -> Result<Vec<SharedArtist>, sqlx::Error> {
    let query = Query::select()
        .expr(Expr::col((Alias::new("a"), Artists::XataId)))
        .expr(Expr::col((Alias::new("a"), Artists::Name)))
        .expr(Expr::col((Alias::new("a"), Artists::Picture)))
        .expr(Expr::col((Alias::new("a"), Artists::Uri)))
        .from_as(UserArtistsMv::Table, Alias::new("mine"))
        .join_as(
            JoinType::InnerJoin,
            UserArtistsMv::Table,
            Alias::new("theirs"),
            Expr::col((Alias::new("theirs"), UserArtistsMv::ArtistId))
                .equals((Alias::new("mine"), UserArtistsMv::ArtistId)),
        )
        .join_as(
            JoinType::InnerJoin,
            Artists::Table,
            Alias::new("a"),
            Expr::col((Alias::new("a"), Artists::XataId))
                .equals((Alias::new("mine"), UserArtistsMv::ArtistId)),
        )
        .and_where(Expr::col((Alias::new("mine"), UserArtistsMv::UserId)).eq(subject_id))
        .and_where(Expr::col((Alias::new("theirs"), UserArtistsMv::UserId)).eq(other_id))
        // Ordered by the subject's own play count, so "you both like …" names
        // the ones *they* care about most.
        .order_by((Alias::new("mine"), UserArtistsMv::PlayCount), Order::Desc)
        .order_by((Alias::new("a"), Artists::Name), Order::Asc)
        .limit(limit as u64)
        .take();

    type Row = (String, String, Option<String>, Option<String>);
    Ok(db
        .fetch_all::<Row>(&query)
        .await?
        .into_iter()
        .map(|(id, name, picture, uri)| SharedArtist {
            id,
            name,
            picture,
            uri,
        })
        .collect())
}

async fn artists_by_id(db: &Backend, ids: &[String]) -> Result<Vec<SharedArtist>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let query = Query::select()
        .columns([
            Artists::XataId,
            Artists::Name,
            Artists::Picture,
            Artists::Uri,
        ])
        .from(Artists::Table)
        .and_where(Expr::col(Artists::XataId).is_in(ids.iter().map(String::as_str)))
        .take();

    type Row = (String, String, Option<String>, Option<String>);
    Ok(db
        .fetch_all::<Row>(&query)
        .await?
        .into_iter()
        .map(|(id, name, picture, uri)| SharedArtist {
            id,
            name,
            picture,
            uri,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Identical taste is 100%, disjoint taste is 0%.
    #[test]
    fn the_extremes_are_what_they_should_be() {
        assert_eq!(jaccard_percentage(10, 10, 10), 100.0);
        assert_eq!(jaccard_percentage(10, 10, 0), 0.0);
    }

    /// The union denominator is the whole point: a small library fully
    /// contained in a huge one must *not* read as highly compatible.
    #[test]
    fn a_contained_set_is_not_highly_compatible() {
        // Twelve artists, all of which the other person also has — out of ten
        // thousand.
        let score = jaccard_percentage(12, 10_000, 12);
        assert!(score < 1.0, "got {score}");

        // Dividing by the smaller set would have said 100%, which is the
        // mistake this guards.
        let naive = 12.0 / 12.0 * 100.0;
        assert!(score < naive);
    }

    #[test]
    fn half_overlap_is_a_third() {
        // 10 and 10 sharing 5: union is 15, so 33%.
        let score = jaccard_percentage(10, 10, 5);
        assert!((score - 33.333).abs() < 0.01, "got {score}");
    }

    /// An empty comparison must not divide by zero.
    #[test]
    fn an_empty_comparison_is_zero_not_a_panic() {
        assert_eq!(jaccard_percentage(0, 0, 0), 0.0);
        assert_eq!(jaccard_percentage(0, 10, 0), 0.0);
    }

    /// The level is a ten-segment bar, so it must never exceed ten — a
    /// rounding artefact near 100% would otherwise overflow it.
    #[test]
    fn the_level_stays_within_its_ten_buckets() {
        assert_eq!(level_for(0.0), 0);
        assert_eq!(level_for(4.0), 0);
        assert_eq!(level_for(5.0), 1);
        assert_eq!(level_for(33.3), 3);
        assert_eq!(level_for(95.0), 10);
        assert_eq!(level_for(99.6), 10);
        assert_eq!(level_for(100.0), 10);

        // And a nonsense input cannot produce a negative segment.
        assert_eq!(level_for(-5.0), 0);
        assert_eq!(level_for(1000.0), 10);
    }

    /// Nothing in common is `null`, not a zero score: "we compared you and
    /// found no overlap" and "there was nothing to compare" are different
    /// answers, and the UI shows different things for them.
    #[test]
    fn an_absent_comparison_is_null() {
        let value = serde_json::to_value(CompatibilityOutput::default()).unwrap();
        assert!(value["compatibility"].is_null(), "{value}");
    }
}
