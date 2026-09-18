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

    // The one place this binary configures tracing, and `try_init` rather than
    // `init` so it can only ever be the one place: a second installation
    // panics, and `rockskyd` — which also runs `startup::run` — installs its
    // own before dispatching.
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                // sqlx logs every statement at INFO, which drowns everything
                // else out on a busy instance.
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .try_init();

    rocksky_appview::startup::run(cli).await
}
