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

    dotenv().ok();

    let args = cli().get_matches();
    let service = args.subcommand_name().unwrap_or("appview");

    // Telemetry is installed here, once, before any service starts — which is
    // what makes `tracing::info!` in *any* crate reach the configured backend
    // without that crate knowing this exists. It also installs the tracing
    // subscriber, because OpenTelemetry layers cannot be added to one after
    // the fact, so nothing else may install one first.
    //
    // Held for the life of the process: dropping it flushes whatever the batch
    // exporters are still holding, which is the difference between a one-shot
    // command exporting its spans and exporting nothing.
    let _telemetry = match telemetry_settings(&args) {
        Ok(settings) => match rocksky_telemetry::init(service, &settings) {
            Ok(telemetry) => Some(telemetry),
            Err(err) => {
                // A subscriber is still needed, so fall back to a plain one
                // rather than running blind.
                let _ = tracing_subscriber::fmt()
                    .event_format(format.clone())
                    .with_max_level(tracing::Level::INFO)
                    .try_init();
                tracing::error!(error = %err, "could not set up telemetry");
                None
            }
        },
        Err(err) => {
            let _ = tracing_subscriber::fmt()
                .event_format(format.clone())
                .with_max_level(tracing::Level::INFO)
                .try_init();
            tracing::warn!(error = %err, "could not read the telemetry settings");
            None
        }
    };

    // After `dotenv`, so anything actually configured wins, and before any
    // service starts a thread, because this sets process-wide variables.
    rocksky_db::keys::hydrate();

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

/// The `[telemetry]` section of the appview's `config.toml`.
///
/// Read here rather than by each service so one file configures the whole
/// daemon. A missing or unreadable file is not an error — the common case is a
/// service that has no config file at all, and telemetry simply stays off.
fn telemetry_settings(args: &clap::ArgMatches) -> anyhow::Result<rocksky_telemetry::Settings> {
    // The same path resolution the appview uses, so `--data-dir` and
    // `--config` land on the file it would have read.
    let cli = match args.subcommand() {
        Some(("appview", sub_m)) => AppviewCli::from_arg_matches(sub_m)?,
        _ => AppviewCli::default(),
    };
    let (_, config_path) = rocksky_appview::Config::paths(&cli);

    let Ok(raw) = std::fs::read_to_string(&config_path) else {
        return Ok(rocksky_telemetry::Settings::default());
    };

    // Only this section: the rest of the file is the appview's and may name
    // settings this binary knows nothing about.
    #[derive(serde::Deserialize, Default)]
    struct Section {
        #[serde(default)]
        telemetry: rocksky_telemetry::Settings,
    }
    let section: Section = toml::from_str(&raw)?;
    Ok(section.telemetry)
}
