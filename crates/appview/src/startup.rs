//! Starting the instance.
//!
//! Extracted from `main.rs` so `rockskyd` can run the appview too. It is the
//! default `rockskyd` subcommand, which means this function has two callers
//! and must not assume either one's surroundings — in particular it installs
//! no tracing subscriber, because `rockskyd` installs its own before
//! dispatching, and a second `init()` there would panic.

use crate::config::Cli;

/// Installs telemetry from the `[telemetry]` section, returning the guard.
///
/// Separate from [`run`] and called by `main` before it, because the guard has
/// to outlive the whole process: dropping it flushes the batch exporters, and
/// dropping it early means a short run exports nothing.
///
/// `rockskyd` does not call this — it installs telemetry itself, once, for
/// every subcommand. Telemetry is set up exactly once per process, and this is
/// the standalone binary's turn at it.
///
/// Never fatal. An instance that cannot reach its collector should still serve
/// music; the failure is reported through the subscriber this falls back to.
pub fn telemetry(cli: &Cli) -> Option<rocksky_telemetry::Telemetry> {
    let settings = crate::config::settings::Settings::load(&crate::Config::paths(cli).1)
        .map(|file| file.telemetry)
        .unwrap_or_default();

    match rocksky_telemetry::init("rocksky-appview", &settings) {
        Ok(telemetry) => Some(telemetry),
        Err(err) => {
            // Still needs a subscriber, or the process runs blind.
            let _ = tracing_subscriber::fmt()
                .with_env_filter(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| "info,sqlx=warn".into()),
                )
                .try_init();
            tracing::error!(error = %err, "could not set up telemetry");
            None
        }
    }
}

/// Runs whatever the arguments ask for: generate a config, print one, backfill
/// once, or serve.
///
/// Takes [`Cli`] rather than a [`crate::Config`] because three of those four
/// modes are decided before a config exists — `--generate-config` in
/// particular has to run before `Config::load`, which would write a template
/// over the path it is about to generate into.
pub async fn run(cli: Cli) -> anyhow::Result<()> {
    // Before `Config::load`, which would write a template over the path this
    // is about to generate into.
    if cli.generate_config {
        let (data_dir, config_path) = crate::Config::paths(&cli);
        let report = crate::config::generate::generate(&data_dir, &config_path, cli.force)?;

        println!("Wrote {}", report.config_path.display());
        println!("      {}", report.keyset_path.display());
        if !report.created.is_empty() {
            println!("\nGenerated: {}", report.created.join(", "));
        }
        if !report.reused.is_empty() {
            println!(
                "Reused:    {} (already in {})",
                report.reused.join(", "),
                data_dir.display()
            );
        }
        println!(
            "\nThe config now holds this instance's secrets. Keep it: a new signing \
             key logs everyone out, and a new storage key makes stored credentials \
             unreadable."
        );
        return Ok(());
    }

    let print_config = cli.print_config;
    let backfill_only = cli.backfill;
    let config = crate::Config::load(cli)?;

    if print_config {
        // Deliberately the redacted summary rather than the struct: the signing
        // key must not be printable by a flag.
        println!("{}", config.summary());
        return Ok(());
    }

    let state = crate::state::AppState::new(config).await?;

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
        let reports = crate::backfill::run(&state, &dids).await;
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
            crate::backfill::run_configured(&backfill_state).await;
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
            if let Err(err) = crate::generators::sync(&generators_state).await {
                tracing::error!(error = ?err, "could not sync the feed registry");
            }
        });
    }

    // The denormalised album and artist URIs on `tracks` are what every view
    // reads, and the firehose path used to leave them null — so a database
    // filled before that was fixed answers a null URI for records it has.
    // Idempotent: on a repaired database this updates nothing.
    {
        let repair_state = state.clone();
        tokio::spawn(async move {
            match crate::ingest::repair_denormalised_uris(repair_state.db()).await {
                Ok((0, 0, 0)) => {}
                Ok((albums, artists, album_artists)) => {
                    tracing::info!(
                        albums,
                        artists,
                        album_artists,
                        "filled in missing record URIs"
                    )
                }
                Err(err) => tracing::warn!(error = ?err, "could not repair record URIs"),
            }
        });
    }

    // Builds the search index for a database this binary did not fill —
    // pointed at an existing Postgres, or after a Tap backfill. In the
    // background and paced against Typesense's own write queue: done inline
    // it is minutes of apparent hang, and unpaced it drives Typesense into
    // reporting itself unhealthy.
    // `search()` is optional only under test, where the index is not built.
    let _search_backfill = state
        .search()
        .map(|search| crate::search::spawn_backfill(search, state.db()));

    // Accounts learned from the firehose arrive as a bare DID; without this
    // every scrobble in the global feed is attributed to one, with no name and
    // no picture.
    let _profiles = crate::profiles::spawn(&state);

    // Artists created from the firehose have a name and nothing else, and an
    // album created from a record that carried no cover has no art; the hosted
    // API has already resolved both for most of them. Rate limited at the far
    // end, so this is slow by design — hence the counts, which say how much
    // there is to get through.
    match tokio::try_join!(
        crate::enrich::artists::pending_count(state.db()),
        crate::enrich::albums::pending_count(state.db()),
    ) {
        Ok((0, 0)) => {}
        Ok((artists, albums)) => tracing::info!(
            artists,
            albums,
            "filling in missing artist and album metadata in the background"
        ),
        Err(err) => tracing::warn!(error = ?err, "could not count missing metadata"),
    }
    let _enrich = crate::enrich::spawn(&state);

    let _sync = crate::sync::spawn(&state);
    // Keeps OAuth sessions from lapsing for users who have not visited in a
    // while; without it, "long-lived" refresh tokens still eventually expire.
    let _refresher = crate::oauth::refresher::spawn(&state);

    crate::server::run(state).await?;

    Ok(())
}
