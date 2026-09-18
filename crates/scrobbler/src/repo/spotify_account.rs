use anyhow::Error;
use rocksky_db::schema::{SpotifyAccounts, SpotifyApps, Users};
use rocksky_db::sea_query::{Asterisk, Expr, JoinType, Query};
use rocksky_db::Backend;

use crate::xata::spotify_account::SpotifyAccount;

pub async fn get_spotify_account(
    pool: &Backend,
    did: &str,
) -> Result<Option<SpotifyAccount>, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(SpotifyAccounts::Table)
        .join(
            JoinType::LeftJoin,
            Users::Table,
            Expr::col((SpotifyAccounts::Table, SpotifyAccounts::UserId))
                .equals((Users::Table, Users::XataId)),
        )
        .join(
            JoinType::LeftJoin,
            SpotifyApps::Table,
            Expr::col((SpotifyAccounts::Table, SpotifyAccounts::SpotifyAppId))
                .equals((SpotifyApps::Table, SpotifyApps::SpotifyAppId)),
        )
        .and_where(Expr::col((Users::Table, Users::Did)).eq(did))
        .limit(1)
        .to_owned();

    Ok(pool.fetch_optional(&stmt).await?)
}
