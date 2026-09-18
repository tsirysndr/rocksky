use anyhow::Error;
use sea_query::{
    Alias, BinOper, CommonTableExpression, Expr, ExprTrait, Func, Iden, IntoIden, JoinType,
    NullOrdering, Order, OverStatement, Query, SelectStatement, SimpleExpr, WindowStatement,
    WithClause,
};

use crate::repo::track::{lower_eq, one_per_partition, unnumbered_key_expr, K};
use crate::schema::{AlbumTracks, Albums, ArtistAlbums, Artists, Tracks, UserUploads};
use crate::sql;
use crate::xata::album::AlbumWithStats;
use rocksky_db::models::{array_contains_expr, cast_int_expr, cast_timestamp_expr};
use rocksky_db::Dialect;
use rocksky_db::Handle as Db;

#[derive(Iden, Clone, Copy)]
#[iden = "mine"]
enum Mine {
    Table,
    #[iden = "track_id"]
    TrackId,
    #[iden = "uploaded_at"]
    UploadedAt,
    #[iden = "album"]
    Album,
    #[iden = "album_artist"]
    AlbumArtist,
    #[iden = "duration"]
    Duration,
    #[iden = "disc_number"]
    DiscNumber,
    #[iden = "track_number"]
    TrackNumber,
    #[iden = "xata_createdat"]
    XataCreatedat,
    #[iden = "unnumbered"]
    Unnumbered,
}

#[derive(Iden, Clone, Copy)]
#[iden = "album_members"]
enum AlbumMembers {
    Table,
    #[iden = "album_id"]
    AlbumId,
    #[iden = "duration"]
    Duration,
    #[iden = "uploaded_at"]
    UploadedAt,
}

#[derive(Iden, Clone, Copy)]
#[iden = "album_stats"]
enum AlbumStats {
    Table,
    #[iden = "album_id"]
    AlbumId,
    #[iden = "song_count"]
    SongCount,
    #[iden = "total_duration"]
    TotalDuration,
    #[iden = "created_at"]
    CreatedAt,
}

#[derive(Iden, Clone, Copy)]
#[iden = "deduped"]
enum Deduped {
    Table,
    #[iden = "dedup_rank"]
    DedupRank,
    #[iden = "xata_id"]
    XataId,
    #[iden = "title"]
    Title,
    #[iden = "artist"]
    Artist,
    #[iden = "year"]
    Year,
    #[iden = "album_art"]
    AlbumArt,
    #[iden = "uri"]
    Uri,
    #[iden = "song_count"]
    SongCount,
    #[iden = "total_duration"]
    TotalDuration,
    #[iden = "created_at"]
    CreatedAt,
    #[iden = "artist_id"]
    ArtistId,
}

/// The lateral that picks one track per position on the record.
#[derive(Iden, Clone, Copy)]
#[iden = "member"]
enum Member {
    Table,
    #[iden = "duration"]
    Duration,
    #[iden = "uploaded_at"]
    UploadedAt,
    // Carried out of the subquery so the correlation with `albums` can live in
    // the join's ON clause instead of making it lateral.
    #[iden = "album_id"]
    AlbumId,
    #[iden = "album"]
    Album,
    #[iden = "album_artist"]
    AlbumArtist,
}

#[derive(Iden, Clone, Copy)]
#[iden = "m"]
enum M {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "s"]
enum S {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "uu"]
enum Uu {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "aa"]
enum Aa {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "al"]
enum Al {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "atr"]
enum Atr {
    Table,
    #[iden = "album_id"]
    AlbumId,
}

#[derive(Iden, Clone, Copy)]
#[iden = "atr0"]
enum Atr0 {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "ar"]
enum Ar {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "ag"]
enum Ag {
    Table,
}

/// A `(SELECT … LIMIT 1)` used as a value in the select list.
fn scalar(select: SelectStatement) -> SimpleExpr {
    SimpleExpr::SubQuery(None, Box::new(select.into_sub_query_statement()))
}

/// `(SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1)`
fn first_artist_id() -> SimpleExpr {
    scalar(
        Query::select()
            .column((Aa::Table, ArtistAlbums::ArtistId))
            .from_as(ArtistAlbums::Table, Aa::Table)
            .and_where(
                Expr::col((Aa::Table, ArtistAlbums::AlbumId))
                    .equals((Albums::Table, Albums::XataId)),
            )
            .limit(1)
            .take(),
    )
}

/// The caller's albums, with their per-album stats, computed in one pass.
///
/// This walks outward from `user_uploads` rather than inward from `albums`.
/// The catalogue tables are global — every scrobble by every Rocksky user lands
/// in them, so `albums` holds 171k rows and `tracks` 547k — while everyone's
/// uploads put together are 10k rows. The listing used to scan `albums` and
/// evaluate five correlated subqueries per surviving row (song count, duration,
/// created_at, the artist id, and the song count *again* inside the dedup
/// window), then rank every one of them before LIMIT could apply. That is work
/// proportional to the catalogue, not to the library being listed: ~18s for the
/// largest library, and no cheaper for page 1 than for the last page.
///
/// Aggregating the user's uploads once, up front, does the same job in a single
/// GROUP BY and hands the window function a few hundred rows instead of
/// thousands. Byte-identical output, ~0.5s.
///
/// MATERIALIZED is load-bearing: inlined, the planner is free to push these
/// back into the outer query per-row and rebuild the shape this avoids.
///
/// `lower(al.title) = lower(m.album) AND lower(al.artist) = lower(m.album_artist)`
/// stays on the junction join: album_tracks has polluted entries linking tracks
/// to albums they don't belong to (a different release with the same title from
/// another user, stale links from re-ingestion), and without the guard a single
/// stray row puts a stranger's album in the caller's library. See commit
/// ffcbfc3b.
///
/// The stats must count each position on the record once, and three things each
/// used to multiply them — the grid said 15 songs / 97 min where the album page
/// said 14 / 48. `mine` is DISTINCT ON the track (a user can have several
/// uploads of one track, from re-uploading); the junction lookup is DISTINCT (a
/// track can have several `album_tracks` rows for one album, from re-ingestion);
/// and `album_members` is DISTINCT ON the slot (a re-upload whose tags differ at
/// all hashes to a whole new `tracks` row for the same track number). The slot
/// keeps the oldest track and `mine` the earliest upload, matching what
/// `member_tracks` and `get_tracks_by_album` pick, so the three agree.
fn album_stats_cte(dialect: Dialect, user_id: &str) -> WithClause {
    let mut mine = Query::select();
    mine.columns([
        (Uu::Table, UserUploads::TrackId),
        (Uu::Table, UserUploads::UploadedAt),
    ])
    .columns([
        (Alias::new("t"), Tracks::Album),
        (Alias::new("t"), Tracks::AlbumArtist),
        (Alias::new("t"), Tracks::Duration),
        (Alias::new("t"), Tracks::DiscNumber),
        (Alias::new("t"), Tracks::TrackNumber),
        (Alias::new("t"), Tracks::XataCreatedat),
    ])
    .expr_as(
        Expr::case(
            Expr::col((Alias::new("t"), Tracks::TrackNumber)).is_null(),
            Expr::col((Alias::new("t"), Tracks::XataId)),
        )
        .finally(Expr::val("")),
        K::Unnumbered,
    )
    .from_as(UserUploads::Table, Uu::Table)
    .join_as(
        JoinType::Join,
        Tracks::Table,
        Alias::new("t"),
        Expr::col((Alias::new("t"), Tracks::XataId)).equals((Uu::Table, UserUploads::TrackId)),
    )
    .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id));

    // One upload per track, the earliest — `DISTINCT ON (track_id)` with that
    // ORDER BY, which is Postgres-only. The window says the same thing.
    let mine = one_per_partition(
        mine,
        WindowStatement::partition_by((Uu::Table, UserUploads::TrackId))
            .order_by((Uu::Table, UserUploads::UploadedAt), Order::Asc)
            .order_by((Uu::Table, UserUploads::XataId), Order::Asc)
            .to_owned(),
        [
            Mine::TrackId.into_iden(),
            Mine::UploadedAt.into_iden(),
            Mine::Album.into_iden(),
            Mine::AlbumArtist.into_iden(),
            Mine::Duration.into_iden(),
            Mine::DiscNumber.into_iden(),
            Mine::TrackNumber.into_iden(),
            Mine::XataCreatedat.into_iden(),
            Mine::Unnumbered.into_iden(),
        ],
    );

    let mut album_members = Query::select();
    album_members
        .expr_as(Expr::col((Atr::Table, AlbumTracks::AlbumId)), Atr::AlbumId)
        .columns([(M::Table, Mine::Duration), (M::Table, Mine::UploadedAt)])
        .from_as(Mine::Table, M::Table)
        // A plain join, where this was a correlated `SELECT DISTINCT album_id`
        // joined laterally. The DISTINCT was there so duplicate `album_tracks`
        // rows for one (album, track) pair could not multiply the stats — and
        // it is redundant now: duplicates land in the same partition below,
        // where only the first row survives. One dedup instead of two.
        .join_as(
            JoinType::Join,
            AlbumTracks::Table,
            Atr::Table,
            Expr::col((Atr::Table, AlbumTracks::TrackId)).equals((M::Table, Mine::TrackId)),
        )
        .join_as(
            JoinType::Join,
            Albums::Table,
            Al::Table,
            Expr::col((Al::Table, Albums::XataId))
                .equals((Atr::Table, Atr::AlbumId))
                .and(lower_eq(
                    Expr::col((Al::Table, Albums::Title)),
                    Expr::col((M::Table, Mine::Album)),
                ))
                .and(lower_eq(
                    Expr::col((Al::Table, Albums::Artist)),
                    Expr::col((M::Table, Mine::AlbumArtist)),
                )),
        );

    // One track per (album, slot), the oldest — the re-upload whose tags
    // differ at all hashes to a whole new `tracks` row for the same track
    // number. Was `DISTINCT ON` over the same key.
    let album_members = one_per_partition(
        album_members,
        WindowStatement::partition_by((Atr::Table, AlbumTracks::AlbumId))
            .partition_by((M::Table, Mine::DiscNumber))
            .partition_by((M::Table, Mine::TrackNumber))
            .partition_by((M::Table, Mine::Unnumbered))
            .order_by((M::Table, Mine::XataCreatedat), Order::Asc)
            .order_by((M::Table, Mine::TrackId), Order::Asc)
            .to_owned(),
        [
            Atr::AlbumId.into_iden(),
            Mine::Duration.into_iden(),
            Mine::UploadedAt.into_iden(),
        ],
    );

    let album_stats = Query::select()
        .column(AlbumMembers::AlbumId)
        .expr_as(Func::count(Expr::cust("*")), AlbumStats::SongCount)
        .expr_as(
            cast_int_expr(dialect, Func::sum(Expr::col(AlbumMembers::Duration))),
            AlbumStats::TotalDuration,
        )
        .expr_as(
            // On SQLite `CAST(… AS timestamptz)` is a no-op with no type
            // affinity and truncates the ISO text to its year.
            cast_timestamp_expr(dialect, Func::min(Expr::col(AlbumMembers::UploadedAt))),
            AlbumStats::CreatedAt,
        )
        .from(AlbumMembers::Table)
        .group_by_col(AlbumMembers::AlbumId)
        .take();

    WithClause::new()
        .cte(
            CommonTableExpression::new()
                .query(mine)
                .table_name(Mine::Table)
                .materialized(true)
                .to_owned(),
        )
        .cte(
            CommonTableExpression::new()
                .query(album_members)
                .table_name(AlbumMembers::Table)
                .materialized(true)
                .to_owned(),
        )
        .cte(
            CommonTableExpression::new()
                .query(album_stats)
                .table_name(AlbumStats::Table)
                .materialized(true)
                .to_owned(),
        )
        .to_owned()
}

/// One row per track ON the record, for the header's song count / running time.
///
/// Three things each used to multiply these rows, and `SUM(duration)` reported
/// "I'M REALLY LIKE THAT" as 97 minutes instead of 51: a track can have several
/// `user_uploads` rows for one user (re-uploading), several `album_tracks` rows
/// for one album (re-ingestion), and — when a re-upload's tags differ at all —
/// a whole second `tracks` row for the same position on the record. EXISTS
/// handles the first two; DISTINCT ON the slot handles the third, keeping the
/// oldest row so the header agrees with `get_tracks_by_album`.
fn member_tracks(query: &mut SelectStatement, user_id: &str) {
    let earliest_upload = scalar(
        Query::select()
            .expr(Func::min(Expr::col((Uu::Table, UserUploads::UploadedAt))))
            .from_as(UserUploads::Table, Uu::Table)
            .and_where(
                Expr::col((Uu::Table, UserUploads::TrackId))
                    .equals((Tracks::Table, Tracks::XataId)),
            )
            .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
            .take(),
    );

    let uploaded_by_caller = Query::select()
        .expr(Expr::cust("1"))
        .from_as(UserUploads::Table, Uu::Table)
        .and_where(
            Expr::col((Uu::Table, UserUploads::TrackId)).equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
        .take();

    // One row per position on the record, as a *plain* join rather than a
    // correlated `JOIN LATERAL`, which SQLite has no form of.
    //
    // What made it lateral was the correlation with the outer `albums` row:
    // the album id, and the title/artist agreeing case-insensitively with the
    // track's own. So the subquery exposes those three columns and the
    // correlation moves into the join's ON clause, where a plain join can
    // express it.
    //
    // The album id now comes from a join on `album_tracks` instead of an
    // EXISTS, which by itself would re-admit the duplicate junction rows that
    // EXISTS was avoiding — so `album_id` joins the partition key below, where
    // duplicates collapse into one row. Same dedup, one mechanism.
    let mut member = Query::select();
    member
        .columns([
            (Tracks::Table, Tracks::XataId),
            (Tracks::Table, Tracks::Duration),
        ])
        .expr_as(earliest_upload, Member::UploadedAt)
        .expr_as(
            Expr::col((Atr::Table, AlbumTracks::AlbumId)),
            Member::AlbumId,
        )
        .expr_as(Expr::col((Tracks::Table, Tracks::Album)), Member::Album)
        .expr_as(
            Expr::col((Tracks::Table, Tracks::AlbumArtist)),
            Member::AlbumArtist,
        )
        .from(Tracks::Table)
        .join_as(
            JoinType::Join,
            AlbumTracks::Table,
            Atr::Table,
            Expr::col((Atr::Table, AlbumTracks::TrackId)).equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(Expr::exists(uploaded_by_caller));

    let member = one_per_partition(
        member,
        WindowStatement::partition_by((Atr::Table, AlbumTracks::AlbumId))
            .partition_by((Tracks::Table, Tracks::DiscNumber))
            .partition_by((Tracks::Table, Tracks::TrackNumber))
            // Unnumbered tracks keep their row id in the key, so two of them
            // never collapse into each other.
            .add_partition_by(unnumbered_key_expr(Tracks::Table))
            // Oldest wins, so the header agrees with `get_tracks_by_album`.
            .order_by((Tracks::Table, Tracks::XataCreatedat), Order::Asc)
            .order_by((Tracks::Table, Tracks::XataId), Order::Asc)
            .to_owned(),
        [
            Tracks::XataId.into_iden(),
            Tracks::Duration.into_iden(),
            Member::UploadedAt.into_iden(),
            Member::AlbumId.into_iden(),
            Member::Album.into_iden(),
            Member::AlbumArtist.into_iden(),
        ],
    );

    query.join_subquery(
        JoinType::Join,
        member,
        Member::Table,
        Expr::col((Member::Table, Member::AlbumId))
            .equals((Albums::Table, Albums::XataId))
            .and(lower_eq(
                Expr::col((Member::Table, Member::Album)),
                Expr::col((Albums::Table, Albums::Title)),
            ))
            .and(lower_eq(
                Expr::col((Member::Table, Member::AlbumArtist)),
                Expr::col((Albums::Table, Albums::Artist)),
            )),
    );
}

/// The `albums` columns plus the aggregates computed over `member`, and the
/// GROUP BY they need. Shared by every lookup that drives off `member_tracks`.
fn album_with_member_stats(dialect: Dialect, query: &mut SelectStatement, artist_id: SimpleExpr) {
    query
        .columns([
            (Albums::Table, Albums::XataId),
            (Albums::Table, Albums::Title),
            (Albums::Table, Albums::Artist),
            (Albums::Table, Albums::Year),
            (Albums::Table, Albums::AlbumArt),
            (Albums::Table, Albums::Uri),
        ])
        .expr_as(Func::count(Expr::cust("*")), AlbumStats::SongCount)
        .expr_as(
            cast_int_expr(
                dialect,
                Func::sum(Expr::col((Member::Table, Member::Duration))),
            ),
            AlbumStats::TotalDuration,
        )
        .expr_as(
            // Not `CAST(… AS timestamptz)` unconditionally: on SQLite that
            // is a no-op with no type affinity, and the ISO text is truncated
            // to its leading year — a silently wrong date rather than an error.
            cast_timestamp_expr(
                dialect,
                Func::min(Expr::col((Member::Table, Member::UploadedAt))),
            ),
            AlbumStats::CreatedAt,
        )
        .expr_as(artist_id, Deduped::ArtistId);
}

fn group_by_album(query: &mut SelectStatement) {
    query.group_by_columns([
        (Albums::Table, Albums::XataId),
        (Albums::Table, Albums::Title),
        (Albums::Table, Albums::Artist),
        (Albums::Table, Albums::Year),
        (Albums::Table, Albums::AlbumArt),
        (Albums::Table, Albums::Uri),
    ]);
}

pub async fn get_albums_by_artist(
    db: &Db,
    artist_id: &str,
    user_id: &str,
) -> Result<Vec<AlbumWithStats>, Error> {
    Ok(sql::fetch_all(
        db.replica(),
        &albums_by_artist_stmt(db.replica().dialect(), artist_id, user_id),
    )
    .await?)
}

fn albums_by_artist_stmt(dialect: Dialect, artist_id: &str, user_id: &str) -> SelectStatement {
    let mut stmt = Query::select();
    album_with_member_stats(
        dialect,
        &mut stmt,
        Expr::val(artist_id).cast_as(Alias::new("text")),
    );
    stmt.from(Albums::Table).join(
        JoinType::Join,
        ArtistAlbums::Table,
        Expr::col((Albums::Table, Albums::XataId))
            .equals((ArtistAlbums::Table, ArtistAlbums::AlbumId)),
    );
    member_tracks(&mut stmt, user_id);
    stmt.and_where(Expr::col((ArtistAlbums::Table, ArtistAlbums::ArtistId)).eq(artist_id));
    group_by_album(&mut stmt);
    stmt.order_by_with_nulls(
        (Albums::Table, Albums::Year),
        Order::Desc,
        NullOrdering::Last,
    )
    .order_by((Albums::Table, Albums::XataId), Order::Asc);

    stmt
}

pub async fn get_album_by_id(
    db: &Db,
    album_id: &str,
    user_id: &str,
) -> Result<Option<AlbumWithStats>, Error> {
    album_by(
        db,
        Expr::col((Albums::Table, Albums::XataId)).eq(album_id),
        user_id,
    )
    .await
}

/// Look an album up by the AT-URI of its `app.rocksky.album` record.
///
/// The Navidrome id is local to this server, so anything that has to name an
/// album durably — an NFC tag, a share link, another client's record — carries
/// the record URI instead. `albums.uri` is unique, so this is a point lookup.
pub async fn get_album_by_uri(
    db: &Db,
    uri: &str,
    user_id: &str,
) -> Result<Option<AlbumWithStats>, Error> {
    album_by(db, Expr::col((Albums::Table, Albums::Uri)).eq(uri), user_id).await
}

async fn album_by(
    db: &Db,
    predicate: SimpleExpr,
    user_id: &str,
) -> Result<Option<AlbumWithStats>, Error> {
    Ok(sql::fetch_optional(
        db.replica(),
        &album_by_stmt(db.replica().dialect(), predicate, user_id),
    )
    .await?)
}

fn album_by_stmt(dialect: Dialect, predicate: SimpleExpr, user_id: &str) -> SelectStatement {
    let mut stmt = Query::select();
    album_with_member_stats(dialect, &mut stmt, first_artist_id());
    stmt.from(Albums::Table);
    member_tracks(&mut stmt, user_id);
    stmt.and_where(predicate);
    group_by_album(&mut stmt);
    stmt
}

pub async fn get_album_list(
    db: &Db,
    user_id: &str,
    list_type: &str,
    count: i64,
    offset: i64,
    from_year: Option<i32>,
    to_year: Option<i32>,
    genre: Option<&str>,
) -> Result<Vec<AlbumWithStats>, Error> {
    let stmt = album_list_stmt(
        db.replica().dialect(),
        user_id,
        list_type,
        count,
        offset,
        from_year,
        to_year,
        genre,
    );
    Ok(sql::fetch_all(db.replica(), &stmt).await?)
}

#[allow(clippy::too_many_arguments)]
fn album_list_stmt(
    dialect: Dialect,
    user_id: &str,
    list_type: &str,
    count: i64,
    offset: i64,
    from_year: Option<i32>,
    to_year: Option<i32>,
    genre: Option<&str>,
) -> sea_query::WithQuery {
    let mut inner = dedup_ranked_albums();

    if list_type == "byYear" {
        let from = from_year.unwrap_or(0);
        let to = to_year.unwrap_or(9999);
        inner.and_where(
            Expr::col((Albums::Table, Albums::Year)).between(from.min(to), from.max(to)),
        );
    }

    // byGenre filter — applied via EXISTS so we don't need a top-level join.
    if list_type == "byGenre" {
        if let Some(g) = genre {
            inner.and_where(Expr::exists(
                Query::select()
                    .expr(Expr::cust("1"))
                    .from_as(ArtistAlbums::Table, Ag::Table)
                    .join_as(
                        JoinType::Join,
                        Artists::Table,
                        Ar::Table,
                        Expr::col((Ag::Table, ArtistAlbums::ArtistId))
                            .equals((Ar::Table, Artists::XataId)),
                    )
                    .and_where(
                        Expr::col((Ag::Table, ArtistAlbums::AlbumId))
                            .equals((Albums::Table, Albums::XataId)),
                    )
                    // `= ANY(text[])` on Postgres, a `json_each` walk on
                    // SQLite — the storage differs, so there is no one
                    // spelling.
                    .and_where(array_contains_expr(dialect, "ar.genres", g))
                    .take(),
            ));
        }
    }

    let mut outer = deduped_projection(inner);

    // Every branch ends in xata_id: these paginate with LIMIT/OFFSET, and the
    // sort keys are far from unique. user_uploads.uploaded_at defaults to now(),
    // which is the *transaction* timestamp, so a bulk upload gives every album
    // in it the same created_at. Postgres may then order tied rows differently
    // per query, and OFFSET pages silently overlap and skip — albums the user
    // uploaded never appear at all. "random" is exempt: it has no stable order
    // by definition.
    match list_type {
        "alphabeticalByName" => {
            outer
                .order_by(Deduped::Title, Order::Asc)
                .order_by(Deduped::XataId, Order::Asc);
        }
        "alphabeticalByArtist" => {
            outer
                .order_by(Deduped::Artist, Order::Asc)
                .order_by(Deduped::XataId, Order::Asc);
        }
        "random" => {
            outer.order_by_expr(Func::random().into(), Order::Asc);
        }
        "byYear" => {
            let ascending = from_year.unwrap_or(0) <= to_year.unwrap_or(9999);
            outer
                .order_by_with_nulls(
                    Deduped::Year,
                    if ascending { Order::Asc } else { Order::Desc },
                    NullOrdering::Last,
                )
                .order_by(Deduped::XataId, Order::Asc);
        }
        // "newest", "recent" and anything unrecognised.
        _ => {
            outer
                .order_by_with_nulls(Deduped::CreatedAt, Order::Desc, NullOrdering::Last)
                .order_by(Deduped::XataId, Order::Asc);
        }
    }

    outer
        .limit(count.max(0) as u64)
        .offset(offset.max(0) as u64);

    outer.with(album_stats_cte(dialect, user_id))
}

pub async fn search_albums(
    db: &Db,
    user_id: &str,
    query: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<AlbumWithStats>, Error> {
    let stmt = search_albums_stmt(db.replica().dialect(), user_id, query, count, offset);
    Ok(sql::fetch_all(db.replica(), &stmt).await?)
}

fn search_albums_stmt(
    dialect: Dialect,
    user_id: &str,
    query: &str,
    count: i64,
    offset: i64,
) -> sea_query::WithQuery {
    // Same shape as get_album_list — see `album_stats_cte` for why it is built
    // this way, why the junction guard has to stay, and what the dedup is for.
    let mut inner = dedup_ranked_albums();
    inner.and_where(
        Func::lower(Expr::col((Albums::Table, Albums::Title))).binary(
            BinOper::Like,
            Func::lower(Expr::val(format!("%{}%", query))),
        ),
    );

    let mut outer = deduped_projection(inner);
    outer
        .order_by(Deduped::Title, Order::Asc)
        .order_by(Deduped::XataId, Order::Asc)
        .limit(count.max(0) as u64)
        .offset(offset.max(0) as u64);

    outer.with(album_stats_cte(dialect, user_id))
}

/// Ingestion stores album_artist verbatim, so featured-artist tracks
/// ("Clean Bandit, Zara Larsson") create separate `albums` rows from the
/// canonical album ("Clean Bandit"). Rank by (title, first comma-separated
/// artist token) so the outer query can keep the row with the most tracks.
fn dedup_ranked_albums() -> SelectStatement {
    Query::select()
        .columns([
            (Albums::Table, Albums::XataId),
            (Albums::Table, Albums::Title),
            (Albums::Table, Albums::Artist),
            (Albums::Table, Albums::Year),
            (Albums::Table, Albums::AlbumArt),
            (Albums::Table, Albums::Uri),
        ])
        .columns([
            (S::Table, AlbumStats::SongCount),
            (S::Table, AlbumStats::TotalDuration),
            (S::Table, AlbumStats::CreatedAt),
        ])
        .expr_as(first_artist_id(), Deduped::ArtistId)
        .expr_window_as(
            Func::cust(Alias::new("ROW_NUMBER")),
            WindowStatement::new()
                .partition_by_customs([
                    r#"LOWER("albums"."title")"#,
                    r#"LOWER(TRIM(SPLIT_PART("albums"."artist", ',', 1)))"#,
                ])
                .order_by((S::Table, AlbumStats::SongCount), Order::Desc)
                .order_by_with_nulls(
                    (Albums::Table, Albums::Year),
                    Order::Desc,
                    NullOrdering::Last,
                )
                .order_by((Albums::Table, Albums::XataId), Order::Asc)
                .to_owned(),
            Deduped::DedupRank,
        )
        .from_as(AlbumStats::Table, S::Table)
        .join(
            JoinType::Join,
            Albums::Table,
            Expr::col((Albums::Table, Albums::XataId)).equals((S::Table, AlbumStats::AlbumId)),
        )
        .take()
}

/// `SELECT … FROM (<ranked>) deduped WHERE dedup_rank = 1`.
fn deduped_projection(inner: SelectStatement) -> SelectStatement {
    Query::select()
        .columns([
            Deduped::XataId,
            Deduped::Title,
            Deduped::Artist,
            Deduped::Year,
            Deduped::AlbumArt,
            Deduped::Uri,
            Deduped::SongCount,
            Deduped::TotalDuration,
            Deduped::CreatedAt,
            Deduped::ArtistId,
        ])
        .from_subquery(inner, Deduped::Table)
        .and_where(Expr::col(Deduped::DedupRank).eq(1))
        .take()
}

/// Fetch albums matching a list of (title, artist) pairs returned by Typesense.
pub async fn get_albums_by_names(
    db: &Db,
    user_id: &str,
    pairs: &[(String, String)],
) -> Result<Vec<AlbumWithStats>, Error> {
    if pairs.is_empty() {
        return Ok(vec![]);
    }
    Ok(sql::fetch_all(
        db.replica(),
        &albums_by_names_stmt(db.replica().dialect(), user_id, pairs),
    )
    .await?)
}

fn albums_by_names_stmt(
    dialect: Dialect,
    user_id: &str,
    pairs: &[(String, String)],
) -> SelectStatement {
    let titles: Vec<String> = pairs.iter().map(|(t, _)| t.clone()).collect();
    let artists: Vec<String> = pairs.iter().map(|(_, a)| a.clone()).collect();

    let mut stmt = Query::select();
    album_with_member_stats(dialect, &mut stmt, first_artist_id());
    stmt.from(Albums::Table);
    member_tracks(&mut stmt, user_id);
    stmt.and_where(Expr::col((Albums::Table, Albums::Title)).is_in(titles))
        .and_where(Expr::col((Albums::Table, Albums::Artist)).is_in(artists));
    group_by_album(&mut stmt);
    stmt.order_by((Albums::Table, Albums::Title), Order::Asc)
        .order_by((Albums::Table, Albums::XataId), Order::Asc);

    stmt
}

pub async fn get_album_art(db: &Db, album_id: &str) -> Result<Option<String>, Error> {
    let pool = db.replica();
    let stmt = Query::select()
        .column(Albums::AlbumArt)
        .from(Albums::Table)
        .and_where(Expr::col(Albums::XataId).eq(album_id))
        .take();

    Ok(sql::fetch_scalar_optional::<Option<String>>(pool, &stmt)
        .await?
        .flatten())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_query::PostgresQueryBuilder;
    use sea_query_binder::SqlxBinder;

    /// Inlined, the planner rebuilds the catalogue-wide shape these CTEs exist
    /// to avoid — so MATERIALIZED is part of the query, not a hint.
    #[test]
    fn the_stats_ctes_stay_materialized() {
        let (sql, _) = album_list_stmt(
            Dialect::Postgres,
            "rec_user",
            "newest",
            20,
            0,
            None,
            None,
            None,
        )
        .build_sqlx(PostgresQueryBuilder);
        assert_eq!(sql.matches("AS  MATERIALIZED").count(), 3);
        assert!(sql.contains(r#"WITH "mine" AS  MATERIALIZED"#));
    }

    /// The genre filter on SQLite, where `= ANY` and `text[]` do not exist.
    #[test]
    fn the_genre_filter_walks_json_on_sqlite() {
        let (sql, values) = album_list_stmt(
            Dialect::Sqlite,
            "rec_user",
            "byGenre",
            20,
            0,
            None,
            None,
            Some("shoegaze"),
        )
        .build_sqlx(sea_query::SqliteQueryBuilder);

        assert!(sql.contains("json_each(ar.genres)"), "{sql}");
        assert!(!sql.contains("ANY"), "{sql}");
        assert!(!sql.contains("text[]"), "{sql}");
        // Still bound, not spliced.
        assert!(!sql.contains("shoegaze"));
        assert!(values
            .0
             .0
            .iter()
            .any(|v| matches!(v, sea_query::Value::String(Some(s)) if **s == *"shoegaze")));
    }

    #[test]
    fn the_genre_filter_binds_its_value() {
        let (sql, values) = album_list_stmt(
            Dialect::Postgres,
            "rec_user",
            "byGenre",
            20,
            0,
            None,
            None,
            Some("shoegaze"),
        )
        .build_sqlx(PostgresQueryBuilder);
        // Containment against a `text[]`, through the shared helper — so
        // SQLite gets a `json_each` walk from the same call site.
        assert!(sql.contains("= ANY(ar.genres)"), "{sql}");
        assert!(!sql.contains("shoegaze"));
        assert!(values
            .0
             .0
            .iter()
            .any(|v| matches!(v, sea_query::Value::String(Some(s)) if **s == *"shoegaze")));
    }

    /// Every ordering ends in xata_id: the sort keys are far from unique, and
    /// without a tiebreak OFFSET pages overlap and skip.
    #[test]
    fn every_ordering_but_random_ends_in_the_row_id() {
        for list_type in [
            "newest",
            "recent",
            "alphabeticalByName",
            "alphabeticalByArtist",
            "byYear",
            "byGenre",
            "unrecognised",
        ] {
            let (sql, _) = album_list_stmt(
                Dialect::Postgres,
                "rec_user",
                list_type,
                20,
                0,
                None,
                None,
                Some("g"),
            )
            .build_sqlx(PostgresQueryBuilder);
            let order = &sql[sql.rfind("ORDER BY").unwrap()..];
            assert!(
                order.contains(r#""xata_id" ASC"#),
                "{list_type} does not tiebreak on the row id: {order}"
            );
        }
        let (sql, _) = album_list_stmt(
            Dialect::Postgres,
            "rec_user",
            "random",
            20,
            0,
            None,
            None,
            None,
        )
        .build_sqlx(PostgresQueryBuilder);
        assert!(sql[sql.rfind("ORDER BY").unwrap()..].contains("RANDOM()"));
    }

    /// The year range is normalised, so a reversed from/to still selects rows.
    #[test]
    fn a_reversed_year_range_is_ordered_before_it_binds() {
        let (_, values) = album_list_stmt(
            Dialect::Postgres,
            "rec_user",
            "byYear",
            20,
            0,
            Some(1999),
            Some(1990),
            None,
        )
        .build_sqlx(PostgresQueryBuilder);
        let ints: Vec<i32> = values
            .0
             .0
            .iter()
            .filter_map(|v| match v {
                sea_query::Value::Int(Some(i)) => Some(*i),
                _ => None,
            })
            .collect();
        assert!(ints.windows(2).any(|w| w == [1990, 1999]));
    }
}

/// The album statistics, executed against a real SQLite.
///
/// This is the query the "15 songs / 97 min" bugs lived in: three different
/// duplicate shapes each used to multiply the counts, and the rules guarding
/// them were `DISTINCT ON` and a correlated `JOIN LATERAL`. Both are gone, so
/// the rules are re-checked by seeding those shapes and reading the numbers.
#[cfg(test)]
mod sqlite_behaviour {
    use super::*;
    use rocksky_db::{new_id, Backend, Handle};

    async fn insert(db: &Backend, table: &str, values: &[(&str, &str)]) {
        let mut stmt = Query::insert();
        stmt.into_table(Alias::new(table))
            .columns(values.iter().map(|(c, _)| Alias::new(*c)))
            .values_panic(values.iter().map(|(_, v)| (*v).into()));
        db.execute(&stmt).await.unwrap();
    }

    struct Fixture {
        handle: Handle,
        user: String,
        album: String,
        artist: String,
    }

    async fn fixture() -> Fixture {
        let db = rocksky_db::connect_in_memory().await.unwrap();

        let user = new_id();
        insert(
            &db,
            "users",
            &[
                ("xata_id", &user),
                ("did", "did:plc:alice"),
                ("handle", "alice.test"),
                ("avatar", ""),
            ],
        )
        .await;

        let artist = new_id();
        insert(
            &db,
            "artists",
            &[
                ("xata_id", &artist),
                ("name", "Kate Bush"),
                ("sha256", &new_id()),
            ],
        )
        .await;

        let album = new_id();
        insert(
            &db,
            "albums",
            &[
                ("xata_id", &album),
                ("title", "Hounds of Love"),
                ("artist", "Kate Bush"),
                ("sha256", &new_id()),
            ],
        )
        .await;
        insert(
            &db,
            "artist_albums",
            &[
                ("xata_id", &new_id()),
                ("artist_id", &artist),
                ("album_id", &album),
            ],
        )
        .await;

        Fixture {
            handle: Handle::from_backend(db),
            user,
            album,
            artist,
        }
    }

    /// Adds a track on the album, with one upload, returning its id.
    async fn add_track(
        fx: &Fixture,
        title: &str,
        track_number: Option<&str>,
        duration_ms: &str,
        created_at: &str,
    ) -> String {
        let db = fx.handle.primary();
        let track = new_id();
        let mut values = vec![
            ("xata_id", track.as_str()),
            ("title", title),
            ("artist", "Kate Bush"),
            ("album_artist", "Kate Bush"),
            ("album", "Hounds of Love"),
            ("duration", duration_ms),
            ("sha256", track.as_str()),
            ("xata_createdat", created_at),
        ];
        if let Some(n) = track_number {
            values.push(("track_number", n));
        }
        insert(db, "tracks", &values).await;
        insert(
            db,
            "album_tracks",
            &[
                ("xata_id", &new_id()),
                ("album_id", &fx.album),
                ("track_id", &track),
            ],
        )
        .await;
        add_upload(fx, &track, "2026-01-01T00:00:00.000Z").await;
        track
    }

    async fn add_upload(fx: &Fixture, track: &str, uploaded_at: &str) {
        insert(
            fx.handle.primary(),
            "user_uploads",
            &[
                ("xata_id", &new_id()),
                ("user_id", &fx.user),
                ("track_id", track),
                ("r2_key", &format!("key-{}", new_id())),
                ("mime_type", "audio/flac"),
                ("file_size", "1000"),
                ("original_filename", "t.flac"),
                ("uploaded_at", uploaded_at),
            ],
        )
        .await;
    }

    /// Two tracks, one of them uploaded twice, and a second `tracks` row for
    /// one of the slots. The header must read 2 songs and their two durations
    /// — not 3 or 4 of either.
    #[tokio::test]
    async fn the_stats_count_each_slot_once() {
        let fx = fixture().await;

        let first = add_track(
            &fx,
            "Running Up That Hill",
            Some("1"),
            "300000",
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        add_track(
            &fx,
            "Hounds of Love",
            Some("2"),
            "200000",
            "2026-01-01T00:00:00.000Z",
        )
        .await;

        // A re-upload of track 1.
        add_upload(&fx, &first, "2026-06-01T00:00:00.000Z").await;
        // A re-upload whose tags differed, so it became a second `tracks` row
        // on the same slot.
        add_track(
            &fx,
            "Running Up That Hil",
            Some("1"),
            "999999",
            "2026-09-01T00:00:00.000Z",
        )
        .await;

        let albums = get_albums_by_artist(&fx.handle, &fx.artist, &fx.user)
            .await
            .unwrap();
        assert_eq!(albums.len(), 1, "one album");
        let album = &albums[0];
        assert_eq!(album.song_count, 2, "two positions on the record");
        assert_eq!(
            album.total_duration,
            Some(500_000),
            "the two kept tracks' durations, in ms"
        );
        // The oldest of the two spellings is the one kept, so the duration
        // above is 300000 + 200000 rather than 999999 + 200000.
        assert!(album.created_at.is_some(), "the date has to decode");
    }

    /// `get_album_by_id` goes through the same joins, and is what the album
    /// page reads.
    #[tokio::test]
    async fn one_album_by_id_agrees_with_the_listing() {
        let fx = fixture().await;
        add_track(
            &fx,
            "Cloudbusting",
            Some("5"),
            "300000",
            "2026-01-01T00:00:00.000Z",
        )
        .await;

        let one = get_album_by_id(&fx.handle, &fx.album, &fx.user)
            .await
            .unwrap()
            .expect("the album");
        assert_eq!(one.song_count, 1);
        assert_eq!(one.total_duration, Some(300_000));
        assert_eq!(one.title, "Hounds of Love");
    }

    /// An album whose tracks belong to somebody else is not in this caller's
    /// library at all — the upload scope is per user.
    #[tokio::test]
    async fn another_users_uploads_do_not_appear() {
        let fx = fixture().await;
        add_track(
            &fx,
            "Cloudbusting",
            Some("5"),
            "300000",
            "2026-01-01T00:00:00.000Z",
        )
        .await;

        let other = new_id();
        insert(
            fx.handle.primary(),
            "users",
            &[
                ("xata_id", &other),
                ("did", "did:plc:bob"),
                ("handle", "bob.test"),
                ("avatar", ""),
            ],
        )
        .await;

        let albums = get_albums_by_artist(&fx.handle, &fx.artist, &other)
            .await
            .unwrap();
        assert!(albums.is_empty(), "bob uploaded nothing");
    }
}
