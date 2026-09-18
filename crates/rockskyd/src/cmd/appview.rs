//! The appview: the `app.rocksky.*` XRPC surface, the REST routes and the
//! embedded web UI.
//!
//! `rockskyd` with no subcommand runs this. Every other subcommand here is a
//! companion that only makes sense beside an appview — the mirrors push into
//! one, the Subsonic and Jellyfin surfaces read one — so it is the sensible
//! thing for a bare `rockskyd` to mean.

use anyhow::Error;
use rocksky_appview::config::Cli;

pub async fn start_appview_service(cli: Cli) -> Result<(), Error> {
    // `rockskyd::main` has already installed a tracing subscriber and called
    // `dotenv`, so this must not do either again — which is why it calls
    // `startup::run` rather than anything in the appview's own `main.rs`.
    rocksky_appview::startup::run(cli).await
}
