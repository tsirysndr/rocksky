use anyhow::Error;
use rocksky_db::schema::{SpotifyAccounts, SpotifyApps, SpotifyTokens, Users};
use rocksky_db::sea_query::{Asterisk, Expr, JoinType, Query, SelectStatement};
use rocksky_db::Backend;

use crate::xata::spotify_token::SpotifyToken;

/// A token with the account, user and app it belongs to.
///
/// `SpotifyToken` names columns from all four tables, so the projection is
/// `SELECT *` across the joins. One definition, so the two lookups cannot
/// drift — a missing join is a decode failure at runtime.
fn tokens_with_account() -> SelectStatement {
    Query::select()
        .column(Asterisk)
        .from(SpotifyTokens::Table)
        .join(
            JoinType::LeftJoin,
            SpotifyAccounts::Table,
            Expr::col((SpotifyTokens::Table, SpotifyTokens::UserId))
                .equals((SpotifyAccounts::Table, SpotifyAccounts::UserId)),
        )
        .join(
            JoinType::LeftJoin,
            Users::Table,
            Expr::col((SpotifyAccounts::Table, SpotifyAccounts::UserId))
                .equals((Users::Table, Users::XataId)),
        )
        .join(
            JoinType::LeftJoin,
            SpotifyApps::Table,
            Expr::col((SpotifyTokens::Table, SpotifyTokens::SpotifyAppId))
                .equals((SpotifyApps::Table, SpotifyApps::SpotifyAppId)),
        )
        .to_owned()
}

pub async fn get_spotify_token(pool: &Backend, did: &str) -> Result<Option<SpotifyToken>, Error> {
    let mut stmt = tokens_with_account();
    stmt.and_where(Expr::col((Users::Table, Users::Did)).eq(did))
        .limit(1);

    Ok(pool.fetch_optional(&stmt).await?)
}

pub async fn get_spotify_tokens(pool: &Backend, limit: u32) -> Result<Vec<SpotifyToken>, Error> {
    let mut stmt = tokens_with_account();
    stmt.and_where(Expr::col((SpotifyAccounts::Table, SpotifyAccounts::IsBetaUser)).eq(true))
        .limit(limit as u64);

    Ok(pool.fetch_all(&stmt).await?)
}
