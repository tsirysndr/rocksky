//! The artist enrichment, against the real `api.rocksky.app`.
//!
//! Gated on `ROCKSKY_LIVE_ENRICH`, because it makes a request to a
//! rate-limited service someone else operates:
//!
//! ```sh
//! ROCKSKY_LIVE_ENRICH=1 cargo test -p rocksky-appview --test live_enrich
//! ```

use rocksky_appview::db::schema::Artists;
use rocksky_appview::sea_query::{Expr, Query};
use rocksky_appview::state::AppState;

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
                rocksky_core::identity::artist_hash(name).into(),
            ])
            .to_owned();
        db.execute(&insert).await.unwrap();
    }

    let filled = match rocksky_appview::enrich::run_batch(&state).await.unwrap() {
        rocksky_appview::enrich::Outcome::Filled(n) => n,
        // The API refusing is not a test failure — it is the documented
        // answer this sweep is built to survive.
        rocksky_appview::enrich::Outcome::RateLimited => {
            eprintln!("skipping: the API rate limited the request");
            return;
        }
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
