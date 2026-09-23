//! `GET /1/user/{user_name}/following` and `/followers` — the friends screen.
//!
//! ListenBrainz answers a bare list of user names, and the client then asks
//! each of them for their latest listen. So this returns handles, which is
//! what `{user_name}` means everywhere else in this API.

use anyhow::Error;
use rocksky_db::models::User;
use rocksky_db::schema::{Follows, Users};
use rocksky_db::sea_query::{Expr, JoinType, Order, Query};
use rocksky_db::Backend;

use crate::listenbrainz::types::{FollowersResponse, FollowingResponse};

/// Enough for any friends list a client will page through in one screen, and
/// a bound on a query that would otherwise be unbounded.
const MAX: u64 = 500;

pub async fn get_following(db: &Backend, user: &User) -> Result<FollowingResponse, Error> {
    Ok(FollowingResponse {
        following: handles(db, &user.did, Follows::FollowerDid, Follows::SubjectDid).await?,
        user: user.handle.clone(),
    })
}

pub async fn get_followers(db: &Backend, user: &User) -> Result<FollowersResponse, Error> {
    Ok(FollowersResponse {
        followers: handles(db, &user.did, Follows::SubjectDid, Follows::FollowerDid).await?,
        user: user.handle.clone(),
    })
}

/// The handles on the far side of `user`'s follow edges.
///
/// `matched` is the column holding `did` and `other` the one holding the
/// counterparty, so the same statement serves both directions.
async fn handles(
    db: &Backend,
    did: &str,
    matched: Follows,
    other: Follows,
) -> Result<Vec<String>, Error> {
    let mut query = Query::select();
    query
        .column((Users::Table, Users::Handle))
        .from(Follows::Table)
        // An inner join, so a follow of somebody who has never signed in here
        // is left out rather than listed as a blank name.
        .join(
            JoinType::InnerJoin,
            Users::Table,
            Expr::col((Users::Table, Users::Did)).equals((Follows::Table, other)),
        )
        .and_where(Expr::col((Follows::Table, matched)).eq(did))
        .order_by((Users::Table, Users::Handle), Order::Asc)
        .limit(MAX);

    Ok(db.fetch_scalars::<String>(&query).await?)
}
