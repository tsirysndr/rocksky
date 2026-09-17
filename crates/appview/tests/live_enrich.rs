//! The metadata sweeps, against the real `api.rocksky.app`.
//!
//! Gated on `ROCKSKY_LIVE_ENRICH`, because these make requests to a
//! rate-limited service someone else operates:
//!
//! ```sh
//! ROCKSKY_LIVE_ENRICH=1 cargo test -p rocksky-appview --test live_enrich
//! ```
//!
//! What these check that the unit tests cannot is the *contract*: that the
//! endpoints still take the parameters the sweeps send (`names`, and an RSQL
//! `sha256=in=(…)` filter) and still answer with the field names they parse.
//! A silent change at the far end would otherwise look like a database where
//! nothing ever gets filled in.

use rocksky_appview::db::schema::{Albums, Artists};
use rocksky_appview::enrich::Outcome;
use rocksky_appview::sea_query::{Expr, Query};
use rocksky_appview::state::AppState;
use rocksky_core::identity::{album_hash, artist_hash};

fn enabled() -> bool {
    std::env::var("ROCKSKY_LIVE_ENRICH").is_ok_and(|v| !v.is_empty())
}

/// An artist with no picture is filled in from the hosted API.
#[actix_web::test]
async fn a_real_artist_gets_its_picture() {
    if !enabled() {
        return;
    }

    let state = AppState::for_test().await.unwrap();
    let db = state.db();

    // Two artists the hosted instance certainly knows, with nothing but names.
    for name in ["Boards of Canada", "Jamiroquai"] {
        let insert = Query::insert()
            .into_table(Artists::Table)
            .columns([Artists::XataId, Artists::Name, Artists::Sha256])
            .values_panic([
                rocksky_appview::db::new_id().into(),
                name.into(),
                artist_hash(name).into(),
            ])
            .to_owned();
        db.execute(&insert).await.unwrap();
    }

    let filled = match rocksky_appview::enrich::artists::run_batch(&state)
        .await
        .unwrap()
    {
        Outcome::Filled(n) => n,
        // The API refusing is not a test failure — it is the documented
        // answer this sweep is built to survive.
        Outcome::RateLimited => {
            eprintln!("skipping: the API rate limited the request");
            return;
        }
        Outcome::Idle => panic!("there were two artists to ask about"),
    };

    assert!(filled > 0, "nothing was filled in");

    let picture = db
        .fetch_scalar::<String>(
            &Query::select()
                .column(Artists::Picture)
                .from(Artists::Table)
                .and_where(Expr::col(Artists::Name).eq("Boards of Canada"))
                .to_owned(),
        )
        .await
        .unwrap();

    let picture = picture.expect("the row exists");
    assert!(
        picture.starts_with("http"),
        "not a usable picture URL: {picture:?}"
    );
}

/// An album with no art is filled in from the hosted API.
///
/// This is the one that proves the hash matches: the filter is built from a
/// hash computed *here*, and the album comes back only if the far end
/// computed the same one from its own copy of the title and artist.
#[actix_web::test]
async fn a_real_album_gets_its_art() {
    if !enabled() {
        return;
    }

    let state = AppState::for_test().await.unwrap();
    let db = state.db();

    // Albums the hosted instance holds art for, stored here with none — and
    // with no tracks, so the local pass cannot be what fills them.
    let wanted = [
        ("CRASH (Deluxe)", "Charli xcx"),
        ("Meteora 20th Anniversary Edition", "Linkin Park"),
    ];
    for (title, artist) in wanted {
        let insert = Query::insert()
            .into_table(Albums::Table)
            .columns([
                Albums::XataId,
                Albums::Title,
                Albums::Artist,
                Albums::Sha256,
            ])
            .values_panic([
                rocksky_appview::db::new_id().into(),
                title.into(),
                artist.into(),
                album_hash(title, artist).into(),
            ])
            .to_owned();
        db.execute(&insert).await.unwrap();
    }

    let filled = match rocksky_appview::enrich::albums::run_batch(&state)
        .await
        .unwrap()
    {
        Outcome::Filled(n) => n,
        Outcome::RateLimited => {
            eprintln!("skipping: the API rate limited the request");
            return;
        }
        Outcome::Idle => panic!("there were two albums to ask about"),
    };

    assert!(filled > 0, "nothing was filled in");

    let art = db
        .fetch_scalar::<String>(
            &Query::select()
                .column(Albums::AlbumArt)
                .from(Albums::Table)
                .and_where(Expr::col(Albums::Sha256).eq(album_hash("CRASH (Deluxe)", "Charli xcx")))
                .to_owned(),
        )
        .await
        .unwrap();

    let art = art.expect("the row exists");
    assert!(art.starts_with("http"), "not a usable art URL: {art:?}");
    assert_ne!(
        art,
        rocksky_core::identity::PLACEHOLDER_ALBUM_ART,
        "the placeholder is not art"
    );
}
