//! Resolving the `did` parameter that most `app.rocksky.*` methods take.
//!
//! Despite the name, that parameter accepts either a DID or a handle: the
//! TypeScript handlers all query `or(eq(users.did, params.did),
//! eq(users.handle, params.did))`. Clients rely on it — profile URLs are built
//! from handles — so the same leniency is kept here.

use crate::db::models::{User, USER_COLS};
use crate::db::schema::Users;
use crate::db::Backend;
use crate::sea_query::{Expr, Query, SimpleExpr};

/// Matches an actor by either identifier.
///
/// Every endpoint that takes a `did` parameter accepts a handle there too —
/// the UI routes are `/{handle}` and the API is called with whatever is in the
/// URL, so refusing a handle would break every link.
fn actor_matches(did_or_handle: &str) -> SimpleExpr {
    Expr::col(Users::Did)
        .eq(did_or_handle)
        .or(Expr::col(Users::Handle).eq(did_or_handle))
}

/// Looks up a user by DID or handle. `None` when neither matches.
pub async fn find_user(db: &Backend, did_or_handle: &str) -> Result<Option<User>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, USER_COLS, None);
    query
        .from(Users::Table)
        .and_where(actor_matches(did_or_handle))
        .limit(1);

    db.fetch_optional(&query).await
}

/// Just the row id, for the many handlers that only need it to filter by.
pub async fn find_user_id(
    db: &Backend,
    did_or_handle: &str,
) -> Result<Option<String>, sqlx::Error> {
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(actor_matches(did_or_handle))
        .limit(1)
        .to_owned();

    db.fetch_scalar(&query).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn fixture() -> Backend {
        let backend = db::connect_in_memory().await.unwrap();
        let mut sql = backend.sql("INSERT INTO users (xata_id, did, handle, avatar) VALUES (");
        sql.bind("rec_alice")
            .push(", ")
            .bind("did:plc:alice")
            .push(", ")
            .bind("alice.rocksky.app")
            .push(", ")
            .bind("https://example.invalid/a.png")
            .push(")");
        backend.execute(&sql).await.unwrap();
        backend
    }

    #[tokio::test]
    async fn a_did_resolves() {
        let db = fixture().await;
        let user = find_user(&db, "did:plc:alice").await.unwrap().unwrap();
        assert_eq!(user.handle, "alice.rocksky.app");
        assert_eq!(
            find_user_id(&db, "did:plc:alice").await.unwrap().as_deref(),
            Some("rec_alice")
        );
    }

    /// The parameter is named `did` but profile URLs carry handles, so this
    /// path is the common one in practice.
    #[tokio::test]
    async fn a_handle_resolves_too() {
        let db = fixture().await;
        let user = find_user(&db, "alice.rocksky.app").await.unwrap().unwrap();
        assert_eq!(user.did, "did:plc:alice");
        assert_eq!(
            find_user_id(&db, "alice.rocksky.app")
                .await
                .unwrap()
                .as_deref(),
            Some("rec_alice")
        );
    }

    #[tokio::test]
    async fn an_unknown_actor_is_none_rather_than_an_error() {
        let db = fixture().await;
        assert!(find_user(&db, "did:plc:nobody").await.unwrap().is_none());
        assert!(find_user_id(&db, "nobody.test").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn the_lookup_is_parameterized() {
        // A value that would be SQL if interpolated must simply not match.
        let db = fixture().await;
        assert!(find_user(&db, "' OR 1=1 --").await.unwrap().is_none());
    }
}
