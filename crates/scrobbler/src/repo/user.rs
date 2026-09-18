use anyhow::Error;
use rocksky_db::schema::{ApiKeys, Users};
use rocksky_db::sea_query::{Asterisk, Expr, JoinType, Query};
use rocksky_db::Backend;

use crate::xata::user::{User, UserWithoutSecret};

pub async fn get_user_by_apikey(pool: &Backend, apikey: &str) -> Result<Option<User>, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(Users::Table)
        .join(
            JoinType::LeftJoin,
            ApiKeys::Table,
            Expr::col((Users::Table, Users::XataId)).equals((ApiKeys::Table, ApiKeys::UserId)),
        )
        .and_where(Expr::col((ApiKeys::Table, ApiKeys::ApiKey)).eq(apikey))
        .limit(1)
        .to_owned();

    Ok(pool.fetch_optional(&stmt).await?)
}

pub async fn get_user_by_did(
    pool: &Backend,
    did: &str,
) -> Result<Option<UserWithoutSecret>, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .to_owned();

    Ok(pool.fetch_optional(&stmt).await?)
}
