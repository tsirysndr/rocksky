use clap::Parser;
use rocksky_appview::config::Cli;
use rocksky_appview::{server, state::AppState, Config};

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

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

    let _sync = rocksky_appview::sync::spawn(&state);
    // Keeps OAuth sessions from lapsing for users who have not visited in a
    // while; without it, "long-lived" refresh tokens still eventually expire.
    let _refresher = rocksky_appview::oauth::refresher::spawn(&state);

    server::run(state).await?;
    Ok(())
}
