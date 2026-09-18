use anyhow::Error;
use rocksky_db::schema::Webscrobblers;
use rocksky_db::sea_query::{Asterisk, Expr, Query};
use rocksky_db::Backend;

use crate::xata::webscrobbler::Webscrobbler;

pub async fn get_webscrobbler(pool: &Backend, uuid: &str) -> Result<Option<Webscrobbler>, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(Webscrobblers::Table)
        .and_where(Expr::col(Webscrobblers::Uuid).eq(uuid))
        .limit(1)
        .to_owned();

    Ok(pool.fetch_optional(&stmt).await?)
}
