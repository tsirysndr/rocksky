//! The tables this service reads, as `Iden` enums.
//!
//! Same shape as `rocksky-navidrome`'s and `rocksky-jetstream`'s: naming the
//! columns in one place is what lets the queries be built with sea-query
//! rather than formatted into strings, which is what makes them run on either
//! backend — the placeholder syntax differs (`?` against `$1`) and the builder
//! is the only thing that should know which.

use sea_query::Iden;

#[derive(Iden, Clone, Copy)]
#[iden = "spotify_tokens"]
pub enum SpotifyTokens {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "spotify_app_id"]
    SpotifyAppId,
}

#[derive(Iden, Clone, Copy)]
#[iden = "spotify_accounts"]
pub enum SpotifyAccounts {
    Table,
    #[iden = "user_id"]
    UserId,
    #[iden = "email"]
    Email,
}

#[derive(Iden, Clone, Copy)]
#[iden = "spotify_apps"]
pub enum SpotifyApps {
    Table,
    #[iden = "spotify_app_id"]
    SpotifyAppId,
}

#[derive(Iden, Clone, Copy)]
#[iden = "users"]
pub enum Users {
    Table,
    #[iden = "xata_id"]
    XataId,
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_query::{Alias, Expr, PostgresQueryBuilder, Query, SqliteQueryBuilder};

    /// The names have to match the schema the other services write, or a
    /// query built from these compiles and then fails at runtime.
    #[test]
    fn the_columns_are_named_as_the_schema_names_them() {
        let sql = Query::select()
            .column((SpotifyTokens::Table, SpotifyTokens::UserId))
            .from(SpotifyTokens::Table)
            .and_where(Expr::col((SpotifyAccounts::Table, SpotifyAccounts::Email)).eq("a@b.c"))
            .to_owned();

        // Rendered for both dialects, since that is the entire point.
        let pg = sql.to_string(PostgresQueryBuilder);
        let lite = sql.to_string(SqliteQueryBuilder);
        for rendered in [&pg, &lite] {
            assert!(
                rendered.contains(r#""spotify_tokens"."user_id""#),
                "{rendered}"
            );
            assert!(
                rendered.contains(r#""spotify_accounts"."email""#),
                "{rendered}"
            );
        }

        // And an alias survives as itself.
        assert!(Query::select()
            .column(Alias::new("xata_id"))
            .from(Users::Table)
            .to_owned()
            .to_string(SqliteQueryBuilder)
            .contains(r#"FROM "users""#));
    }
}
