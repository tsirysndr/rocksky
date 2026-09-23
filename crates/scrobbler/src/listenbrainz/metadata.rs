//! `GET /1/metadata/lookup` — what MusicBrainz ids a track resolves to.
//!
//! Answered from this catalogue rather than from MusicBrainz: the ids a
//! client gets back have to be the ones the rest of these endpoints use, or a
//! love sent against a looked-up MBID would name a recording no listen here
//! ever had.

use anyhow::Error;
use rocksky_db::models::{Track, TRACK_COLS};
use rocksky_db::schema::Tracks;
use rocksky_db::sea_query::{Expr, Func, Query, SimpleExpr};
use rocksky_db::Backend;

use crate::listenbrainz::msid;
use crate::listenbrainz::types::MetadataLookup;

fn lower(expr: impl Into<SimpleExpr>) -> SimpleExpr {
    Expr::expr(Func::lower(expr)).into()
}

pub async fn lookup(
    db: &Backend,
    artist_name: &str,
    recording_name: &str,
    release_name: Option<&str>,
) -> Result<MetadataLookup, Error> {
    // The hash is the exact key when all three parts are known, which is the
    // case a client that just played the track is in.
    let track = match release_name.filter(|name| !name.trim().is_empty()) {
        Some(release) => {
            by_sha256(
                db,
                &msid::track_sha256(recording_name, artist_name, release),
            )
            .await?
        }
        None => None,
    };

    let track = match track {
        Some(track) => Some(track),
        None => by_title(db, artist_name, recording_name).await?,
    };

    Ok(match track {
        Some(track) => MetadataLookup {
            artist_credit_name: Some(track.artist),
            artist_mbids: None,
            recording_mbid: track.mb_id,
            recording_name: Some(track.title),
            release_mbid: None,
            release_name: Some(track.album).filter(|album| !album.trim().is_empty()),
        },
        // A miss is a 200 with nothing filled in, which is what ListenBrainz
        // answers: the lookup succeeded, it just matched nothing.
        None => MetadataLookup {
            artist_credit_name: None,
            artist_mbids: None,
            recording_mbid: None,
            recording_name: None,
            release_mbid: None,
            release_name: None,
        },
    })
}

async fn by_sha256(db: &Backend, sha256: &str) -> Result<Option<Track>, Error> {
    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, None);
    query
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Sha256).eq(sha256))
        .limit(1);
    Ok(db.fetch_optional(&query).await?)
}

async fn by_title(db: &Backend, artist: &str, title: &str) -> Result<Option<Track>, Error> {
    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, None);
    query
        .from(Tracks::Table)
        .and_where(lower(Expr::col(Tracks::Title)).eq(lower(Expr::val(title))))
        .and_where(
            lower(Expr::col(Tracks::Artist))
                .eq(lower(Expr::val(artist)))
                .or(lower(Expr::col(Tracks::AlbumArtist)).eq(lower(Expr::val(artist)))),
        )
        // A compilation credit matches everyone, so it matches nobody.
        .and_where(lower(Expr::col(Tracks::AlbumArtist)).ne("various artists"))
        .limit(1);
    Ok(db.fetch_optional(&query).await?)
}
