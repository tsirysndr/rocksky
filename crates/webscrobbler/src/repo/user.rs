use anyhow::Error;
use rocksky_db::schema::{Users, Webscrobblers};
use rocksky_db::sea_query::{Asterisk, Expr, JoinType, Query};
use rocksky_db::Backend;

use crate::xata::user::User;

pub async fn get_user_by_webscrobbler(pool: &Backend, uuid: &str) -> Result<Option<User>, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(Users::Table)
        .join(
            JoinType::LeftJoin,
            Webscrobblers::Table,
            Expr::col((Users::Table, Users::XataId))
                .equals((Webscrobblers::Table, Webscrobblers::UserId)),
        )
        .and_where(Expr::col((Webscrobblers::Table, Webscrobblers::Uuid)).eq(uuid))
        .limit(1)
        .to_owned();

    Ok(pool.fetch_optional(&stmt).await?)
}
