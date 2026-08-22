//! Runs SQL through riff's *bundled* DuckDB engine, with per-statement timing.
//!
//! Exists because the system `duckdb` CLI is a different engine build, and
//! "fast in the CLI, slow in riff" turned out to be a real class of production
//! problem. This answers "what does riff's engine actually do with this query"
//! without redeploying the service.
//!
//!     riff-sql --data-dir /root/spotify-dump --db-path /root/riff.duckdb \
//!         "SELECT count(*) FROM track_names WHERE name_key = 'yonderboi'"
//!
//! Reads statements from arguments, or from stdin when none are given
//! (semicolon-separated). Prints row counts and wall time per statement.

use clap::Parser;
use riff::db;
use std::io::Read;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "riff-sql",
    version,
    about = "Run SQL on riff's bundled engine with timings"
)]
struct Cli {
    #[arg(short, long, env = "RIFF_DATA_DIR", default_value = "testdata")]
    data_dir: PathBuf,

    #[arg(long, env = "RIFF_DB_PATH")]
    db_path: Option<PathBuf>,

    /// Statements to run; stdin is read when empty.
    sql: Vec<String>,

    /// Repeat each statement this many times (first run shows cold cost).
    #[arg(short, long, default_value_t = 1)]
    repeat: u32,
}

fn main() -> Result<(), String> {
    let cli = Cli::parse();

    let settings = db::Settings {
        data_dir: cli.data_dir.clone(),
        db_path: cli.db_path.clone(),
        pool_size: 1,
        pool_timeout: std::time::Duration::from_secs(30),
    };
    let (catalog, report) = db::open(&settings)?;
    for line in report {
        eprintln!("{line}");
    }
    let conn = catalog.get().map_err(|e| e.to_string())?;

    let mut statements = cli.sql;
    if statements.is_empty() {
        let mut buf = String::new();
        std::io::stdin()
            .read_to_string(&mut buf)
            .map_err(|e| e.to_string())?;
        statements = buf
            .split(';')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect();
    }

    for sql in &statements {
        for run in 0..cli.repeat.max(1) {
            let started = std::time::Instant::now();
            let mut stmt = conn.prepare(sql).map_err(|e| format!("{sql}: {e}"))?;
            let mut rows = stmt.query([]).map_err(|e| format!("{sql}: {e}"))?;
            let mut n = 0usize;
            while rows.next().map_err(|e| e.to_string())?.is_some() {
                n += 1;
            }
            println!(
                "[{run}] {:>8.1}ms  {n:>6} rows  {}",
                started.elapsed().as_secs_f64() * 1000.0,
                sql.chars().take(100).collect::<String>()
            );
        }
    }
    Ok(())
}
