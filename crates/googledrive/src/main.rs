use clap::Command;
use cmd::{scan::scan, serve::serve};
use dotenv::dotenv;

pub mod client;
pub mod cmd;
pub mod consts;
pub mod crypto;
pub mod handlers;
pub mod repo;
pub mod scan;
pub mod token;
pub mod types;
pub mod xata;

fn cli() -> Command {
    Command::new("googledrive")
        .version(env!("CARGO_PKG_VERSION"))
        .about("Rocksky Google Drive Service")
        .subcommand(Command::new("scan").about("Scan Google Drive Music Folder"))
        .subcommand(Command::new("serve").about("Serve Rocksky Google Drive API"))
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
