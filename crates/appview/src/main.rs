use clap::Parser;
use rocksky_appview::config::Cli;
use rocksky_appview::{server, state::AppState, Config};

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

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                // sqlx logs every statement at INFO, which drowns everything
                // else out on a busy instance.
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .init();

    let print_config = cli.print_config;
    let backfill_only = cli.backfill;
    let config = Config::load(cli)?;

    if print_config {
        // Deliberately the redacted summary rather than the struct: the signing
        // key must not be printable by a flag.
        println!("{}", config.summary());
        return Ok(());
    }

    let state = AppState::new(config).await?;

    // `--backfill` is the one-shot form: populate and exit, for a cron job or
    // a first-run import.
    if backfill_only {
        let dids = state.config().backfill_dids.clone();
        if dids.is_empty() {
            anyhow::bail!(
                "--backfill needs repositories to read: set [backfill].dids in {} \
                 or ROCKSKY_BACKFILL_DIDS",
                state.config().config_path.display()
            );
        }
        let reports = rocksky_appview::backfill::run(&state, &dids).await;
        let failed = reports.iter().filter(|r| r.error.is_some()).count();
        for report in &reports {
            match &report.error {
                None => println!(
                    "{}: {} records ({} scrobbles, {} duplicates, {} skipped)",
                    report.did,
                    report.stats.total(),
                    report.stats.scrobbles,
                    report.stats.duplicates,
                    report.stats.skipped
                ),
                Some(error) => println!("{}: failed — {error}", report.did),
            }
        }
        // A non-zero exit so a cron job notices a repository it could not read.
        if failed > 0 {
            anyhow::bail!("{failed} of {} repositories failed", reports.len());
        }
        return Ok(());
    }

    if state.config().backfill_on_start {
        // Backgrounded so a slow or unreachable PDS cannot delay the API.
        let backfill_state = state.clone();
        tokio::spawn(async move {
            rocksky_appview::backfill::run_configured(&backfill_state).await;
        });
    }

    // The feed registry is a projection of records in the publisher's
    // repository, and nothing else writes it — without this a fresh instance
    // serves an empty feed picker, which reads as the feeds being broken
    // rather than absent. Backgrounded and never fatal: it is one HTTP call to
    // somebody else's PDS.
    {
        let generators_state = state.clone();
        tokio::spawn(async move {
            if let Err(err) = rocksky_appview::generators::sync(&generators_state).await {
                tracing::error!(error = ?err, "could not sync the feed registry");
            }
        });
    }

    let _sync = rocksky_appview::sync::spawn(&state);
    // Keeps OAuth sessions from lapsing for users who have not visited in a
    // while; without it, "long-lived" refresh tokens still eventually expire.
    let _refresher = rocksky_appview::oauth::refresher::spawn(&state);

    server::run(state).await?;
    Ok(())
}
