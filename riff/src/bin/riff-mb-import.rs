//! Imports the MusicBrainz NDJSON dumps into the DuckDB file riff-mb serves.
//!
//! Entities import independently and each replaces its own table, so the
//! import can run one entity at a time and the caller can delete each dump as
//! soon as its table is verified:
//!
//! ```text
//! for e in area artist event instrument label place recording release-group work; do
//!     riff-mb-import --dumps-dir ~/musicbrainz --db musicbrainz.duckdb --only $e \
//!         && rm -rf ~/musicbrainz/$e
//! done
//! ```

use clap::Parser;
use duckdb::Connection;
use riff::mb::import;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "riff-mb-import", version, about = "MusicBrainz NDJSON dumps → DuckDB")]
struct Cli {
    /// Directory holding the dumps, either as <entity>/mbdump/<entity> (the
    /// upstream layout) or flat <entity>.jsonl files.
    #[arg(short = 'd', long, env = "RIFF_MB_DUMPS_DIR")]
    dumps_dir: PathBuf,

    /// DuckDB file to write. Created if absent; re-importing an entity
    /// replaces its table.
    #[arg(long, env = "RIFF_MB_DB_PATH", default_value = "musicbrainz.duckdb")]
    db: PathBuf,

    /// Import only these entities (repeatable). Default: every entity whose
    /// dump file exists.
    #[arg(long)]
    only: Vec<String>,

    /// DuckDB memory limit for the import.
    #[arg(long, env = "RIFF_MB_IMPORT_MEMORY_LIMIT", default_value = "4GB")]
    memory_limit: String,

    /// Longest JSON line the reader must accept, in bytes. Reader memory
    /// scales with this — size it just above the entity's longest line.
    #[arg(long, default_value_t = import::DEFAULT_MAX_OBJECT_SIZE)]
    max_object_size: u64,
}

fn main() {
    let cli = Cli::parse();
    if let Err(e) = run(&cli) {
        eprintln!("riff-mb-import: {e}");
        std::process::exit(1);
    }
}

fn run(cli: &Cli) -> Result<(), String> {
    let conn =
        Connection::open(&cli.db).map_err(|e| format!("opening {}: {e}", cli.db.display()))?;
    // Two threads: JSON read buffers scale with threads × maximum_object_size,
    // and the import is a one-off — staying well inside the memory limit
    // matters more than parse parallelism.
    conn.execute_batch(&format!(
        "SET memory_limit = '{}';
         SET threads = 2;
         SET preserve_insertion_order = false;",
        cli.memory_limit.replace('\'', "")
    ))
    .map_err(|e| format!("configuring DuckDB: {e}"))?;

    let only = (!cli.only.is_empty()).then_some(cli.only.as_slice());
    let started = std::time::Instant::now();
    let report = import::import_all(&conn, &cli.dumps_dir, only, cli.max_object_size)?;

    for (entity, count) in &report {
        println!("{entity:<14} {count} rows");
    }
    println!(
        "imported {} entities into {} in {:.0?}",
        report.len(),
        cli.db.display(),
        started.elapsed()
    );
    Ok(())
}
