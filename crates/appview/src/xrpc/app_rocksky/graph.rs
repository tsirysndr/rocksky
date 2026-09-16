//! `app.rocksky.graph.*` — who follows whom.
//!
//! Rocksky's follow graph is its own, separate from Bluesky's: following
//! someone here means seeing their scrobbles, which is not what following them
//! on Bluesky means. The records are `app.rocksky.graph.follow`.
//!
//! # The cursor
//!
//! These page by *time*, not offset: the cursor is the epoch-millisecond
//! timestamp of the last row returned, and the next page is everything older.
//! That matters because the list changes while it is being read — with an
//! offset, someone unfollowing while you page shifts every later row up and
//! you skip one. A timestamp cursor cannot skip.
//!
//! The follow row records DIDs rather than row ids, because the record names
//! its subject by DID and that account may not be indexed here at all. So the
//! joins are on `users.did`, and an unindexed subject simply does not appear —
//! the follow is still recorded, there is just no profile to show.

use crate::atproto::writer::Writer;
use crate::auth::{Auth, AuthDid};
use crate::db::models::{User, USER_COLS};
use crate::db::schema::{Follows, Users};
use crate::db::{format_timestamp, new_id, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Alias, Asterisk, Expr, Func, JoinType, Order, Query};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, json};
use crate::{xrpc_procedure, xrpc_query};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.graph.getFollowers", get_followers);
    xrpc_query!(cfg, "app.rocksky.graph.getFollows", get_follows);
    xrpc_query!(
        cfg,
        "app.rocksky.graph.getKnownFollowers",
        get_known_followers
    );
    xrpc_procedure!(cfg, "app.rocksky.graph.followAccount", follow_account);
    xrpc_procedure!(cfg, "app.rocksky.graph.unfollowAccount", unfollow_account);
}

const FOLLOW_COLLECTION: &str = "app.rocksky.graph.follow";
const GRAPH_DEFAULT_LIMIT: i64 = 50;

/// A profile as the graph lists it.
///
/// Seven fields, matching the live response: enough to render a row, and no
/// counts — a followers list showing each follower's own follower count would
/// be one query per row.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActorView {
    pub id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    #[serde(with = "crate::views::timestamp::required")]
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<&User> for ActorView {
    fn from(user: &User) -> Self {
        Self {
            id: user.id.clone(),
            did: user.did.clone(),
            handle: user.handle.clone(),
            display_name: user.display_name.clone(),
            avatar: user.avatar.clone(),
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphParams {
    #[serde(default)]
    pub actor: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub cursor: Option<String>,
    /// Restricts the answer to these DIDs, which is how the UI asks "do I
    /// follow any of these people?" in one call rather than one per row.
    #[serde(default)]
    pub dids: Option<Vec<String>>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowersOutput {
    /// `{}` when the actor is unknown, which is what the live API answers.
    pub subject: serde_json::Value,
    pub followers: Vec<ActorView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowsOutput {
    pub subject: serde_json::Value,
    pub follows: Vec<ActorView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
}

/// Which side of the `follows` table a query reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Direction {
    /// Accounts following the subject: match `subject_did`, show the follower.
    Followers,
    /// Accounts the subject follows: match `follower_did`, show the subject.
    Follows,
}

impl Direction {
    /// The column naming the subject of the query.
    fn matched(&self) -> Follows {
        match self {
            Self::Followers => Follows::SubjectDid,
            Self::Follows => Follows::FollowerDid,
        }
    }

    /// The column naming the account to return.
    fn returned(&self) -> Follows {
        match self {
            Self::Followers => Follows::FollowerDid,
            Self::Follows => Follows::SubjectDid,
        }
    }
}

/// `app.rocksky.graph.getFollowers`
async fn get_followers(
    state: web::Data<AppState>,
    params: web::Query<GraphParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    match load_edges(state.db(), &params, Direction::Followers).await {
        Ok((subject, actors, cursor, count)) => json(FollowersOutput {
            subject,
            followers: actors,
            cursor,
            count,
        }),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving followers");
            json(FollowersOutput::default())
        }
    }
}

/// `app.rocksky.graph.getFollows`
async fn get_follows(
    state: web::Data<AppState>,
    params: web::Query<GraphParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    match load_edges(state.db(), &params, Direction::Follows).await {
        Ok((subject, actors, cursor, count)) => json(FollowsOutput {
            subject,
            follows: actors,
            cursor,
            count,
        }),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving follows");
            json(FollowsOutput::default())
        }
    }
}

/// `app.rocksky.graph.getKnownFollowers`
///
/// The subject's followers that the *caller* also follows — "you both know
/// these people". Empty for an unauthenticated caller, since there is no "you"
/// to intersect with.
async fn get_known_followers(
    state: web::Data<AppState>,
    params: web::Query<GraphParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(viewer) = auth.did() else {
        return json(FollowersOutput::default());
    };

    let db = state.db();
    let result = async {
        let Some(subject) = find_user(db, params.actor.as_deref().unwrap_or_default()).await?
        else {
            return Ok(FollowersOutput::default());
        };

        // Intersected in SQL rather than by fetching both lists: a popular
        // account's followers are not a set worth pulling into memory.
        let mut query = Query::select();
        db.select_model(&mut query, USER_COLS, Some("u"));
        query
            .from_as(Follows::Table, Alias::new("f"))
            .join_as(
                JoinType::InnerJoin,
                Users::Table,
                Alias::new("u"),
                Expr::col((Alias::new("u"), Users::Did))
                    .equals((Alias::new("f"), Follows::FollowerDid)),
            )
            .and_where(Expr::col((Alias::new("f"), Follows::SubjectDid)).eq(&subject.did))
            .and_where(
                Expr::col((Alias::new("f"), Follows::FollowerDid)).in_subquery(
                    Query::select()
                        .column(Follows::SubjectDid)
                        .from(Follows::Table)
                        .and_where(Expr::col(Follows::FollowerDid).eq(viewer))
                        .take(),
                ),
            )
            .order_by((Alias::new("f"), Follows::XataCreatedat), Order::Desc)
            .limit(clamp_limit_or(params.limit, GRAPH_DEFAULT_LIMIT) as u64);

        let users: Vec<User> = db.fetch_all(&query).await?;
        Ok::<_, anyhow::Error>(FollowersOutput {
            subject: serde_json::to_value(ActorView::from(&subject)).unwrap_or_default(),
            followers: users.iter().map(ActorView::from).collect(),
            cursor: None,
            count: None,
        })
    }
    .await;

    match result {
        Ok(output) => json(output),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving known followers");
            json(FollowersOutput::default())
        }
    }
}

type Edges = (
    serde_json::Value,
    Vec<ActorView>,
    Option<String>,
    Option<i64>,
);

async fn load_edges(
    db: &Backend,
    params: &GraphParams,
    direction: Direction,
) -> anyhow::Result<Edges> {
    let Some(subject) = find_user(db, params.actor.as_deref().unwrap_or_default()).await? else {
        return Ok((serde_json::json!({}), Vec::new(), None, None));
    };

    let limit = clamp_limit_or(params.limit, GRAPH_DEFAULT_LIMIT);

    // Driven from `follows` rather than joined to `users`, for two reasons.
    // A tuple of `(User, DateTime)` cannot be deserialized — `FromRow` does
    // not compose inside one — and more importantly the follow is recorded by
    // DID, so a subject this instance has never indexed has no row to join
    // to. Reading the edges first makes that case visible instead of silently
    // dropping it in the join.
    let mut query = Query::select();
    query
        .expr(Expr::col((Alias::new("f"), direction.returned())))
        .expr(Expr::col((Alias::new("f"), Follows::XataCreatedat)))
        .from_as(Follows::Table, Alias::new("f"))
        .and_where(Expr::col((Alias::new("f"), direction.matched())).eq(&subject.did));

    // The cursor is the last row's timestamp in epoch milliseconds, so the
    // next page is strictly older. Anything unparseable is treated as absent
    // rather than erroring: a stale cursor should restart the list, not break
    // the page.
    if let Some(after) = params.cursor.as_deref().and_then(parse_cursor) {
        // As ISO text, not as a native timestamp: SQLite holds these columns as
        // TEXT and compares them lexicographically, so a value rendered in any
        // other shape would silently match the wrong rows.
        query.and_where(
            Expr::col((Alias::new("f"), Follows::XataCreatedat))
                .lt(db.timestamp_value(format_timestamp(after))),
        );
    }

    if let Some(dids) = &params.dids {
        if dids.is_empty() {
            // An explicit empty list means "none of these", not "all".
            return Ok((
                serde_json::to_value(ActorView::from(&subject)).unwrap_or_default(),
                Vec::new(),
                None,
                Some(0),
            ));
        }
        query.and_where(
            Expr::col((Alias::new("f"), direction.returned()))
                .is_in(dids.iter().map(String::as_str)),
        );
    }

    query
        .order_by((Alias::new("f"), Follows::XataCreatedat), Order::Desc)
        .limit(limit as u64);

    let edges: Vec<(String, chrono::DateTime<chrono::Utc>)> = db.fetch_all(&query).await?;

    // A cursor is only returned when the page was full, so a caller looping
    // until it is absent terminates.
    let cursor = (edges.len() as i64 == limit)
        .then(|| {
            edges
                .last()
                .map(|(_, at)| at.timestamp_millis().to_string())
        })
        .flatten();

    let dids: Vec<String> = edges.iter().map(|(did, _)| did.clone()).collect();
    let profiles = users_by_did(db, &dids).await?;

    // Walked in follow order, so the newest follow is first. An account with
    // no profile here is skipped rather than rendered blank: the follow is
    // real, this instance just has not indexed the other side.
    let actors = edges
        .iter()
        .filter_map(|(did, _)| profiles.get(did.as_str()).map(ActorView::from))
        .collect();

    let count_query = Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from_as(Follows::Table, Alias::new("f"))
        .and_where(Expr::col((Alias::new("f"), direction.matched())).eq(&subject.did))
        .take();
    let count = db.count(&count_query).await?;

    Ok((
        serde_json::to_value(ActorView::from(&subject)).unwrap_or_default(),
        actors,
        cursor,
        Some(count),
    ))
}

/// Profiles for a set of DIDs, keyed by DID.
///
/// `crate::db::loaders` keys on row id; the graph only knows DIDs.
async fn users_by_did(
    db: &Backend,
    dids: &[String],
) -> Result<std::collections::HashMap<String, User>, sqlx::Error> {
    if dids.is_empty() {
        return Ok(Default::default());
    }

    let mut query = Query::select();
    db.select_model(&mut query, USER_COLS, None);
    query
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).is_in(dids.iter().map(String::as_str)));

    Ok(db
        .fetch_all::<User>(&query)
        .await?
        .into_iter()
        .map(|user| (user.did.clone(), user))
        .collect())
}

/// Reads a cursor as an epoch-millisecond timestamp.
fn parse_cursor(cursor: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let millis: i64 = cursor.trim().parse().ok()?;
    chrono::DateTime::from_timestamp_millis(millis)
}

// ------------------------------------------------------------------- writes

/// An `app.rocksky.graph.follow` record.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowRecord {
    #[serde(rename = "$type")]
    pub record_type: &'static str,
    /// The DID followed. A DID rather than a strong ref: an account is not a
    /// record and has no CID to pin.
    pub subject: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AccountParams {
    #[serde(default)]
    pub account: Option<String>,
}

/// `app.rocksky.graph.followAccount`
///
/// Takes the account as a query parameter, not a body — the lexicon declares
/// it a procedure with `parameters` rather than `input`, which is unusual but
/// is what the UI sends.
async fn follow_account(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<AccountParams>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let subject = resolve_account(db, &params.account).await?;

    if subject.did == auth.did {
        return Err(XrpcError::invalid_request(
            "An account cannot follow itself",
        ));
    }

    // Already following: answer success rather than writing a second record.
    let existing = follow_uri_query(&auth.did, &subject.did);
    if db.fetch_scalar::<String>(&existing).await?.is_some() {
        tracing::debug!(
            did = %auth.did,
            subject = %subject.did,
            "already following; nothing written"
        );
        return followed(state.db(), &subject).await;
    }

    let writer = Writer::for_did(&state, &auth.did).await?;
    let rkey = crate::atproto::records::next_tid();
    let written = writer
        .create(
            FOLLOW_COLLECTION,
            &rkey,
            &FollowRecord {
                record_type: FOLLOW_COLLECTION,
                subject: subject.did.clone(),
                created_at: crate::views::timestamp::to_iso8601(&chrono::Utc::now()),
            },
        )
        .await?;

    let insert = Query::insert()
        .into_table(Follows::Table)
        .columns([
            Follows::XataId,
            Follows::Uri,
            Follows::FollowerDid,
            Follows::SubjectDid,
        ])
        .values_panic([
            new_id().into(),
            written.uri.clone().into(),
            auth.did.clone().into(),
            subject.did.clone().into(),
        ])
        .to_owned();
    db.execute(&insert).await?;

    tracing::info!(did = %auth.did, subject = %subject.did, "followed an account");
    followed(db, &subject).await
}

/// `app.rocksky.graph.unfollowAccount`
async fn unfollow_account(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<AccountParams>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let subject = resolve_account(db, &params.account).await?;

    let existing = follow_uri_query(&auth.did, &subject.did);

    if let Some(uri) = db.fetch_scalar::<String>(&existing).await? {
        if let Some(rkey) = super::like::rkey_of(&uri) {
            let writer = Writer::for_did(&state, &auth.did).await?;
            writer.delete(FOLLOW_COLLECTION, &rkey).await?;
        }

        let delete = Query::delete()
            .from_table(Follows::Table)
            .and_where(Expr::col(Follows::FollowerDid).eq(&auth.did))
            .and_where(Expr::col(Follows::SubjectDid).eq(&subject.did))
            .to_owned();
        db.execute(&delete).await?;

        tracing::info!(did = %auth.did, subject = %subject.did, "unfollowed an account");
    }

    followed(db, &subject).await
}

/// The one follow edge between two accounts, by its AT-URI.
fn follow_uri_query(follower_did: &str, subject_did: &str) -> crate::sea_query::SelectStatement {
    Query::select()
        .column(Follows::Uri)
        .from(Follows::Table)
        .and_where(Expr::col(Follows::FollowerDid).eq(follower_did))
        .and_where(Expr::col(Follows::SubjectDid).eq(subject_did))
        .limit(1)
        .take()
}

/// The reply both follow procedures give: the subject and its follower count.
async fn followed(db: &Backend, subject: &User) -> XrpcResult<HttpResponse> {
    let query = Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from(Follows::Table)
        .and_where(Expr::col(Follows::SubjectDid).eq(&subject.did))
        .take();
    let count = db.count(&query).await?;

    json(FollowersOutput {
        subject: serde_json::to_value(ActorView::from(subject)).unwrap_or_default(),
        followers: Vec::new(),
        cursor: None,
        count: Some(count),
    })
}

/// Resolves the account being followed, by DID or handle.
async fn resolve_account(db: &Backend, account: &Option<String>) -> Result<User, XrpcError> {
    let account = account
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("account is required"))?;

    find_user(db, account).await?.ok_or_else(|| {
        // Only an account this instance has indexed can be followed: the
        // follow row records a DID, but the reply needs a profile.
        XrpcError::invalid_request(format!("{account} is not an account on this instance"))
            .named("AccountNotFound")
    })
}

async fn find_user(db: &Backend, did_or_handle: &str) -> Result<Option<User>, sqlx::Error> {
    if did_or_handle.is_empty() {
        return Ok(None);
    }
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

    /// The two directions must read opposite columns, or a followers list
    /// silently shows follows instead.
    #[test]
    fn the_two_directions_are_mirror_images() {
        assert_eq!(Direction::Followers.matched(), Follows::SubjectDid);
        assert_eq!(Direction::Followers.returned(), Follows::FollowerDid);

        assert_eq!(Direction::Follows.matched(), Follows::FollowerDid);
        assert_eq!(Direction::Follows.returned(), Follows::SubjectDid);

        // And they are genuinely swapped, not accidentally equal.
        assert_eq!(
            Direction::Followers.matched(),
            Direction::Follows.returned()
        );
        assert_eq!(
            Direction::Follows.matched(),
            Direction::Followers.returned()
        );
    }

    #[test]
    fn a_cursor_is_an_epoch_millisecond_timestamp() {
        let at = parse_cursor("1783500678456").expect("parses");
        assert_eq!(at.timestamp_millis(), 1_783_500_678_456);
        // Round-trips, which is what makes paging work.
        assert_eq!(at.timestamp_millis().to_string(), "1783500678456");
    }

    /// A stale or malformed cursor restarts the list rather than breaking the
    /// page — the UI keeps cursors across reloads.
    #[test]
    fn an_unusable_cursor_is_treated_as_absent() {
        for cursor in ["", "  ", "not-a-number", "3k2a", "1.5", "-", "٣"] {
            assert!(
                parse_cursor(cursor).is_none(),
                "{cursor:?} should not parse"
            );
        }
        // Whitespace around a real value is tolerated.
        assert!(parse_cursor(" 1783500678456 ").is_some());
    }

    /// The follow record names its subject by DID, not by strong ref: an
    /// account is not a record and has no CID.
    #[test]
    fn a_follow_record_names_a_did() {
        let record = FollowRecord {
            record_type: FOLLOW_COLLECTION,
            subject: "did:plc:bob".into(),
            created_at: "2026-01-01T00:00:00.000Z".into(),
        };
        let value = serde_json::to_value(&record).unwrap();

        assert_eq!(value["$type"], "app.rocksky.graph.follow");
        assert_eq!(value["subject"], "did:plc:bob");
        assert_eq!(value["createdAt"], "2026-01-01T00:00:00.000Z");
        assert!(
            value["subject"].is_string(),
            "a strong ref here would be wrong: {value}"
        );
    }
}
