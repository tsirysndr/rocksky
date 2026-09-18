use clap::Parser;
use rocksky_appview::config::Cli;

/// The startup banner.
///
/// Printed rather than logged, and before the subscriber is installed, so it
/// does not get a timestamp, a level and a target prefixed to every line — a
/// banner formatted as six log records is not a banner.
const BANNER: &str = r"
    ____             __        __
   / __ \____  _____/ /_______/ /____  __
  / /_/ / __ \/ ___/ //_/ ___/ //_/ / / /
 / _, _/ /_/ / /__/ ,< (__  ) ,< / /_/ /
/_/ |_|\____/\___/_/|_/____/_/|_|\__, /
                                /____/
";

/// Whether to print the banner at all.
///
/// Not when stdout is a pipe or a file: a banner in `journalctl` or in a log
/// shipper is six lines of noise per restart, and the thing it exists for —
/// telling a person at a terminal that the process they just started is the
/// right one — does not apply there.
fn banner() {
    use std::io::IsTerminal;

    if std::io::stdout().is_terminal() {
        println!(
            "{BANNER}  rocksky-appview {}  ·  a self-hosted Rocksky\n",
            env!("CARGO_PKG_VERSION")
        );
    }
}

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Before `--print-config` returns, so a banner never lands in whatever is
    // reading that output.
    if !cli.print_config {
        banner();
    }

    let _telemetry = rocksky_appview::startup::telemetry(&cli);

    rocksky_appview::startup::run(cli).await
}
