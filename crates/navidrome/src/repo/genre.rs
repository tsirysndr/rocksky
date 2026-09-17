use anyhow::Error;
use rocksky_db::Dialect;
use sea_query::{Alias, Expr, Func, Iden, JoinType, Order, Query, SimpleExpr};

use crate::repo::track::track_select;
use crate::schema::{ArtistAlbums, ArtistTracks, Artists, Tracks, UserUploads};
use crate::sql;
use crate::xata::track::TrackWithUpload;
use rocksky_db::Handle as Db;

/// The expanded genre, and the name it is grouped by.
///
/// There is no table of genres: they are an array column on `artists`, so the
/// expansion of that array *is* the grouping key. How an array becomes rows is
/// the one thing the two backends do completely differently — `UNNEST` in the
/// select list on Postgres, a `json_each` table in the FROM on SQLite — which
/// is what `genre_expansion` handles.
#[derive(Iden, Clone, Copy)]
#[iden = "genre"]
struct GenreCol;

pub struct GenreRow {
    pub genre: String,
    pub song_count: i64,
    pub album_count: i64,
}

// One impl for both backends: see `from_row_any!`. A hand-written `FromRow`
// names its row type, and `PgRow` and `SqliteRow` share no trait that
// `try_get` is defined on.
rocksky_db::from_row_any!(GenreRow {
    genre: String,
    song_count: i64,
    album_count: i64,
});

pub async fn get_genres(db: &Db, user_id: &str) -> Result<Vec<GenreRow>, Error> {
    let pool = db.replica();
    let stmt = genres_query(pool.dialect(), user_id);
    Ok(sql::fetch_all(pool, &stmt).await?)
}

/// The genre listing, as a statement, so both renderings can be asserted and
/// executed without a service.
fn genres_query(dialect: Dialect, user_id: &str) -> sea_query::SelectStatement {
    let mut stmt = Query::select();

    // SQLite expands the array by joining a `json_each` table, so the FROM
    // gains an item. It is correlated against `artists`, and has to be added
    // before the joins: the renderer emits FROM items in call order, and
    // `FROM a JOIN b ON …, json_each(…)` is not valid SQL.
    stmt.expr_as(genre_expansion(dialect), GenreCol)
        .expr_as(
            Func::count_distinct(Expr::col((ArtistTracks::Table, ArtistTracks::TrackId))),
            Alias::new("song_count"),
        )
        .expr_as(
            Func::count_distinct(Expr::col((ArtistAlbums::Table, ArtistAlbums::AlbumId))),
            Alias::new("album_count"),
        )
        .from(Artists::Table);

    if dialect == Dialect::Sqlite {
        stmt.from_function(
            Func::cust(Alias::new("json_each")).arg(Expr::col((Artists::Table, Artists::Genres))),
            GenreRows,
        );
    }

    stmt.join(
        JoinType::Join,
        ArtistTracks::Table,
        Expr::col((Artists::Table, Artists::XataId))
            .equals((ArtistTracks::Table, ArtistTracks::ArtistId)),
    )
    .join(
        JoinType::Join,
        UserUploads::Table,
        Expr::col((ArtistTracks::Table, ArtistTracks::TrackId))
            .equals((UserUploads::Table, UserUploads::TrackId)),
    )
    .join(
        JoinType::LeftJoin,
        ArtistAlbums::Table,
        Expr::col((Artists::Table, Artists::XataId))
            .equals((ArtistAlbums::Table, ArtistAlbums::ArtistId)),
    )
    .and_where(Expr::col((UserUploads::Table, UserUploads::UserId)).eq(user_id))
    .and_where(Expr::col((Artists::Table, Artists::Genres)).is_not_null())
    // Grouped and ordered by the output alias, which both backends accept.
    .group_by_col(GenreCol)
    .order_by(GenreCol, Order::Asc);

    stmt
}

/// The expression that yields one genre per row.
fn genre_expansion(dialect: Dialect) -> SimpleExpr {
    match dialect {
        // A set-returning function in the select list: Postgres expands the
        // row for each element.
        Dialect::Postgres => Expr::cust(r#"UNNEST("artists"."genres")"#),
        // The value column of the `json_each` table added to the FROM above.
        Dialect::Sqlite => Expr::col((GenreRows, JsonEachValue)).into(),
    }
}

/// The `json_each` table SQLite expands `artists.genres` through.
#[derive(Iden, Clone, Copy)]
#[iden = "genre_rows"]
struct GenreRows;

#[derive(Iden, Clone, Copy)]
#[iden = "value"]
struct JsonEachValue;

pub async fn get_songs_by_genre(
    db: &Db,
    user_id: &str,
    genre: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    let pool = db.replica();
    // Hand-rolling the projection here left out the BYO-storage columns that
    // were later added to `TrackWithUpload`, so every row failed to deserialize
    // and getSongsByGenre returned nothing at all. Use the canonical select,
    // which is also the one that guards the album/artist junction lookups.
    let tagged = Query::select()
        .expr(Expr::cust("1"))
        .from(ArtistTracks::Table)
        .join(
            JoinType::Join,
            Artists::Table,
            Expr::col((ArtistTracks::Table, ArtistTracks::ArtistId))
                .equals((Artists::Table, Artists::XataId)),
        )
        .and_where(
            Expr::col((ArtistTracks::Table, ArtistTracks::TrackId))
                .equals((Tracks::Table, Tracks::XataId)),
        )
        // `= ANY(text[])` on Postgres, a `json_each` walk on SQLite — one
        // helper, because the two have no common spelling.
        .and_where(pool.array_contains("artists.genres", genre))
        .take();

    let mut stmt = track_select(user_id);
    stmt.and_where(Expr::exists(tagged))
        .order_by((Tracks::Table, Tracks::Title), Order::Asc)
        .order_by((Tracks::Table, Tracks::XataId), Order::Asc)
        .limit(count.max(0) as u64)
        .offset(offset.max(0) as u64);

    Ok(sql::fetch_all(pool, &stmt).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rocksky_db::sea_query::{PostgresQueryBuilder, SqliteQueryBuilder};

    /// How an array becomes rows is the one thing the backends do completely
    /// differently, and both spellings are raw SQL — so they compile either
    /// way and fail only when run. This asserts the rendering, and
    /// `a_genre_listing_runs_on_sqlite` runs it.
    #[test]
    fn the_expansion_is_unnest_on_postgres_and_json_each_on_sqlite() {
        let pg = genre_expansion(Dialect::Postgres);
        let lite = genre_expansion(Dialect::Sqlite);

        let render = |expr: SimpleExpr, postgres: bool| {
            let query = Query::select().expr(expr).to_owned();
            if postgres {
                query.to_string(PostgresQueryBuilder)
            } else {
                query.to_string(SqliteQueryBuilder)
            }
        };

        assert!(render(pg, true).contains("UNNEST"));
        let lite = render(lite, false);
        assert!(lite.contains(r#""genre_rows"."value""#), "{lite}");
        assert!(!lite.contains("UNNEST"), "{lite}");
    }

    /// The whole listing, executed against a real SQLite — which is what
    /// catches a `text[]` or an `UNNEST` that survived into the SQLite path.
    /// A rendering assertion cannot: both dialects' SQL is valid *text*.
    #[tokio::test]
    async fn a_genre_listing_runs_on_sqlite() {
        let db = rocksky_db::connect_in_memory().await.unwrap();
        let handle = rocksky_db::Handle::from_backend(db);

        // No rows, so the interesting part is that it executes at all: the
        // query names json_each, an output-alias GROUP BY and four joins.
        let genres = get_genres(&handle, "rec_nobody").await.unwrap();
        assert!(genres.is_empty());
    }

    /// The genre *songs* listing does not run on SQLite yet.
    ///
    /// Not because of anything in this file — the containment filter is
    /// portable now — but because it builds on `track_select`, whose album and
    /// artist lookups are `JOIN LATERAL`. SQLite has no LATERAL, and the
    /// equivalent is a correlated scalar subquery per column, which is a
    /// rewrite of the projection every Subsonic endpoint shares rather than a
    /// change here.
    ///
    /// Ignored rather than deleted so the gap is visible and the test is ready
    /// when the projection is portable. Remove the attribute then.
    #[tokio::test]
    #[ignore = "track_select uses JOIN LATERAL, which SQLite does not support"]
    async fn a_genre_songs_listing_runs_on_sqlite() {
        let db = rocksky_db::connect_in_memory().await.unwrap();
        let handle = rocksky_db::Handle::from_backend(db);

        let songs = get_songs_by_genre(&handle, "rec_nobody", "rock", 10, 0)
            .await
            .unwrap();
        assert!(songs.is_empty());
    }
}
