use anyhow::Error;
use sea_query::{
    Alias, BinOper, CommonTableExpression, Expr, ExprTrait, Func, Iden, JoinType, Order,
    OverStatement, Query, SelectStatement, SimpleExpr, WindowStatement, WithClause,
};

use crate::schema::{
    AlbumTracks, Albums, ArtistTracks, Artists, Tracks, UserStorageProviders, UserUploads,
};
use crate::sql;
use crate::xata::track::TrackWithUpload;
use rocksky_db::Dialect;
use rocksky_db::Handle as Db;

/// Query-local aliases. Naming them as `Iden`s rather than as strings is the
/// same bargain the schema makes: `Alb::AlbumId` cannot be misspelled, and the
/// projection, the join and the ORDER BY all refer to the one declaration.
#[derive(Iden, Clone, Copy)]
#[iden = "alb"]
enum Alb {
    #[iden = "album_id"]
    AlbumId,
}

#[derive(Iden, Clone, Copy)]
#[iden = "art"]
enum Art {
    #[iden = "artist_id"]
    ArtistId,
}

#[derive(Iden, Clone, Copy)]
#[iden = "usp"]
enum Usp {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "uu"]
enum Uu {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "at2"]
enum At2 {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "at3"]
enum At3 {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "a"]
enum A {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "ar"]
enum Ar {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "t"]
enum T {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "tr"]
enum Tr {
    Table,
}

/// `SELECT CASE WHEN tr.track_number IS NULL THEN tr.xata_id ELSE '' END`,
/// joined laterally so the expression can be named once and used by both
/// `DISTINCT ON` and `ORDER BY`, which have to agree on it exactly.
#[derive(Iden, Clone, Copy)]
#[iden = "k"]
pub(crate) enum K {
    #[iden = "unnumbered"]
    Unnumbered,
}

#[derive(Iden, Clone, Copy)]
#[iden = "slot"]
enum Slot {
    Table,
    #[iden = "xata_id"]
    XataId,
}

#[derive(Iden, Clone, Copy)]
#[iden = "page"]
enum Page {
    Table,
    #[iden = "track_id"]
    TrackId,
}

/// `lower(a) = lower(b)` — the junction-table consistency guard, written out
/// often enough to be worth a name.
pub(crate) fn lower_eq(
    left: impl Into<sea_query::SimpleExpr>,
    right: impl Into<sea_query::SimpleExpr>,
) -> sea_query::SimpleExpr {
    Func::lower(left).eq(Func::lower(right))
}

/// The column list every track row is built from. Split out from the joins so
/// the paged form below can drive off a different table without a second copy.
pub fn track_columns(query: &mut SelectStatement) {
    query
        .columns([
            (Tracks::Table, Tracks::XataId),
            (Tracks::Table, Tracks::Title),
            (Tracks::Table, Tracks::Artist),
            (Tracks::Table, Tracks::AlbumArtist),
            (Tracks::Table, Tracks::AlbumArt),
            (Tracks::Table, Tracks::Album),
            (Tracks::Table, Tracks::TrackNumber),
            (Tracks::Table, Tracks::DiscNumber),
            (Tracks::Table, Tracks::Duration),
            (Tracks::Table, Tracks::MbId),
            (Tracks::Table, Tracks::Genre),
            (Tracks::Table, Tracks::XataCreatedat),
        ])
        .columns([
            (UserUploads::Table, UserUploads::R2Key),
            (UserUploads::Table, UserUploads::MimeType),
            (UserUploads::Table, UserUploads::FileSize),
            (UserUploads::Table, UserUploads::SampleRate),
        ])
        // Filled by `track_joins`, as correlated subqueries rather than
        // joined tables — see there.
        .expr_as(album_id_subquery(), Alb::AlbumId)
        .expr_as(artist_id_subquery(), Art::ArtistId)
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::XataId)),
            Alias::new("storage_provider_id"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::Endpoint)),
            Alias::new("storage_endpoint"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::Region)),
            Alias::new("storage_region"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::Bucket)),
            Alias::new("storage_bucket"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::AccessKey)),
            Alias::new("storage_access_key"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::SecretKey)),
            Alias::new("storage_secret_key"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::PublicUrl)),
            Alias::new("storage_public_url"),
        );
}

/// The storage provider each upload belongs to.
///
/// The album and artist a track resolves to used to be joined here too, as
/// `LEFT JOIN LATERAL`; they are correlated subqueries in the projection now —
/// see [`album_id_subquery`] — because SQLite has no LATERAL.
pub fn track_joins(query: &mut SelectStatement) {
    query.join_as(
        JoinType::LeftJoin,
        UserStorageProviders::Table,
        Usp::Table,
        Expr::col((UserUploads::Table, UserUploads::StorageProviderId))
            .equals((Usp::Table, UserStorageProviders::XataId)),
    );
}

/// The album this track belongs to, as a correlated subquery.
///
/// This was a `LEFT JOIN LATERAL … ON TRUE`, which says the same thing and
/// only works on Postgres: SQLite has no LATERAL. Both lookups return exactly
/// one column and are read only by the projection, so a correlated scalar
/// subquery is an exact substitute — and one that both backends run.
///
/// The guards are the junction-consistency ones. `album_tracks` can point a
/// track at more than one album (a single and a compilation both claiming it),
/// so the title and album artist have to agree case-insensitively with the
/// track's own before a row counts; `LIMIT 1` then picks one deterministically
/// rather than multiplying the outer row.
fn album_id_subquery() -> SimpleExpr {
    let album = Query::select()
        .column((At2::Table, AlbumTracks::AlbumId))
        .from_as(AlbumTracks::Table, At2::Table)
        .join_as(
            JoinType::Join,
            Albums::Table,
            A::Table,
            Expr::col((At2::Table, AlbumTracks::AlbumId)).equals((A::Table, Albums::XataId)),
        )
        .and_where(
            Expr::col((At2::Table, AlbumTracks::TrackId)).equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(lower_eq(
            Expr::col((Tracks::Table, Tracks::Album)),
            Expr::col((A::Table, Albums::Title)),
        ))
        .and_where(lower_eq(
            Expr::col((Tracks::Table, Tracks::AlbumArtist)),
            Expr::col((A::Table, Albums::Artist)),
        ))
        .limit(1)
        .take();
    scalar_subquery(album)
}

/// The album artist of this track, as a correlated subquery. See
/// [`album_id_subquery`].
fn artist_id_subquery() -> SimpleExpr {
    let artist = Query::select()
        .column((At3::Table, ArtistTracks::ArtistId))
        .from_as(ArtistTracks::Table, At3::Table)
        .join_as(
            JoinType::Join,
            Artists::Table,
            Ar::Table,
            Expr::col((At3::Table, ArtistTracks::ArtistId)).equals((Ar::Table, Artists::XataId)),
        )
        .and_where(
            Expr::col((At3::Table, ArtistTracks::TrackId)).equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(lower_eq(
            Expr::col((Tracks::Table, Tracks::AlbumArtist)),
            Expr::col((Ar::Table, Artists::Name)),
        ))
        .limit(1)
        .take();
    scalar_subquery(artist)
}

fn scalar_subquery(select: SelectStatement) -> SimpleExpr {
    SimpleExpr::SubQuery(None, Box::new(select.into_sub_query_statement()))
}

/// Join `tracks` to exactly ONE upload row per (user, track).
///
/// Re-uploading a track adds a `user_uploads` row rather than replacing one —
/// 625 (user, track) pairs in production have more than one, and re-uploading an
/// album gives every track on it a second row. A plain equi-join then emits the
/// track once per upload: the album page showed all 14 songs twice and reported
/// 97 minutes instead of 51. Take the newest upload and nothing else.
///
/// The pick is scoped to `user_id`, so it names the caller — picking globally
/// and filtering afterwards would drop tracks whose newest upload belongs to
/// somebody else.
pub fn one_upload_join(query: &mut SelectStatement, user_id: &str) {
    // The id of the newest upload for this track and this user. A correlated
    // scalar subquery rather than `JOIN LATERAL (… LIMIT 1) ON TRUE`, which
    // says the same thing and only works on Postgres — SQLite has no LATERAL.
    //
    // Pinning the *id* keeps the join a plain equi-join, so `user_uploads`
    // still means the table with all of its columns: the projection and every
    // caller's WHERE go on naming it unchanged. A scalar subquery could not
    // have replaced this, since the projection reads several of its columns.
    let newest_id = Query::select()
        .column((Uu::Table, UserUploads::XataId))
        .from_as(UserUploads::Table, Uu::Table)
        .and_where(
            Expr::col((Uu::Table, UserUploads::TrackId)).equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
        .order_by((Uu::Table, UserUploads::UploadedAt), Order::Desc)
        .order_by((Uu::Table, UserUploads::XataId), Order::Desc)
        .limit(1)
        .take();

    query.join(
        JoinType::Join,
        UserUploads::Table,
        Expr::col((UserUploads::Table, UserUploads::TrackId))
            .equals((Tracks::Table, Tracks::XataId))
            .and(
                Expr::col((UserUploads::Table, UserUploads::XataId)).eq(scalar_subquery(newest_id)),
            ),
    );
}

/// Every track column, joined from `tracks`. Callers append their own WHERE.
pub fn track_select(user_id: &str) -> SelectStatement {
    let mut query = Query::select();
    track_columns(&mut query);
    query.from(Tracks::Table);
    one_upload_join(&mut query, user_id);
    track_joins(&mut query);
    query
}

pub async fn get_tracks_by_album(
    db: &Db,
    album_id: &str,
    user_id: &str,
) -> Result<Vec<TrackWithUpload>, Error> {
    Ok(sql::fetch_all(db.replica(), &tracks_by_album_stmt(album_id, user_id)).await?)
}

fn tracks_by_album_stmt(album_id: &str, user_id: &str) -> sea_query::WithQuery {
    // `slot` picks exactly one track per position on the record, which is what
    // kills all three ways this listing used to double up:
    //
    //  - EXISTS rather than a join on `album_tracks`: 647 (album, track) pairs
    //    have duplicate junction rows (20,969 extra) from re-ingestion;
    //  - `one_upload_join` inside track_select: re-uploading adds a
    //    `user_uploads` row rather than replacing one;
    //  - DISTINCT ON the slot: a re-upload whose tags differ at all hashes to a
    //    NEW `tracks` row, so the same song sits on track 13 twice under two
    //    spellings ("I Ain’t Gon Hold Ya" / "I Ain't Gone Hold Ya"). Oldest
    //    wins — that is the row scrobbles and likes already point at.
    //
    // Unnumbered tracks keep their row id in the key so they never collapse
    // into each other; on a real record (disc, track) is unique by definition.
    let in_album = Query::select()
        .expr(Expr::cust("1"))
        .from_as(AlbumTracks::Table, Alias::new("atr"))
        .and_where(Expr::col((Alias::new("atr"), AlbumTracks::AlbumId)).eq(album_id))
        .and_where(
            Expr::col((Alias::new("atr"), AlbumTracks::TrackId))
                .equals((Tr::Table, Tracks::XataId)),
        )
        .take();

    let uploaded_by_caller = Query::select()
        .expr(Expr::cust("1"))
        .from_as(UserUploads::Table, Uu::Table)
        .and_where(Expr::col((Uu::Table, UserUploads::TrackId)).equals((Tr::Table, Tracks::XataId)))
        .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
        .take();

    // One row per slot, chosen with a window function rather than
    // `DISTINCT ON`, which is Postgres-only. `ROW_NUMBER() OVER (PARTITION BY
    // <slot> ORDER BY <oldest first>) = 1` says exactly the same thing and
    // runs on both backends.
    //
    // The ordering *is* the tie-break, so it has to stay: oldest wins, since
    // that is the row scrobbles and likes already point at.
    let mut ranked = Query::select();
    ranked
        .column((Tr::Table, Tracks::XataId))
        .expr_window_as(
            Func::cust(RowNumber),
            WindowStatement::new()
                .partition_by((Tr::Table, Tracks::DiscNumber))
                .partition_by((Tr::Table, Tracks::TrackNumber))
                // Unnumbered tracks keep their row id in the key so they never
                // collapse into each other; on a real record (disc, track) is
                // unique by definition.
                .add_partition_by(unnumbered_key_expr(Tr::Table))
                .order_by((Tr::Table, Tracks::XataCreatedat), Order::Asc)
                .order_by((Tr::Table, Tracks::XataId), Order::Asc)
                .to_owned(),
            Rank::Row,
        )
        .from_as(Tracks::Table, Tr::Table)
        .join_as(
            JoinType::Join,
            Albums::Table,
            Alias::new("al"),
            Expr::col((Alias::new("al"), Albums::XataId))
                .eq(album_id)
                .and(lower_eq(
                    Expr::col((Tr::Table, Tracks::Album)),
                    Expr::col((Alias::new("al"), Albums::Title)),
                ))
                .and(lower_eq(
                    Expr::col((Tr::Table, Tracks::AlbumArtist)),
                    Expr::col((Alias::new("al"), Albums::Artist)),
                )),
        )
        .and_where(Expr::exists(in_album))
        .and_where(Expr::exists(uploaded_by_caller));

    let mut slot = Query::select();
    slot.column(Tracks::XataId)
        .from_subquery(ranked, Rank::Table)
        .and_where(Expr::col((Rank::Table, Rank::Row)).eq(1));

    let slot_ids = Query::select()
        .column(Slot::XataId)
        .from(Slot::Table)
        .take();

    let mut select = track_select(user_id);
    select
        .and_where(Expr::col((Tracks::Table, Tracks::XataId)).in_subquery(slot_ids))
        .order_by_with_nulls(
            (Tracks::Table, Tracks::DiscNumber),
            Order::Asc,
            sea_query::NullOrdering::First,
        )
        .order_by_with_nulls(
            (Tracks::Table, Tracks::TrackNumber),
            Order::Asc,
            sea_query::NullOrdering::First,
        )
        .order_by((Tracks::Table, Tracks::XataId), Order::Asc);

    select.with(
        WithClause::new()
            .cte(
                CommonTableExpression::new()
                    .query(slot)
                    .table_name(Slot::Table)
                    .to_owned(),
            )
            .to_owned(),
    )
}

/// The slot key itself: a track's own id when it has no track number, and the
/// empty string when it has one.
///
/// Two tracks with no number must not share a slot — they are different songs
/// with nothing to order them by — while two numbered tracks on the same disc
/// and number are the same slot by definition.
pub(crate) fn unnumbered_key_expr(table: impl sea_query::IntoIden + Copy + 'static) -> SimpleExpr {
    Expr::case(
        Expr::col((table, Tracks::TrackNumber)).is_null(),
        Expr::col((table, Tracks::XataId)),
    )
    .finally(Expr::val(""))
    .into()
}

/// Keeps only the first row of each partition.
///
/// The portable form of `DISTINCT ON`: wrap the select in a derived table
/// carrying `ROW_NUMBER() OVER (<window>)` and keep the rows numbered 1. The
/// window's ORDER BY is the tie-break, exactly as `DISTINCT ON`'s ORDER BY
/// was, so a caller moving from one to the other keeps its ordering.
///
/// `outputs` are the columns the derived table re-projects — the inner
/// select's own output names, since that is what they are called once it
/// becomes a subquery.
pub(crate) fn one_per_partition(
    mut inner: SelectStatement,
    window: WindowStatement,
    outputs: impl IntoIterator<Item = sea_query::DynIden>,
) -> SelectStatement {
    inner.expr_window_as(Func::cust(RowNumber), window, Rank::Row);

    let mut outer = Query::select();
    for column in outputs {
        outer.column((Rank::Table, column));
    }
    outer
        .from_subquery(inner, Rank::Table)
        .and_where(Expr::col((Rank::Table, Rank::Row)).eq(1));
    outer
}

/// `ROW_NUMBER`, which sea-query has no builder for.
#[derive(Iden, Clone, Copy)]
#[iden = "ROW_NUMBER"]
struct RowNumber;

/// The derived table the window's rank is filtered on.
#[derive(Iden, Clone, Copy)]
#[iden = "rank"]
pub(crate) enum Rank {
    Table,
    #[iden = "slot_rank"]
    Row,
}

/// Minimal row needed to resolve a stream URL — avoids the `tracks` join and
/// the two LATERAL album/artist lookups that the track projection carries.
#[derive(Debug, sqlx::FromRow, Clone)]
pub struct StreamTrack {
    pub r2_key: String,
    pub storage_provider_id: Option<String>,
    pub storage_endpoint: Option<String>,
    pub storage_region: Option<String>,
    pub storage_bucket: Option<String>,
    pub storage_access_key: Option<String>,
    pub storage_secret_key: Option<String>,
    pub storage_public_url: Option<String>,
}

pub async fn get_stream_track_by_id(
    db: &Db,
    track_id: &str,
    user_id: &str,
) -> Result<Option<StreamTrack>, Error> {
    let pool = db.replica();
    let stmt = Query::select()
        .column((Alias::new("u"), UserUploads::R2Key))
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::XataId)),
            Alias::new("storage_provider_id"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::Endpoint)),
            Alias::new("storage_endpoint"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::Region)),
            Alias::new("storage_region"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::Bucket)),
            Alias::new("storage_bucket"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::AccessKey)),
            Alias::new("storage_access_key"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::SecretKey)),
            Alias::new("storage_secret_key"),
        )
        .expr_as(
            Expr::col((Usp::Table, UserStorageProviders::PublicUrl)),
            Alias::new("storage_public_url"),
        )
        .from_as(UserUploads::Table, Alias::new("u"))
        .join_as(
            JoinType::LeftJoin,
            UserStorageProviders::Table,
            Usp::Table,
            Expr::col((Alias::new("u"), UserUploads::StorageProviderId))
                .equals((Usp::Table, UserStorageProviders::XataId)),
        )
        .and_where(Expr::col((Alias::new("u"), UserUploads::TrackId)).eq(track_id))
        .and_where(Expr::col((Alias::new("u"), UserUploads::UserId)).eq(user_id))
        .order_by((Alias::new("u"), UserUploads::UploadedAt), Order::Desc)
        .limit(1)
        .take();

    Ok(sql::fetch_optional(pool, &stmt).await?)
}

pub async fn get_track_by_id(
    db: &Db,
    track_id: &str,
    user_id: &str,
) -> Result<Option<TrackWithUpload>, Error> {
    let pool = db.replica();
    let mut stmt = track_select(user_id);
    stmt.and_where(Expr::col((Tracks::Table, Tracks::XataId)).eq(track_id));

    Ok(sql::fetch_optional(pool, &stmt).await?)
}

pub async fn get_random_songs(
    db: &Db,
    user_id: &str,
    count: i64,
    genre: Option<&str>,
    from_year: Option<i32>,
    to_year: Option<i32>,
) -> Result<Vec<TrackWithUpload>, Error> {
    let stmt = random_songs_stmt(
        db.replica().dialect(),
        user_id,
        count,
        genre,
        from_year,
        to_year,
    );
    Ok(sql::fetch_all(db.replica(), &stmt).await?)
}

fn random_songs_stmt(
    dialect: Dialect,
    user_id: &str,
    count: i64,
    genre: Option<&str>,
    from_year: Option<i32>,
    to_year: Option<i32>,
) -> SelectStatement {
    let mut stmt = track_select(user_id);

    // The genre used to be spliced into the SQL text with hand-rolled quote
    // doubling. It binds now, like everything else.
    if let Some(g) = genre {
        stmt.and_where(lower_eq(
            Expr::col((Tracks::Table, Tracks::Genre)),
            Expr::val(g),
        ));
    }
    if let (Some(from), Some(to)) = (from_year, to_year) {
        stmt.and_where(
            // `EXTRACT(YEAR …)` and `strftime('%Y', …)` have no common
            // spelling; `current_year`'s sibling in `rocksky_db::models` picks.
            Expr::cust(rocksky_db::models::year_of(
                dialect,
                r#""tracks"."xata_createdat""#,
            ))
            .between(from.min(to), from.max(to)),
        );
    }

    stmt.order_by_expr(Func::random().into(), Order::Asc)
        .limit(count.max(0) as u64);

    stmt
}

/// Tracks matching `query`, or the whole library when it is empty — the
/// library's Tracks tab searches with a blank query.
///
/// Paged in two steps. The page of track ids is picked first, off nothing but
/// `user_uploads` and `tracks`, and only those rows then get the storage
/// provider and the two LATERAL id lookups. Doing it in one pass made those
/// laterals run for every row the OFFSET was about to throw away, so the cost
/// grew with how far the user had scrolled: at offset 5000 of a 7.2k-track
/// library, 840ms against 40ms for this.
///
/// The page is a set of DISTINCT track ids. It used to be a page of upload ids
/// — one row per upload, so a re-uploaded track appeared twice in the list and
/// consumed two slots of the page. `one_upload_join` collapses the rejoin, so
/// the track is now the right unit to page on.
pub async fn search_tracks(
    db: &Db,
    user_id: &str,
    query: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    let stmt = search_tracks_stmt(user_id, query, count, offset);
    Ok(sql::fetch_all(db.replica(), &stmt).await?)
}

fn search_tracks_stmt(user_id: &str, query: &str, count: i64, offset: i64) -> sea_query::WithQuery {
    let mut page = Query::select();
    page.distinct()
        .column((Tracks::Table, Tracks::Title))
        .expr_as(Expr::col((Tracks::Table, Tracks::XataId)), Page::TrackId)
        .from(Tracks::Table)
        .join(
            JoinType::Join,
            UserUploads::Table,
            Expr::col((Tracks::Table, Tracks::XataId))
                .equals((UserUploads::Table, UserUploads::TrackId)),
        )
        .and_where(Expr::col((UserUploads::Table, UserUploads::UserId)).eq(user_id));

    // An empty query means "everything". LIKE '%%' matches every row anyway,
    // but it is not sargable and forces a LOWER() over the whole library, so
    // leave the predicate out entirely rather than asking for a no-op.
    if !query.is_empty() {
        page.and_where(
            Func::lower(Expr::col((Tracks::Table, Tracks::Title))).binary(
                BinOper::Like,
                Func::lower(Expr::val(format!("%{}%", query))),
            ),
        );
    }

    page.order_by((Tracks::Table, Tracks::Title), Order::Asc)
        .order_by((Tracks::Table, Tracks::XataId), Order::Asc)
        .limit(count.max(0) as u64)
        .offset(offset.max(0) as u64);

    let mut select = Query::select();
    track_columns(&mut select);
    select.from(Page::Table).join(
        JoinType::Join,
        Tracks::Table,
        Expr::col((Tracks::Table, Tracks::XataId)).equals((Page::Table, Page::TrackId)),
    );
    one_upload_join(&mut select, user_id);
    track_joins(&mut select);
    select
        .order_by((Tracks::Table, Tracks::Title), Order::Asc)
        .order_by((Tracks::Table, Tracks::XataId), Order::Asc);

    select.with(
        WithClause::new()
            .cte(
                CommonTableExpression::new()
                    .query(page)
                    .table_name(Page::Table)
                    .materialized(true)
                    .to_owned(),
            )
            .to_owned(),
    )
}

pub async fn get_tracks_by_ids(
    db: &Db,
    ids: &[String],
    user_id: &str,
) -> Result<Vec<TrackWithUpload>, Error> {
    let pool = db.replica();
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let mut stmt = track_select(user_id);
    stmt.and_where(
        Expr::col((Tracks::Table, Tracks::XataId)).is_in(ids.iter().map(String::as_str)),
    );

    let rows: Vec<TrackWithUpload> = sql::fetch_all(pool, &stmt).await?;

    // Preserve the order Typesense returned.
    let mut map: std::collections::HashMap<String, TrackWithUpload> =
        rows.into_iter().map(|t| (t.xata_id.clone(), t)).collect();
    Ok(ids.iter().filter_map(|id| map.remove(id)).collect())
}

pub async fn get_album_art_by_track_id(db: &Db, track_id: &str) -> Result<Option<String>, Error> {
    let pool = db.replica();
    let stmt = Query::select()
        .column(Tracks::AlbumArt)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::XataId).eq(track_id))
        .take();

    Ok(sql::fetch_scalar_optional::<Option<String>>(pool, &stmt)
        .await?
        .flatten())
}

pub async fn get_album_id_for_track(db: &Db, track_id: &str) -> Result<Option<String>, Error> {
    let pool = db.replica();
    let stmt = Query::select()
        .column((At2::Table, AlbumTracks::AlbumId))
        .from_as(AlbumTracks::Table, At2::Table)
        .join_as(
            JoinType::Join,
            Albums::Table,
            A::Table,
            Expr::col((At2::Table, AlbumTracks::AlbumId)).equals((A::Table, Albums::XataId)),
        )
        .join_as(
            JoinType::Join,
            Tracks::Table,
            T::Table,
            Expr::col((At2::Table, AlbumTracks::TrackId)).equals((T::Table, Tracks::XataId)),
        )
        .and_where(Expr::col((At2::Table, AlbumTracks::TrackId)).eq(track_id))
        .and_where(lower_eq(
            Expr::col((T::Table, Tracks::Album)),
            Expr::col((A::Table, Albums::Title)),
        ))
        .and_where(lower_eq(
            Expr::col((T::Table, Tracks::AlbumArtist)),
            Expr::col((A::Table, Albums::Artist)),
        ))
        .limit(1)
        .take();

    Ok(sql::fetch_scalar_optional(pool, &stmt).await?)
}

pub async fn get_artist_id_for_track(db: &Db, track_id: &str) -> Result<Option<String>, Error> {
    let pool = db.replica();
    let stmt = Query::select()
        .column((At3::Table, ArtistTracks::ArtistId))
        .from_as(ArtistTracks::Table, At3::Table)
        .join_as(
            JoinType::Join,
            Artists::Table,
            Ar::Table,
            Expr::col((At3::Table, ArtistTracks::ArtistId)).equals((Ar::Table, Artists::XataId)),
        )
        .join_as(
            JoinType::Join,
            Tracks::Table,
            T::Table,
            Expr::col((At3::Table, ArtistTracks::TrackId)).equals((T::Table, Tracks::XataId)),
        )
        .and_where(Expr::col((At3::Table, ArtistTracks::TrackId)).eq(track_id))
        .and_where(lower_eq(
            Expr::col((T::Table, Tracks::AlbumArtist)),
            Expr::col((Ar::Table, Artists::Name)),
        ))
        .limit(1)
        .take();

    Ok(sql::fetch_scalar_optional(pool, &stmt).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_query::PostgresQueryBuilder;
    use sea_query_binder::SqlxBinder;

    #[test]
    fn the_upload_join_picks_one_row_and_binds_the_caller() {
        let (sql, values) = track_select("rec_user").build_sqlx(PostgresQueryBuilder);

        // One upload row per track, the newest, chosen by a correlated
        // subquery — this was `JOIN LATERAL … ON TRUE`, which SQLite cannot
        // run. What matters is the property, not the mechanism: the pick is
        // scoped to the caller and ordered newest-first.
        assert!(
            sql.contains(r#""user_uploads"."xata_id" = (SELECT "uu"."xata_id""#),
            "{sql}"
        );
        assert!(
            sql.contains(r#"ORDER BY "uu"."uploaded_at" DESC, "uu"."xata_id" DESC LIMIT $"#),
            "{sql}"
        );
        // The user id is bound, not spliced.
        assert!(sql.contains(r#""uu"."user_id" = $"#));
        assert!(values
            .0
             .0
            .iter()
            .any(|v| matches!(v, sea_query::Value::String(Some(s)) if s.as_str() == "rec_user")));

        // And nothing Postgres-only is left in the projection.
        assert!(!sql.contains("LATERAL"), "{sql}");
    }

    /// The genre filter used to be spliced into the text with hand-rolled quote
    /// doubling — the one place in this crate where caller input reached the SQL
    /// as SQL.
    #[test]
    fn a_genre_with_a_quote_in_it_binds_rather_than_escaping() {
        let (sql, values) = random_songs_stmt(
            Dialect::Postgres,
            "rec_user",
            10,
            Some("rock 'n' roll"),
            None,
            None,
        )
        .build_sqlx(PostgresQueryBuilder);
        assert!(!sql.contains("rock"));
        assert!(sql.contains(r#"LOWER("tracks"."genre") = LOWER($"#));
        assert!(values
            .0
             .0
            .iter()
            .any(|v| matches!(v, sea_query::Value::String(Some(s)) if **s == *"rock 'n' roll")));
    }

    /// Each of the three de-duplications this listing depends on, and what
    /// breaks when one goes missing: duplicate `album_tracks` rows, several
    /// uploads of one track, and two `tracks` rows for one slot.
    #[test]
    fn tracks_by_album_dedupes_on_all_three_axes() {
        let (sql, _) =
            tracks_by_album_stmt("rec_album", "rec_user").build_sqlx(PostgresQueryBuilder);

        // 1. EXISTS rather than a join on `album_tracks`, for duplicate
        //    junction rows.
        assert!(
            sql.contains(r#"EXISTS(SELECT 1 FROM "album_tracks""#),
            "{sql}"
        );
        // 2. One upload row per track — see the upload-join test.
        assert!(
            sql.contains(r#""user_uploads"."xata_id" = (SELECT "uu"."xata_id""#),
            "{sql}"
        );
        // 3. One track per slot. `DISTINCT ON` is Postgres-only, so this is a
        //    window function; the partition is the slot and the order is the
        //    tie-break, oldest first.
        assert!(
            sql.contains(
                r#"ROW_NUMBER() OVER ( PARTITION BY "tr"."disc_number", "tr"."track_number""#
            ),
            "{sql}"
        );
        assert!(
            sql.contains(r#"ORDER BY "tr"."xata_createdat" ASC, "tr"."xata_id" ASC"#),
            "{sql}"
        );
        assert!(sql.contains(r#""rank"."slot_rank" = "#), "{sql}");

        // And the whole statement is portable now.
        assert!(!sql.contains("DISTINCT ON"), "{sql}");
        assert!(!sql.contains("LATERAL"), "{sql}");
    }

    /// Paging happens in the CTE, off `tracks` and `user_uploads` alone; the
    /// storage provider and the two id laterals only run for the page.
    #[test]
    fn search_pages_before_the_expensive_joins() {
        let (sql, _) =
            search_tracks_stmt("rec_user", "love", 20, 40).build_sqlx(PostgresQueryBuilder);
        assert!(sql.contains(r#"WITH "page" AS  MATERIALIZED"#));
        // Nothing expensive inside the CTE: the storage provider and the two id
        // laterals must come after it, so they only run for the page.
        let cte = &sql[..sql.find(r#") SELECT "tracks"."xata_id""#).unwrap()];
        assert!(!cte.contains("user_storage_providers"));
        assert!(!cte.contains("LATERAL"));
        assert!(sql.contains(r#"LOWER("tracks"."title") LIKE LOWER($"#));
    }

    #[test]
    fn an_empty_search_leaves_the_predicate_out_entirely() {
        let (sql, _) = search_tracks_stmt("rec_user", "", 20, 0).build_sqlx(PostgresQueryBuilder);
        assert!(!sql.contains("LIKE"));
    }
}

/// The album listing, executed against a real SQLite.
///
/// The three dedup rules were written for Postgres, using `DISTINCT ON` and
/// `JOIN LATERAL`. Both are gone now, and a rendering assertion cannot tell
/// whether the replacements still *behave* the same — so these seed the
/// duplicate shapes that caused the original bugs and count rows.
#[cfg(test)]
mod sqlite_behaviour {
    use super::*;
    use rocksky_db::{new_id, Backend, Handle};

    async fn seeded() -> (Handle, String) {
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

        (Handle::from_backend(db), format!("{user}|{album}"))
    }

    /// One `INSERT` from name/value pairs, so the seeding below reads as data.
    async fn insert(db: &Backend, table: &str, values: &[(&str, &str)]) {
        let mut stmt = sea_query::Query::insert();
        stmt.into_table(Alias::new(table))
            .columns(values.iter().map(|(c, _)| Alias::new(*c)))
            .values_panic(values.iter().map(|(_, v)| (*v).into()));
        db.execute(&stmt).await.unwrap();
    }

    async fn add_track(
        db: &Backend,
        user: &str,
        album: &str,
        title: &str,
        track_number: Option<&str>,
        created_at: &str,
    ) -> String {
        let track = new_id();
        let mut values = vec![
            ("xata_id", track.as_str()),
            ("title", title),
            ("artist", "Kate Bush"),
            ("album_artist", "Kate Bush"),
            ("album", "Hounds of Love"),
            ("duration", "240000"),
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
                ("album_id", album),
                ("track_id", &track),
            ],
        )
        .await;

        add_upload(db, user, &track, "2026-01-01T00:00:00.000Z").await;
        track
    }

    async fn add_upload(db: &Backend, user: &str, track: &str, uploaded_at: &str) {
        insert(
            db,
            "user_uploads",
            &[
                ("xata_id", &new_id()),
                ("user_id", user),
                ("track_id", track),
                ("r2_key", &format!("key-{}", new_id())),
                ("mime_type", "audio/flac"),
                ("file_size", "1000"),
                // NOT NULL, and not something this listing reads.
                ("original_filename", "track.flac"),
                ("uploaded_at", uploaded_at),
            ],
        )
        .await;
    }

    /// Re-uploading a track adds a `user_uploads` row rather than replacing
    /// one. A plain equi-join emitted the track once per upload — the album
    /// page showed every song twice and doubled the running time.
    #[tokio::test]
    async fn a_re_upload_does_not_double_the_track() {
        let (handle, ids) = seeded().await;
        let (user, album) = ids.split_once('|').unwrap();

        let track = add_track(
            handle.primary(),
            user,
            album,
            "Cloudbusting",
            Some("5"),
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        // The same track, uploaded again later.
        add_upload(handle.primary(), user, &track, "2026-06-01T00:00:00.000Z").await;

        let tracks = get_tracks_by_album(&handle, album, user).await.unwrap();
        assert_eq!(tracks.len(), 1, "one row per track, not one per upload");
        assert_eq!(tracks[0].title, "Cloudbusting");
    }

    /// Duplicate `album_tracks` rows from re-ingestion — 647 (album, track)
    /// pairs have them in production, and `EXISTS` rather than a join is what
    /// stops those multiplying the listing.
    ///
    /// On SQLite they cannot be created at all: this schema has a UNIQUE
    /// constraint on (album_id, track_id) that the deployed Postgres does not.
    /// So this axis of the dedup is belt-and-braces here, and the thing worth
    /// asserting is the constraint — if it were ever dropped, the `EXISTS`
    /// guard would be load-bearing on SQLite too, and the test above it is
    /// what would prove it still works.
    #[tokio::test]
    async fn duplicate_junction_rows_cannot_be_created_on_sqlite() {
        let (handle, ids) = seeded().await;
        let (user, album) = ids.split_once('|').unwrap();

        let track = add_track(
            handle.primary(),
            user,
            album,
            "Hello Earth",
            Some("9"),
            "2026-01-01T00:00:00.000Z",
        )
        .await;

        let mut duplicate = sea_query::Query::insert();
        duplicate
            .into_table(Alias::new("album_tracks"))
            .columns([
                Alias::new("xata_id"),
                Alias::new("album_id"),
                Alias::new("track_id"),
            ])
            .values_panic([new_id().into(), album.into(), track.clone().into()]);
        let refused = handle.primary().execute(&duplicate).await;
        assert!(refused.is_err(), "the schema must refuse a duplicate pair");

        // And the listing is unaffected.
        let tracks = get_tracks_by_album(&handle, album, user).await.unwrap();
        assert_eq!(tracks.len(), 1);
    }

    /// A re-upload whose tags differ at all hashes to a NEW `tracks` row, so
    /// the same song sits on one track number twice under two spellings. The
    /// window function keeps one — the oldest, which is the row scrobbles and
    /// likes already point at.
    #[tokio::test]
    async fn two_spellings_of_one_slot_collapse_to_the_older() {
        let (handle, ids) = seeded().await;
        let (user, album) = ids.split_once('|').unwrap();

        add_track(
            handle.primary(),
            user,
            album,
            "The Big Sky",
            Some("4"),
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        add_track(
            handle.primary(),
            user,
            album,
            "The Big Skyy",
            Some("4"),
            "2026-09-01T00:00:00.000Z",
        )
        .await;

        let tracks = get_tracks_by_album(&handle, album, user).await.unwrap();
        assert_eq!(tracks.len(), 1, "one track per slot");
        assert_eq!(tracks[0].title, "The Big Sky", "the older spelling wins");
    }

    /// Two tracks with no number are different songs, not one slot — there is
    /// nothing to order them by, so collapsing them would lose one.
    #[tokio::test]
    async fn unnumbered_tracks_do_not_collapse_into_each_other() {
        let (handle, ids) = seeded().await;
        let (user, album) = ids.split_once('|').unwrap();

        add_track(
            handle.primary(),
            user,
            album,
            "Untitled A",
            None,
            "2026-01-01T00:00:00.000Z",
        )
        .await;
        add_track(
            handle.primary(),
            user,
            album,
            "Untitled B",
            None,
            "2026-01-02T00:00:00.000Z",
        )
        .await;

        let tracks = get_tracks_by_album(&handle, album, user).await.unwrap();
        assert_eq!(tracks.len(), 2, "both kept");
    }

    /// The album and artist ids, which were LATERAL joins, come back filled.
    #[tokio::test]
    async fn the_album_id_subquery_resolves() {
        let (handle, ids) = seeded().await;
        let (user, album) = ids.split_once('|').unwrap();

        add_track(
            handle.primary(),
            user,
            album,
            "Running Up That Hill",
            Some("1"),
            "2026-01-01T00:00:00.000Z",
        )
        .await;

        let tracks = get_tracks_by_album(&handle, album, user).await.unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(
            tracks[0].album_id.as_deref(),
            Some(album),
            "the correlated subquery replaced a LATERAL join and must still resolve"
        );
    }
}
