use anyhow::Error;
use sea_query::{
    Alias, BinOper, CommonTableExpression, Expr, ExprTrait, Func, Iden, IntoColumnRef, JoinType,
    NullOrdering, Order, OverStatement, Query, SelectStatement, SimpleExpr, WindowStatement,
    WithClause,
};

use crate::repo::track::{lower_eq, unnumbered_key, K};
use crate::schema::{AlbumTracks, Albums, ArtistAlbums, Artists, Tracks, UserUploads};
use crate::sql;
use crate::xata::album::AlbumWithStats;
use rocksky_pgurl::Db;

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
fn album_stats_cte(user_id: &str) -> WithClause {
    let mut mine = Query::select();
    mine.distinct_on([(Uu::Table, UserUploads::TrackId).into_column_ref()])
        .columns([
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
        .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
        .order_by((Uu::Table, UserUploads::TrackId), Order::Asc)
        .order_by((Uu::Table, UserUploads::UploadedAt), Order::Asc)
        .order_by((Uu::Table, UserUploads::XataId), Order::Asc);

    // The junction lookup is DISTINCT so that duplicate `album_tracks` rows for
    // one (album, track) pair cannot multiply the stats.
    let album_ids = Query::select()
        .distinct()
        .column((Atr0::Table, AlbumTracks::AlbumId))
        .from_as(AlbumTracks::Table, Atr0::Table)
        .and_where(Expr::col((Atr0::Table, AlbumTracks::TrackId)).equals((M::Table, Mine::TrackId)))
        .take();

    let mut album_members = Query::select();
    album_members
        .distinct_on([
            (Atr::Table, Atr::AlbumId).into_column_ref(),
            (M::Table, Mine::DiscNumber).into_column_ref(),
            (M::Table, Mine::TrackNumber).into_column_ref(),
            (M::Table, Mine::Unnumbered).into_column_ref(),
        ])
        .column((Atr::Table, Atr::AlbumId))
        .columns([(M::Table, Mine::Duration), (M::Table, Mine::UploadedAt)])
        .from_as(Mine::Table, M::Table)
        .join_lateral(JoinType::Join, album_ids, Atr::Table, Expr::cust("TRUE"))
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
        )
        .order_by((Atr::Table, Atr::AlbumId), Order::Asc)
        .order_by((M::Table, Mine::DiscNumber), Order::Asc)
        .order_by((M::Table, Mine::TrackNumber), Order::Asc)
        .order_by((M::Table, Mine::Unnumbered), Order::Asc)
        .order_by((M::Table, Mine::XataCreatedat), Order::Asc)
        .order_by((M::Table, Mine::TrackId), Order::Asc);

    let album_stats = Query::select()
        .column(AlbumMembers::AlbumId)
        .expr_as(Func::count(Expr::cust("*")), AlbumStats::SongCount)
        .expr_as(
            Func::cast_as(
                Func::sum(Expr::col(AlbumMembers::Duration)),
                Alias::new("bigint"),
            ),
            AlbumStats::TotalDuration,
        )
        .expr_as(
            Func::cast_as(
                Func::min(Expr::col(AlbumMembers::UploadedAt)),
                Alias::new("timestamptz"),
            ),
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

    let in_album = Query::select()
        .expr(Expr::cust("1"))
        .from_as(AlbumTracks::Table, Atr::Table)
        .and_where(
            Expr::col((Atr::Table, AlbumTracks::AlbumId)).equals((Albums::Table, Albums::XataId)),
        )
        .and_where(
            Expr::col((Atr::Table, AlbumTracks::TrackId)).equals((Tracks::Table, Tracks::XataId)),
        )
        .take();

    let uploaded_by_caller = Query::select()
        .expr(Expr::cust("1"))
        .from_as(UserUploads::Table, Uu::Table)
        .and_where(
            Expr::col((Uu::Table, UserUploads::TrackId)).equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
        .take();

    let mut member = Query::select();
    member
        .distinct_on([
            (Tracks::Table, Tracks::DiscNumber).into_column_ref(),
            (Tracks::Table, Tracks::TrackNumber).into_column_ref(),
            (K::Table, K::Unnumbered).into_column_ref(),
        ])
        .columns([
            (Tracks::Table, Tracks::XataId),
            (Tracks::Table, Tracks::Duration),
        ])
        .expr_as(earliest_upload, Member::UploadedAt)
        .from(Tracks::Table)
        .join_lateral(
            JoinType::Join,
            unnumbered_key(Tracks::Table),
            K::Table,
            Expr::cust("TRUE"),
        )
        .and_where(lower_eq(
            Expr::col((Tracks::Table, Tracks::Album)),
            Expr::col((Albums::Table, Albums::Title)),
        ))
        .and_where(lower_eq(
            Expr::col((Tracks::Table, Tracks::AlbumArtist)),
            Expr::col((Albums::Table, Albums::Artist)),
        ))
        .and_where(Expr::exists(in_album))
        .and_where(Expr::exists(uploaded_by_caller))
        .order_by((Tracks::Table, Tracks::DiscNumber), Order::Asc)
        .order_by((Tracks::Table, Tracks::TrackNumber), Order::Asc)
        .order_by((K::Table, K::Unnumbered), Order::Asc)
        .order_by((Tracks::Table, Tracks::XataCreatedat), Order::Asc)
        .order_by((Tracks::Table, Tracks::XataId), Order::Asc);

    query.join_lateral(JoinType::Join, member, Member::Table, Expr::cust("TRUE"));
}

/// The `albums` columns plus the aggregates computed over `member`, and the
/// GROUP BY they need. Shared by every lookup that drives off `member_tracks`.
fn album_with_member_stats(query: &mut SelectStatement, artist_id: SimpleExpr) {
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
            Func::cast_as(
                Func::sum(Expr::col((Member::Table, Member::Duration))),
                Alias::new("bigint"),
            ),
            AlbumStats::TotalDuration,
        )
        .expr_as(
            Func::cast_as(
                Func::min(Expr::col((Member::Table, Member::UploadedAt))),
                Alias::new("timestamptz"),
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
    Ok(sql::fetch_all(db.replica(), &albums_by_artist_stmt(artist_id, user_id)).await?)
}

fn albums_by_artist_stmt(artist_id: &str, user_id: &str) -> SelectStatement {
    let mut stmt = Query::select();
    album_with_member_stats(&mut stmt, Expr::val(artist_id).cast_as(Alias::new("text")));
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
    Ok(sql::fetch_optional(db.replica(), &album_by_stmt(predicate, user_id)).await?)
}

fn album_by_stmt(predicate: SimpleExpr, user_id: &str) -> SelectStatement {
    let mut stmt = Query::select();
    album_with_member_stats(&mut stmt, first_artist_id());
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
    let stmt = album_list_stmt(user_id, list_type, count, offset, from_year, to_year, genre);
    Ok(sql::fetch_all(db.replica(), &stmt).await?)
}

#[allow(clippy::too_many_arguments)]
fn album_list_stmt(
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
                    .and_where(Expr::cust_with_values(r#"$1 = ANY("ar"."genres")"#, [g]))
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

    outer.with(album_stats_cte(user_id))
}

pub async fn search_albums(
    db: &Db,
    user_id: &str,
    query: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<AlbumWithStats>, Error> {
    let stmt = search_albums_stmt(user_id, query, count, offset);
    Ok(sql::fetch_all(db.replica(), &stmt).await?)
}

fn search_albums_stmt(user_id: &str, query: &str, count: i64, offset: i64) -> sea_query::WithQuery {
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

    outer.with(album_stats_cte(user_id))
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
    Ok(sql::fetch_all(db.replica(), &albums_by_names_stmt(user_id, pairs)).await?)
}

fn albums_by_names_stmt(user_id: &str, pairs: &[(String, String)]) -> SelectStatement {
    let titles: Vec<String> = pairs.iter().map(|(t, _)| t.clone()).collect();
    let artists: Vec<String> = pairs.iter().map(|(_, a)| a.clone()).collect();

    let mut stmt = Query::select();
    album_with_member_stats(&mut stmt, first_artist_id());
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
        let (sql, _) = album_list_stmt("rec_user", "newest", 20, 0, None, None, None)
            .build_sqlx(PostgresQueryBuilder);
        assert_eq!(sql.matches("AS  MATERIALIZED").count(), 3);
        assert!(sql.contains(r#"WITH "mine" AS  MATERIALIZED"#));
    }

    #[test]
    fn the_genre_filter_binds_its_value() {
        let (sql, values) =
            album_list_stmt("rec_user", "byGenre", 20, 0, None, None, Some("shoegaze"))
                .build_sqlx(PostgresQueryBuilder);
        assert!(sql.contains(r#"= ANY("ar"."genres")"#));
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
            let (sql, _) = album_list_stmt("rec_user", list_type, 20, 0, None, None, Some("g"))
                .build_sqlx(PostgresQueryBuilder);
            let order = &sql[sql.rfind("ORDER BY").unwrap()..];
            assert!(
                order.contains(r#""xata_id" ASC"#),
                "{list_type} does not tiebreak on the row id: {order}"
            );
        }
        let (sql, _) = album_list_stmt("rec_user", "random", 20, 0, None, None, None)
            .build_sqlx(PostgresQueryBuilder);
        assert!(sql[sql.rfind("ORDER BY").unwrap()..].contains("RANDOM()"));
    }

    /// The year range is normalised, so a reversed from/to still selects rows.
    #[test]
    fn a_reversed_year_range_is_ordered_before_it_binds() {
        let (_, values) =
            album_list_stmt("rec_user", "byYear", 20, 0, Some(1999), Some(1990), None)
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
