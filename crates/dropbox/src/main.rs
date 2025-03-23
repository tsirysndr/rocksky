use clap::Command;
use cmd::{serve::serve, scan::scan};
use dotenv::dotenv;

pub mod types;
pub mod xata;
pub mod cmd;
pub mod handlers;
pub mod repo;
pub mod client;
pub mod crypto;
pub mod token;
pub mod consts;
pub mod scan;

fn cli() -> Command {
    Command::new("dropbox")
        .version(env!("CARGO_PKG_VERSION"))
        .about("Rocksky Dropbox Service")
        .subcommand(
            Command::new("scan")
            .about("Scan Dropbox Music Folder")
        )
        .subcommand(
            Command::new("serve")
            .about("Serve Rocksky Dropbox API")
        )
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();

    let args = cli().get_matches();

    match args.subcommand() {
        Some(("scan", _)) => scan().await?,
        Some(("serve", _)) => serve().await?,
        _ => serve().await?,
    }

    Ok(())
}
