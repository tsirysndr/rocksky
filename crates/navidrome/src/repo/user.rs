use anyhow::Error;
use sea_query::{Alias, Expr, JoinType, Query};

use crate::schema::{ApiKeys, Users};
use crate::sql;
use crate::xata::user::UserWithApiKey;
use rocksky_pgurl::Db;

pub async fn get_user_did_by_id(db: &Db, user_id: &str) -> Result<Option<String>, Error> {
    let pool = db.primary();
    let stmt = Query::select()
        .column(Users::Did)
        .from(Users::Table)
        .and_where(Expr::col(Users::XataId).eq(user_id))
        .take();

    Ok(sql::fetch_scalar_optional(pool, &stmt).await?)
}

/// Resolve a user by handle without requiring an API key.
///
/// Used by the internal (server-to-server) auth path: apps/api has already
/// authenticated the caller via a Rocksky JWT, so we trust the handle and skip
/// Subsonic credential verification. `api_key` is returned empty since it is
/// irrelevant on this path.
pub async fn get_user_by_handle(db: &Db, handle: &str) -> Result<Option<UserWithApiKey>, Error> {
    let pool = db.primary();
    let stmt = Query::select()
        .columns([
            Users::XataId,
            Users::Handle,
            Users::DisplayName,
            Users::Avatar,
        ])
        .expr_as(Expr::val(""), Alias::new("api_key"))
        .from(Users::Table)
        .and_where(Expr::col(Users::Handle).eq(handle))
        .take();

    Ok(sql::fetch_optional(pool, &stmt).await?)
}

pub async fn get_user_with_apikeys(db: &Db, handle: &str) -> Result<Vec<UserWithApiKey>, Error> {
    let pool = db.primary();
    let stmt = Query::select()
        .columns([
            (Users::Table, Users::XataId),
            (Users::Table, Users::Handle),
            (Users::Table, Users::DisplayName),
            (Users::Table, Users::Avatar),
        ])
        .column((ApiKeys::Table, ApiKeys::ApiKey))
        .from(Users::Table)
        .join(
            JoinType::Join,
            ApiKeys::Table,
            Expr::col((Users::Table, Users::XataId)).equals((ApiKeys::Table, ApiKeys::UserId)),
        )
        .and_where(Expr::col((Users::Table, Users::Handle)).eq(handle))
        .and_where(Expr::col((ApiKeys::Table, ApiKeys::Enabled)).eq(true))
        .take();

    Ok(sql::fetch_all(pool, &stmt).await?)
}
