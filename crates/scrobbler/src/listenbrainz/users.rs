//! Resolving the `{user_name}` every read endpoint is addressed by.
//!
//! A ListenBrainz user name is a Rocksky **handle** — that is what
//! `validate-token` hands the client at sign-in, and what it then puts in
//! every path. A DID is accepted too, so a link built from one still works.

use anyhow::Error;
use rocksky_db::models::{User, USER_COLS};
use rocksky_db::schema::Users;
use rocksky_db::sea_query::{Expr, Func, Query, SimpleExpr};
use rocksky_db::Backend;

use crate::auth::decode_token;
use crate::repo;

/// `LOWER(x)` as a SQL condition rather than a Rust comparison.
fn lower(expr: impl Into<SimpleExpr>) -> SimpleExpr {
    Expr::expr(Func::lower(expr)).into()
}

/// The user behind a `{user_name}` path segment, by handle or DID.
///
/// Three lookups rather than one `WHERE did = ? OR lower(handle) = lower(?)`,
/// because that condition can use neither of the unique indexes on those two
/// columns: the `OR` rules out one and `lower()` rules out the other, leaving
/// a sequential scan of `users` on a path that every request takes. So the
/// exact spellings are tried first, and the case-folded one only when they
/// both miss — which is a client that mangled the case, not the normal case.
pub async fn find(db: &Backend, name: &str) -> Result<Option<User>, Error> {
    if name.starts_with("did:") {
        return find_by_did(db, name).await;
    }

    if let Some(user) = by(db, Expr::col(Users::Handle).eq(name)).await? {
        return Ok(Some(user));
    }

    by(
        db,
        lower(Expr::col(Users::Handle)).eq(lower(Expr::val(name))),
    )
    .await
}

/// The user with this DID, on the unique index.
pub async fn find_by_did(db: &Backend, did: &str) -> Result<Option<User>, Error> {
    by(db, Expr::col(Users::Did).eq(did)).await
}

async fn by(db: &Backend, condition: SimpleExpr) -> Result<Option<User>, Error> {
    let mut query = Query::select();
    db.select_model(&mut query, USER_COLS, None);
    query.from(Users::Table).and_where(condition).limit(1);

    Ok(db.fetch_optional(&query).await?)
}

/// The DID a submitted token belongs to.
///
/// Both kinds are accepted, in the order the write path checks them: a signed
/// JWT, which the Rocksky clients mint, and an API key, which is what a user
/// pastes into a ListenBrainz client.
pub async fn did_for_token(db: &Backend, token: &str) -> Result<Option<String>, Error> {
    if let Ok(claims) = decode_token(token) {
        return Ok(Some(claims.did));
    }
    Ok(repo::user::get_user_by_apikey(db, token)
        .await?
        .map(|user| user.did))
}

/// The bearer token on a request, with every capitalisation of the two
/// schemes ListenBrainz clients use stripped.
pub fn bearer(req: &actix_web::HttpRequest) -> Option<&str> {
    let value = req.headers().get("Authorization")?.to_str().ok()?;
    let token = value
        .trim_start_matches("Token ")
        .trim_start_matches("Bearer ")
        .trim_start_matches("token ")
        .trim_start_matches("bearer ")
        .trim();
    (!token.is_empty() && token != "null").then_some(token)
}
