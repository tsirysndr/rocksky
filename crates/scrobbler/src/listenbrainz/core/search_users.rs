//! `GET /1/search/users` — finding somebody to look at.

use anyhow::Error;
use rocksky_db::schema::Users;
use rocksky_db::sea_query::{Expr, Func, Order, Query, SimpleExpr};
use rocksky_db::Backend;

use crate::listenbrainz::types::{SearchUser, SearchUsersResponse};

const MAX: u64 = 25;

fn lower(expr: impl Into<SimpleExpr>) -> SimpleExpr {
    Expr::expr(Func::lower(expr)).into()
}

pub async fn search_users(db: &Backend, term: &str) -> Result<SearchUsersResponse, Error> {
    let term = term.trim();
    if term.is_empty() {
        return Ok(SearchUsersResponse { users: Vec::new() });
    }

    let mut query = Query::select();
    query
        .column(Users::Handle)
        .from(Users::Table)
        // Folded in the query rather than with ILIKE: this database's
        // collation folds ASCII only, and a handle is ASCII.
        .and_where(lower(Expr::col(Users::Handle)).like(format!("%{}%", term.to_lowercase())))
        // A flagged account is not somebody anyone meant to search for.
        .and_where(Expr::col(Users::IsBot).eq(false))
        .order_by(Users::Handle, Order::Asc)
        .limit(MAX);

    Ok(SearchUsersResponse {
        users: db
            .fetch_scalars::<String>(&query)
            .await?
            .into_iter()
            .map(|user_name| SearchUser { user_name })
            .collect(),
    })
}
