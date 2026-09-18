use crate::xata::spotify_account::SpotifyAccount;
use anyhow::Error;
use rocksky_db::schema::{SpotifyAccounts, SpotifyApps};
use rocksky_db::sea_query::{Asterisk, Expr, JoinType, Query};
use rocksky_db::Backend;

pub async fn get_spotify_account(
    pool: &Backend,
    user_id: &str,
) -> Result<Option<SpotifyAccount>, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(SpotifyAccounts::Table)
        .join(
            JoinType::LeftJoin,
            SpotifyApps::Table,
            Expr::col((SpotifyAccounts::Table, SpotifyAccounts::SpotifyAppId))
                .equals((SpotifyApps::Table, SpotifyApps::SpotifyAppId)),
        )
        .and_where(Expr::col((SpotifyAccounts::Table, SpotifyAccounts::UserId)).eq(user_id))
        .limit(1)
        .to_owned();

    Ok(pool.fetch_optional(&stmt).await?)
}
