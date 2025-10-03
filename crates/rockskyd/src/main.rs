use clap::Command;
use dotenv::dotenv;
use tracing_subscriber::fmt::format::Format;

pub mod cmd;

fn cli() -> Command {
    Command::new("rockskyd")
        .version(env!("CARGO_PKG_VERSION"))
        .about("Rocksky Daemon Service")
        .subcommand(
            Command::new("analytics")
                .about("Analytics related commands")
                .subcommand(Command::new("sync").about("Sync data from Xata to DuckDB"))
                .subcommand(Command::new("serve").about("Serve the Rocksky Analytics API")),
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
        .subcommand(Command::new("jetstream").about("Start JetStream Subscriber Service"))
        .subcommand(Command::new("playlist").about("Playlist related commands"))
        .subcommand(Command::new("scrobbler").about("Start Scrobbler API"))
        .subcommand(Command::new("spotify").about("Start Spotify Listener Service"))
        .subcommand(Command::new("tracklist").about("Start User Current Track Queue Service"))
        .subcommand(Command::new("webscrobbler").about("Start Webscrobbler API"))
        .subcommand(
            Command::new("pull")
                .about("Pull data from a remote PostgreSQL database to your local PostgresSQL instance")
                .long_about("Pull data from a remote PostgreSQL database to your local PostgresSQL instance. Ensure that the SOURCE_POSTGRES_URL environment variable is set to your remote PostgreSQL connection string."))
        .subcommand(
            Command::new("feed")
                .about("Feed related commands")
                .subcommand(Command::new("serve").about("Serve the Rocksky Feed API"))
                .subcommand(Command::new("sync").about("Sync scrobbles feed data to DuckDB")),
        )
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let format = Format::default()
        .with_level(true)
        .with_target(true)
        .with_ansi(true)
        .compact();

    tracing_subscriber::fmt()
        .event_format(format)
        .with_max_level(tracing::Level::INFO)
        .init();

    dotenv().ok();

    let args = cli().get_matches();

    match args.subcommand() {
        Some(("analytics", sub_m)) => match sub_m.subcommand() {
            Some(("sync", _)) => cmd::analytics::sync().await?,
            Some(("serve", _)) => cmd::analytics::serve().await?,
            _ => println!("Unknown analytics command"),
        },
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
        Some(("jetstream", _)) => {
            cmd::jetstream::start_jetstream_service().await?;
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
        Some(("feed", sub_m)) => match sub_m.subcommand() {
            Some(("serve", _)) => cmd::feed::serve().await?,
            Some(("sync", _)) => cmd::feed::sync().await?,
            _ => println!("Unknown feed command"),
        },
        _ => {
            println!("No valid subcommand was used. Use --help to see available commands.");
        }
    }

    Ok(())
}
