use anyhow::Error;
use rocksky_db::schema::{ApiKeys, Users};
use rocksky_db::sea_query::{Asterisk, Expr, JoinType, Query};
use rocksky_db::Backend;

use crate::xata::api_key::ApiKey;

pub async fn get_apikey(pool: &Backend, apikey: &str, did: &str) -> Result<Option<ApiKey>, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(ApiKeys::Table)
        .join(
            JoinType::LeftJoin,
            Users::Table,
            Expr::col((ApiKeys::Table, ApiKeys::UserId)).equals((Users::Table, Users::XataId)),
        )
        .and_where(Expr::col((ApiKeys::Table, ApiKeys::ApiKey)).eq(apikey))
        .and_where(Expr::col((Users::Table, Users::Did)).eq(did))
        .limit(1)
        .to_owned();

    Ok(pool.fetch_optional(&stmt).await?)
}
