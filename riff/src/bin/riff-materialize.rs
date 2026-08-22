//! Builds the sorted lookup tables riff needs to serve the production dump
//! interactively. One-off after each dump refresh; safe to rerun.
//!
//!     riff-materialize --data-dir /root/spotify-dump --db /root/riff.duckdb
//!
//! Then start riff with `--db-path /root/riff.duckdb`. Expect the build to take
//! tens of minutes: it decodes the 23G tracks relation once and sorts several
//! hundred-million-row tables (spilling next to the db file).

use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "riff-materialize",
    version,
    about = "Materialize riff's sorted lookup tables from the parquet dump"
)]
struct Cli {
    /// Directory holding the catalog parquet files.
    #[arg(short, long, env = "RIFF_DATA_DIR", default_value = "testdata")]
    data_dir: PathBuf,

    /// DuckDB file to write the lookup tables into.
    #[arg(long, env = "RIFF_DB_PATH")]
    db: PathBuf,
}

fn main() {
    let cli = Cli::parse();
    let started = std::time::Instant::now();

    println!(
        "materializing lookups from {} into {}",
        cli.data_dir.display(),
        cli.db.display()
    );

    if let Err(e) = riff::db::materialize(&cli.data_dir, &cli.db, |line| println!("{line}")) {
        eprintln!("riff-materialize: {e}");
        std::process::exit(1);
    }

    println!(
        "finished in {:.0}s — start riff with --db-path {}",
        started.elapsed().as_secs_f64(),
        cli.db.display()
    );
}
