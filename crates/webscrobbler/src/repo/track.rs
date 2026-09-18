use anyhow::Error;
use rocksky_db::schema::Tracks;
use rocksky_db::sea_query::{Asterisk, Expr, Func, Query, SimpleExpr};
use rocksky_db::Backend;

use crate::xata::track::Track;

/// `LOWER(x)` as something comparable.
///
/// `Func::lower` hands back a `FunctionCall`, whose `.eq` is `PartialEq`'s —
/// comparing two function calls for structural equality and yielding a `bool`,
/// which is not a SQL condition. `Expr::expr` is what turns it into one.
fn lower(expr: impl Into<SimpleExpr>) -> SimpleExpr {
    Expr::expr(Func::lower(expr)).into()
}

pub async fn get_track(pool: &Backend, title: &str, artist: &str) -> Result<Option<Track>, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(Tracks::Table)
        .and_where(lower(Expr::col(Tracks::Title)).eq(lower(Expr::val(title))))
        .and_where(
            lower(Expr::col(Tracks::Artist))
                .eq(lower(Expr::val(artist)))
                .or(lower(Expr::col(Tracks::AlbumArtist)).eq(lower(Expr::val(artist)))),
        )
        // A compilation credit matches everyone, so it matches nobody.
        .and_where(lower(Expr::col(Tracks::AlbumArtist)).ne("various artists"))
        .limit(1)
        .to_owned();

    Ok(pool.fetch_optional(&stmt).await?)
}

pub async fn get_track_by_mbid(pool: &Backend, mbid: &str) -> Result<Option<Track>, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::MbId).eq(mbid))
        .limit(1)
        .to_owned();

    Ok(pool.fetch_optional(&stmt).await?)
}
