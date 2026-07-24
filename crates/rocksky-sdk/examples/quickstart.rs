//! A minimal read-only tour of the Rocksky AppView — no auth required.
//!
//! ```sh
//! RUST_LOG=info cargo run -p rocksky-sdk --example quickstart -- alice.bsky.social
//! ```

use rocksky_sdk::AppView;
use tracing::info;

#[tokio::main]
async fn main() -> rocksky_sdk::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let actor = std::env::args().nth(1);
    let av = AppView::new(rocksky_sdk::DEFAULT_APPVIEW);

    let stats = av.global_stats().await?;
    info!(
        scrobbles = stats.scrobbles,
        users = stats.users,
        tracks = stats.tracks,
        "global stats"
    );

    for (i, t) in av.top_tracks(10, 0).await?.iter().enumerate() {
        info!(
            rank = i + 1,
            artist = t.artist.as_deref().unwrap_or("?"),
            title = t.title.as_deref().unwrap_or("?"),
            "top track"
        );
    }

    if let Some(actor) = actor {
        let profile = av.profile(&actor).await?;
        info!(
            handle = profile.handle.as_deref().unwrap_or(&actor),
            display_name = profile.display_name.as_deref().unwrap_or(""),
            "profile"
        );
        for s in av.scrobbles(&actor, 10, 0).await? {
            info!(
                artist = s.artist.as_deref().unwrap_or("?"),
                title = s.title.as_deref().unwrap_or("?"),
                "recent scrobble"
            );
        }
    }

    // The authenticated library.* API (your uploaded music) needs an access
    // token — set ROCKSKY_TOKEN to try it. `library()` errors without one.
    if let Ok(token) = std::env::var("ROCKSKY_TOKEN") {
        let lib = av.with_token(token).library()?;
        info!(genres = %lib.get_genres().await?, "library genres");
        info!(albums = %lib.get_album_list("newest", Some(10), None, None, None, None).await?, "library albums");
    }

    Ok(())
}
