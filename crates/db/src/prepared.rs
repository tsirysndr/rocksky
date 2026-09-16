//! One statement, rendered for whichever backend is live.
//!
//! This is the seam that lets [`crate::Backend`]'s query methods accept both a
//! sea-query statement and the older hand-built [`crate::query::Sql`], under
//! the same names. Both render to a [`Prepared`] — SQL text plus bound values —
//! and `Backend` executes that.
//!
//! # Why the dialect is not a parameter any more
//!
//! Every call site used to pass `db.dialect()` into whatever built the SQL,
//! because the placeholder syntax differs: SQLite writes `?`, Postgres writes
//! `$1`. That made the dialect a concern of two hundred and eighty handlers
//! that have no interest in it, and one forgotten `dialect()` produced a query
//! that worked on one backend and failed on the other — a class of bug no test
//! catches unless it runs against both.
//!
//! Now a statement is dialect-agnostic until `Backend` renders it, and
//! `Backend` is the only thing that knows which backend it is. The dialect
//! cannot be passed wrongly because it cannot be passed at all.
//!
//! # The two producers
//!
//! `sea_query`'s statements are the destination. `Sql` is what the crate was
//! written with and is being migrated away from; it renders through here so
//! that a half-migrated module still works, and so the method names do not have
//! to change twice.

use crate::query::{Arg, Sql};
use crate::Dialect;
use sea_query::{
    DeleteStatement, InsertStatement, PostgresQueryBuilder, SelectStatement, SqliteQueryBuilder,
    UpdateStatement, WithQuery,
};
use sea_query_binder::{SqlxBinder, SqlxValues};

/// A statement rendered for one backend.
pub struct Prepared {
    pub sql: String,
    pub values: SqlxValues,
}

/// Anything `Backend` can execute.
///
/// Implemented for sea-query's five statement types and for [`Sql`]. Not a
/// blanket impl over [`SqlxBinder`]: Rust cannot prove `Sql` will never
/// implement that trait, so a blanket impl would conflict with the one for
/// `Sql`.
pub trait Statement {
    fn prepare(&self, dialect: Dialect) -> Prepared;
}

macro_rules! sea_query_statement {
    ($type:ty) => {
        impl Statement for $type {
            fn prepare(&self, dialect: Dialect) -> Prepared {
                // The one place a dialect turns into a query builder.
                let (sql, values) = match dialect {
                    Dialect::Sqlite => self.build_sqlx(SqliteQueryBuilder),
                    Dialect::Postgres => self.build_sqlx(PostgresQueryBuilder),
                };
                Prepared { sql, values }
            }
        }
    };
}

sea_query_statement!(SelectStatement);
sea_query_statement!(InsertStatement);
sea_query_statement!(UpdateStatement);
sea_query_statement!(DeleteStatement);
sea_query_statement!(WithQuery);

impl Statement for Sql {
    fn prepare(&self, _dialect: Dialect) -> Prepared {
        // `Sql` was built with a dialect already — it rewrites placeholders as
        // it goes — so the one passed here is redundant rather than wrong.
        // Asserting they match would be a nice check, except that the whole
        // point of this layer is that the caller no longer has one to pass.
        Prepared {
            sql: self.render(),
            values: SqlxValues(sea_query::Values(
                self.args().iter().map(arg_to_value).collect(),
            )),
        }
    }
}

/// An [`Arg`] as sea-query spells the same value.
///
/// `Null` becomes a typed `String(None)` rather than any other nullable
/// variant, matching what the old binder did: it bound `Option::<String>::None`
/// for every NULL, and both drivers encode that as a plain NULL regardless of
/// the column's type.
fn arg_to_value(arg: &Arg) -> sea_query::Value {
    match arg {
        Arg::Text(value) => sea_query::Value::String(Some(Box::new(value.clone()))),
        Arg::Int(value) => sea_query::Value::BigInt(Some(*value)),
        Arg::Float(value) => sea_query::Value::Double(Some(*value)),
        Arg::Bool(value) => sea_query::Value::Bool(Some(*value)),
        Arg::Null => sea_query::Value::String(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::Users;
    use sea_query::{Expr, Query};

    /// The property this layer exists for: one statement, two dialects, each
    /// with its own placeholder syntax, and the caller naming neither.
    #[test]
    fn one_statement_renders_for_both_dialects() {
        let statement = Query::select()
            .column(Users::Handle)
            .from(Users::Table)
            .and_where(Expr::col(Users::Did).eq("did:plc:alice"))
            .to_owned();

        let sqlite = statement.prepare(Dialect::Sqlite);
        let postgres = statement.prepare(Dialect::Postgres);

        assert!(sqlite.sql.contains('?'), "{}", sqlite.sql);
        assert!(postgres.sql.contains("$1"), "{}", postgres.sql);

        // Same statement, so the same values in the same order — only the
        // placeholders differ.
        assert_eq!(sqlite.values.0 .0.len(), 1);
        assert_eq!(postgres.values.0 .0.len(), 1);
    }

    /// Every `Arg` variant must survive the crossing, or a half-migrated
    /// module would bind the wrong value.
    #[test]
    fn every_legacy_arg_maps_to_a_value() {
        use sea_query::Value;

        assert_eq!(
            arg_to_value(&Arg::Text("x".into())),
            Value::String(Some(Box::new("x".into())))
        );
        assert_eq!(arg_to_value(&Arg::Int(7)), Value::BigInt(Some(7)));
        assert_eq!(arg_to_value(&Arg::Float(1.5)), Value::Double(Some(1.5)));
        assert_eq!(arg_to_value(&Arg::Bool(true)), Value::Bool(Some(true)));

        // A typed NULL, as the old binder produced.
        assert_eq!(arg_to_value(&Arg::Null), Value::String(None));
    }

    /// A hand-built `Sql` renders with its values in order, so the two
    /// producers are interchangeable at the call site during the migration.
    #[test]
    fn a_legacy_sql_prepares_the_same_way() {
        let mut sql = Sql::new(Dialect::Postgres, "SELECT * FROM users WHERE did = ");
        sql.bind("did:plc:alice")
            .push(" AND is_bot = ")
            .bind(false)
            .push(" LIMIT ")
            .bind(10i64);

        let prepared = sql.prepare(Dialect::Postgres);

        assert_eq!(
            prepared.sql,
            "SELECT * FROM users WHERE did = $1 AND is_bot = $2 LIMIT $3"
        );
        assert_eq!(prepared.values.0 .0.len(), 3);
    }
}
