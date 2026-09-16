//! Ranking catalogue entities by how often they were played.
//!
//! Every "top N" list in the API — an actor's top artists, an album's tracks
//! by popularity, the global top songs — is the same two queries. The ranking
//! runs over `scrobbles` alone, grouping on one foreign key; the rows for the
//! winning ids are fetched afterwards. Doing it in one statement would mean
//! either a `GROUP BY` over every selected column or a join across every
//! scrobble, and this is the query that runs on every page load.
//!
//! The scope is what differs between callers: an actor's list counts only that
//! user's plays, a global list counts everyone's, and an album's or artist's
//! list is restricted to the ids belonging to it.

use crate::db::schema::Scrobbles;
use crate::db::Backend;
use crate::sea_query::{Alias, Asterisk, Expr, Func, FunctionCall, Order, Query, SelectStatement};
use std::collections::HashMap;
use std::time::Instant;

/// A ranking slower than this is logged.
///
/// These queries run on every profile and every chart, so one that has stopped
/// using an index is the first thing to look for when the site feels slow —
/// and the only way to notice is if it says so. The threshold is generous
/// enough that a healthy instance is silent.
const SLOW_RANKING: std::time::Duration = std::time::Duration::from_millis(250);

/// What a ranking is restricted to.
#[derive(Debug, Default, Clone)]
pub struct Scope {
    /// Only this user's plays. `None` counts everyone's.
    pub user_id: Option<String>,
    /// Only these ids, for the tracks of one album or artist.
    pub ids: Option<Vec<String>>,
    /// ISO bounds on `scrobbles.timestamp`.
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

impl Scope {
    pub fn for_user(user_id: impl Into<String>) -> Self {
        Self {
            user_id: Some(user_id.into()),
            ..Default::default()
        }
    }

    pub fn global() -> Self {
        Self::default()
    }

    pub fn restricted_to(mut self, ids: Vec<String>) -> Self {
        self.ids = Some(ids);
        self
    }

    pub fn between(mut self, start: Option<String>, end: Option<String>) -> Self {
        self.start_date = start;
        self.end_date = end;
        self
    }

    /// Whether this scope can match anything at all.
    ///
    /// An explicit empty id list means "none of them", which is different from
    /// no restriction — a caller that found no tracks must get no rows, not
    /// every row.
    pub fn is_empty(&self) -> bool {
        self.ids.as_ref().is_some_and(|ids| ids.is_empty())
    }

    /// Adds the scope's conditions to a ranking query over `column`.
    fn push_conditions(&self, db: &Backend, query: &mut SelectStatement, column: &str) {
        if let Some(user_id) = &self.user_id {
            query.and_where(Expr::col(Scrobbles::UserId).eq(user_id));
        }
        if let Some(ids) = &self.ids {
            query.and_where(Expr::col(Alias::new(column)).is_in(ids.iter().map(|id| id.as_str())));
        }
        // Through `timestamp_value`, because the bound value is ISO text and
        // `timestamp >= text` has no operator on Postgres — see the note on
        // that method.
        if let Some(start) = &self.start_date {
            query.and_where(Expr::col(Scrobbles::Timestamp).gte(db.timestamp_value(start)));
        }
        if let Some(end) = &self.end_date {
            query.and_where(Expr::col(Scrobbles::Timestamp).lte(db.timestamp_value(end)));
        }
    }
}

/// `(id, play_count)` for `column`, most-played first.
///
/// NULLs are excluded: a scrobble with no album still counts towards its
/// track, and grouping the NULLs would produce an entry with no row to
/// hydrate.
///
/// Ties break by id so paging is stable. Without that, two entries with the
/// same count can swap between pages — one shown twice and one never. The
/// TypeScript handlers omit it, so their pagination has that flaw.
pub async fn by_plays(
    db: &Backend,
    column: &str,
    scope: &Scope,
    limit: i64,
    offset: i64,
) -> Result<Vec<(String, i64)>, sqlx::Error> {
    if scope.is_empty() {
        return Ok(Vec::new());
    }

    let col = Alias::new(column);
    let mut query = Query::select();
    query
        .expr_as(Expr::col(col.clone()), Alias::new("id"))
        .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("plays"))
        .from(Scrobbles::Table)
        .and_where(Expr::col(col.clone()).is_not_null());
    scope.push_conditions(db, &mut query, column);
    query
        .group_by_col(col.clone())
        .order_by(Alias::new("plays"), Order::Desc)
        .order_by(col, Order::Asc)
        .limit(limit as u64)
        .offset(offset as u64);

    let started = Instant::now();
    let ranked = db.fetch_all::<(String, i64)>(&query).await?;
    let elapsed = started.elapsed();

    if elapsed > SLOW_RANKING {
        tracing::warn!(
            column,
            rows = ranked.len(),
            limit,
            offset,
            scoped_to_user = scope.user_id.is_some(),
            restricted_ids = scope.ids.as_ref().map(Vec::len),
            windowed = scope.start_date.is_some() || scope.end_date.is_some(),
            elapsed_ms = elapsed.as_millis(),
            "a ranking query was slow"
        );
    } else {
        tracing::trace!(
            column,
            rows = ranked.len(),
            elapsed_ms = elapsed.as_millis(),
            "ranked"
        );
    }

    Ok(ranked)
}

/// Total plays of each of `ids`, within the scope's date window.
///
/// The scope's `user_id` is deliberately ignored: this is used to report an
/// entity's overall popularity next to one user's own count, so applying the
/// user filter would make the two numbers identical.
pub async fn play_counts(
    db: &Backend,
    column: &str,
    ids: &[String],
    scope: &Scope,
) -> Result<HashMap<String, i64>, sqlx::Error> {
    aggregate(db, column, ids, scope, Func::count(Expr::col(Asterisk))).await
}

/// How many distinct users played each of `ids`, within the date window.
pub async fn unique_listeners(
    db: &Backend,
    column: &str,
    ids: &[String],
    scope: &Scope,
) -> Result<HashMap<String, i64>, sqlx::Error> {
    aggregate(
        db,
        column,
        ids,
        scope,
        Func::count_distinct(Expr::col(Scrobbles::UserId)),
    )
    .await
}

async fn aggregate(
    db: &Backend,
    column: &str,
    ids: &[String],
    scope: &Scope,
    expression: FunctionCall,
) -> Result<HashMap<String, i64>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }

    let col = Alias::new(column);
    let mut query = Query::select();
    query
        .expr_as(Expr::col(col.clone()), Alias::new("id"))
        .expr_as(expression, Alias::new("total"))
        .from(Scrobbles::Table)
        .and_where(Expr::col(col.clone()).is_in(ids.iter().map(|id| id.as_str())));
    if let Some(start) = &scope.start_date {
        query.and_where(Expr::col(Scrobbles::Timestamp).gte(start));
    }
    if let Some(end) = &scope.end_date {
        query.and_where(Expr::col(Scrobbles::Timestamp).lte(end));
    }
    query.group_by_col(col);

    Ok(db
        .fetch_all::<(String, i64)>(&query)
        .await?
        .into_iter()
        .collect())
}

/// One entity's totals, for the detail pages.
#[derive(Debug, Default, Clone, Copy)]
pub struct Totals {
    pub play_count: i64,
    pub unique_listeners: i64,
}

pub async fn totals_for(db: &Backend, column: &str, id: &str) -> Result<Totals, sqlx::Error> {
    let query = Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .expr(Func::count_distinct(Expr::col(Scrobbles::UserId)))
        .from(Scrobbles::Table)
        .and_where(Expr::col(Alias::new(column)).eq(id))
        .to_owned();

    Ok(db
        .fetch_optional::<(i64, i64)>(&query)
        .await?
        .map(|(plays, listeners)| Totals {
            play_count: plays,
            unique_listeners: listeners,
        })
        .unwrap_or_default())
}

/// Row ids belonging to one entity, read from a junction table.
pub async fn junction_ids(
    db: &Backend,
    table: &str,
    parent_column: &str,
    child_column: &str,
    parent_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let query = Query::select()
        .column(Alias::new(child_column))
        .from(Alias::new(table))
        .and_where(Expr::col(Alias::new(parent_column)).eq(parent_id))
        .to_owned();
    db.fetch_scalars(&query).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sea_query::SqliteQueryBuilder;

    /// The `WHERE` a ranking starts from, before the scope narrows it.
    fn base() -> SelectStatement {
        Query::select()
            .expr_as(Expr::col(Alias::new("x")), Alias::new("id"))
            .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("plays"))
            .from(Scrobbles::Table)
            .and_where(Expr::col(Alias::new("x")).is_not_null())
            .to_owned()
    }

    /// Rendered with the values inlined, which is what makes the conditions
    /// readable in an assertion.
    async fn rendered(scope: &Scope, column: &str) -> String {
        let db = crate::db::connect_in_memory().await.unwrap();
        let mut query = base();
        scope.push_conditions(&db, &mut query, column);
        query.to_string(SqliteQueryBuilder)
    }

    #[tokio::test]
    async fn a_global_scope_adds_no_conditions() {
        assert_eq!(
            rendered(&Scope::global(), "track_id").await,
            base().to_string(SqliteQueryBuilder)
        );
    }

    #[tokio::test]
    async fn a_user_scope_filters_by_user() {
        let sql = rendered(&Scope::for_user("u1"), "track_id").await;
        assert!(sql.contains(r#"AND "user_id" = 'u1'"#), "{sql}");
    }

    #[tokio::test]
    async fn an_id_restriction_filters_by_the_grouped_column() {
        let scope = Scope::global().restricted_to(vec!["a".into(), "b".into()]);
        let sql = rendered(&scope, "track_id").await;
        assert!(sql.contains(r#"AND "track_id" IN ('a', 'b')"#), "{sql}");
    }

    #[tokio::test]
    async fn a_date_window_bounds_the_timestamp() {
        let scope = Scope::global().between(Some("2026-01-01".into()), Some("2026-02-01".into()));
        let sql = rendered(&scope, "track_id").await;
        assert!(sql.contains(r#"AND "timestamp" >= '2026-01-01'"#), "{sql}");
        assert!(sql.contains(r#"AND "timestamp" <= '2026-02-01'"#), "{sql}");
    }

    /// An empty restriction means "nothing", not "everything" — the difference
    /// between an album with no tracks showing none and showing the whole
    /// catalogue.
    #[test]
    fn an_empty_restriction_matches_nothing() {
        assert!(Scope::global().restricted_to(Vec::new()).is_empty());
        assert!(!Scope::global().is_empty());
        assert!(!Scope::global().restricted_to(vec!["a".into()]).is_empty());
    }
}
