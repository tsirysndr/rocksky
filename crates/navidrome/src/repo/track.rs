use anyhow::Error;
use sea_query::{
    Alias, Asterisk, BinOper, CommonTableExpression, Expr, ExprTrait, Func, Iden, IntoColumnRef,
    JoinType, Order, Query, SelectStatement, WithClause,
};

use crate::schema::{
    AlbumTracks, Albums, ArtistTracks, Artists, Tracks, UserStorageProviders, UserUploads,
};
use crate::sql;
use crate::xata::track::TrackWithUpload;
use rocksky_pgurl::Db;

/// Query-local aliases. Naming them as `Iden`s rather than as strings is the
/// same bargain the schema makes: `Alb::AlbumId` cannot be misspelled, and the
/// projection, the join and the ORDER BY all refer to the one declaration.
#[derive(Iden, Clone, Copy)]
#[iden = "alb"]
enum Alb {
    Table,
    #[iden = "album_id"]
    AlbumId,
}

#[derive(Iden, Clone, Copy)]
#[iden = "art"]
enum Art {
    Table,
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
    Table,
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
        .column((Alb::Table, Alb::AlbumId))
        .column((Art::Table, Art::ArtistId))
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

/// Storage provider plus the album/artist id each track resolves to. Evaluated
/// once per row, so it belongs after whatever narrowed the rows down.
pub fn track_joins(query: &mut SelectStatement) {
    query.join_as(
        JoinType::LeftJoin,
        UserStorageProviders::Table,
        Usp::Table,
        Expr::col((UserUploads::Table, UserUploads::StorageProviderId))
            .equals((Usp::Table, UserStorageProviders::XataId)),
    );

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

    query
        .join_lateral(JoinType::LeftJoin, album, Alb::Table, Expr::cust("TRUE"))
        .join_lateral(JoinType::LeftJoin, artist, Art::Table, Expr::cust("TRUE"));
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
    let newest = Query::select()
        .column((Uu::Table, Asterisk))
        .from_as(UserUploads::Table, Uu::Table)
        .and_where(
            Expr::col((Uu::Table, UserUploads::TrackId)).equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
        .order_by((Uu::Table, UserUploads::UploadedAt), Order::Desc)
        .order_by((Uu::Table, UserUploads::XataId), Order::Desc)
        .limit(1)
        .take();

    // Aliased back to `user_uploads`, so the projection and every caller's
    // WHERE keep naming the table they think they are reading.
    query.join_lateral(
        JoinType::Join,
        newest,
        UserUploads::Table,
        Expr::cust("TRUE"),
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

    let mut slot = Query::select();
    slot.distinct_on([
        (Tr::Table, Tracks::DiscNumber).into_column_ref(),
        (Tr::Table, Tracks::TrackNumber).into_column_ref(),
        (K::Table, K::Unnumbered).into_column_ref(),
    ])
    .column((Tr::Table, Tracks::XataId))
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
    .join_lateral(
        JoinType::Join,
        unnumbered_key(Tr::Table),
        K::Table,
        Expr::cust("TRUE"),
    )
    .and_where(Expr::exists(in_album))
    .and_where(Expr::exists(uploaded_by_caller))
    .order_by((Tr::Table, Tracks::DiscNumber), Order::Asc)
    .order_by((Tr::Table, Tracks::TrackNumber), Order::Asc)
    .order_by((K::Table, K::Unnumbered), Order::Asc)
    .order_by((Tr::Table, Tracks::XataCreatedat), Order::Asc)
    .order_by((Tr::Table, Tracks::XataId), Order::Asc);

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

/// `CASE WHEN <table>.track_number IS NULL THEN <table>.xata_id ELSE '' END`,
/// wrapped in a one-row SELECT so it can be joined laterally and referred to by
/// name. `DISTINCT ON` and its `ORDER BY` have to spell the key identically;
/// naming it once is how they are kept from drifting.
pub(crate) fn unnumbered_key(table: impl sea_query::IntoIden + Copy + 'static) -> SelectStatement {
    Query::select()
        .expr_as(
            Expr::case(
                Expr::col((table, Tracks::TrackNumber)).is_null(),
                Expr::col((table, Tracks::XataId)),
            )
            .finally(Expr::val("")),
            K::Unnumbered,
        )
        .take()
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
    let stmt = random_songs_stmt(user_id, count, genre, from_year, to_year);
    Ok(sql::fetch_all(db.replica(), &stmt).await?)
}

fn random_songs_stmt(
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
            Expr::cust(r#"EXTRACT(YEAR FROM "tracks"."xata_createdat")"#)
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
    fn the_upload_join_is_lateral_and_scoped_to_the_caller() {
        let (sql, values) = track_select("rec_user").build_sqlx(PostgresQueryBuilder);
        assert!(sql.contains(r#"JOIN LATERAL (SELECT "uu".* FROM "user_uploads" AS "uu""#));
        assert!(sql.contains(r#"AS "user_uploads" ON TRUE"#));
        // The user id is bound, not spliced.
        assert!(sql.contains(r#""uu"."user_id" = $"#));
        assert_eq!(
            values.0 .0.len(),
            4,
            "user id, plus a LIMIT 1 for the upload and each id lateral"
        );
    }

    /// The genre filter used to be spliced into the text with hand-rolled quote
    /// doubling — the one place in this crate where caller input reached the SQL
    /// as SQL.
    #[test]
    fn a_genre_with_a_quote_in_it_binds_rather_than_escaping() {
        let (sql, values) = random_songs_stmt("rec_user", 10, Some("rock 'n' roll"), None, None)
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
        assert!(sql.contains(r#"EXISTS(SELECT 1 FROM "album_tracks""#));
        assert!(sql.contains(r#"AS "user_uploads" ON TRUE"#));
        assert!(sql.contains(
            r#"DISTINCT ON ("tr"."disc_number", "tr"."track_number", "k"."unnumbered")"#
        ));
        // DISTINCT ON and its ORDER BY have to lead with the same key.
        assert!(sql.contains(
            r#"ORDER BY "tr"."disc_number" ASC, "tr"."track_number" ASC, "k"."unnumbered" ASC"#
        ));
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
