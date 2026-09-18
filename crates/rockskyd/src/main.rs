use clap::{Args, Command, FromArgMatches};
use dotenv::dotenv;
use rocksky_appview::config::Cli as AppviewCli;
use tracing_subscriber::fmt::format::Format;

pub mod cmd;

fn cli() -> Command {
    Command::new("rockskyd")
        .version(env!("CARGO_PKG_VERSION"))
        .about("Rocksky Daemon Service")
        .subcommand_required(false)
        // The appview's own flags, rather than a second declaration of them:
        // `--data-dir`, `--generate-config`, `--backfill` and the rest work
        // identically under `rockskyd appview`, and cannot drift from what
        // `rocksky-appview` accepts because there is only one definition.
        // `augment_args` carries the derive's own `about` across too, so the
        // description is set after it rather than before.
        .subcommand(
            AppviewCli::augment_args(Command::new("appview")).about(
                "Start the appview: the app.rocksky.* XRPC API, the REST routes and \
                 the web UI. The default when no subcommand is given.",
            ),
        )
        .subcommand(
            Command::new("dropbox")
                .about("Dropbox related commands")
                .subcommand(Command::new("scan").about("Scan Dropbox Music Folder"))
                .subcommand(Command::new("serve").about("Serve Rocksky Dropbox API")),
        )
        .subcommand(
            Command::new("googledrive")
                .about("Google Drive related commands")
                .subcommand(Command::new("scan").about("Scan Google Drive Music Folder"))
                .subcommand(Command::new("serve").about("Serve Rocksky Google Drive API")),
        )
        .subcommand(Command::new("jellyfin").about("Start Jellyfin-compatible API"))
        .subcommand(Command::new("jetstream").about("Start JetStream Subscriber Service"))
        .subcommand(Command::new("mirror").about("Mirror plays from Last.fm, ListenBrainz, Teal.fm into Rocksky"))
        .subcommand(Command::new("navidrome").about("Start Navidrome-compatible API (Subsonic REST API)"))
        .subcommand(Command::new("playlist").about("Playlist related commands"))
        .subcommand(Command::new("scrobbler").about("Start Scrobbler API"))
        .subcommand(Command::new("spotify").about("Start Spotify Listener Service"))
        .subcommand(Command::new("tracklist").about("Start User Current Track Queue Service"))
        .subcommand(Command::new("webscrobbler").about("Start Webscrobbler API"))
        .subcommand(
            Command::new("pull")
                .about("Pull data from a remote PostgreSQL database to your local PostgresSQL instance")
                .long_about("Pull data from a remote PostgreSQL database to your local PostgresSQL instance. Ensure that the SOURCE_POSTGRES_URL environment variable is set to your remote PostgreSQL connection string."))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let format = Format::default()
        .with_level(true)
        .with_target(true)
        .with_ansi(true)
        .compact();

    // The one place this binary configures tracing, for every subcommand
    // including the appview — which installs none of its own, precisely so
    // that stays true. `try_init` rather than `init` because a second
    // installation panics, and that must never be how a service fails to
    // start.
    let _ = tracing_subscriber::fmt()
        .event_format(format)
        .with_max_level(tracing::Level::INFO)
        .try_init();

    dotenv().ok();

    // After `dotenv`, so anything actually configured wins, and before any
    // service starts a thread, because this sets process-wide variables.
    //
    // Without it a self-hosted Subsonic or Jellyfin container has no
    // `JWT_SECRET`, so the token it signs each play with is not one
    // `rocksky-appview` accepts, and nothing played through it is ever
    // scrobbled. See `rocksky_db::keys`.
    rocksky_db::keys::hydrate();

    let args = cli().get_matches();

    match args.subcommand() {
        Some(("appview", sub_m)) => {
            cmd::appview::start_appview_service(AppviewCli::from_arg_matches(sub_m)?).await?;
        }
        Some(("dropbox", sub_m)) => match sub_m.subcommand() {
            Some(("scan", _)) => cmd::dropbox::scan().await?,
            Some(("serve", _)) => cmd::dropbox::serve().await?,
            _ => println!("Unknown dropbox command"),
        },
        Some(("googledrive", sub_m)) => match sub_m.subcommand() {
            Some(("scan", _)) => cmd::googledrive::scan().await?,
            Some(("serve", _)) => cmd::googledrive::serve().await?,
            _ => println!("Unknown googledrive command"),
        },
        Some(("jellyfin", _)) => {
            cmd::jellyfin::start_jellyfin_service().await?;
        }
        Some(("jetstream", _)) => {
            cmd::jetstream::start_jetstream_service().await?;
        }
        Some(("mirror", _)) => {
            cmd::mirror::start_mirror_service().await?;
        }
        Some(("navidrome", _)) => {
            cmd::navidrome::start_navidrome_service().await?;
        }
        Some(("playlist", _)) => {
            cmd::playlist::start_playlist_service().await?;
        }
        Some(("scrobbler", _)) => {
            cmd::scrobbler::start_scrobbler_service().await?;
        }
        Some(("spotify", _)) => {
            cmd::spotify::start_spotify_service().await?;
        }
        Some(("tracklist", _)) => {
            cmd::tracklist::start_tracklist_service().await?;
        }
        Some(("webscrobbler", _)) => {
            cmd::webscrobbler::start_webscrobbler_service().await?;
        }
        Some(("pull", _)) => {
            cmd::pull::pull_data().await?;
        }
        // No subcommand: the appview. Every other service here is a companion
        // to one, so a bare `rockskyd` meaning "serve Rocksky" is the useful
        // reading — and it is what the container image runs with no command.
        None => {
            cmd::appview::start_appview_service(AppviewCli::default()).await?;
        }
        Some((other, _)) => {
            println!("Unknown subcommand {other:?}. Use --help to see available commands.");
        }
    }

    Ok(())
}
