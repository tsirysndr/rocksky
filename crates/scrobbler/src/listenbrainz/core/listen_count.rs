//! `GET /1/user/{user_name}/listen-count` — the total, for the client's
//! navigation drawer.

use anyhow::Error;
use rocksky_db::models::User;
use rocksky_db::schema::Scrobbles;
use rocksky_db::sea_query::{Asterisk, Expr, Func, Query};
use rocksky_db::Backend;

use crate::listenbrainz::types::{ListenCountPayload, ListenCountResponse};

pub async fn get_listen_count(db: &Backend, user: &User) -> Result<ListenCountResponse, Error> {
    let query = Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).eq(&user.id))
        .to_owned();

    Ok(ListenCountResponse {
        payload: ListenCountPayload {
            count: db.count(&query).await?,
        },
    })
}
