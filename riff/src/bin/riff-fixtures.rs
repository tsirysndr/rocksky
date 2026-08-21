//! Writes the lightweight test catalog. See `riff::fixtures` for the data.

use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "riff-fixtures",
    version,
    about = "Generate lightweight Parquet fixtures matching the production catalog schema"
)]
struct Cli {
    /// Directory to write the .parquet files into.
    #[arg(short, long, default_value = "testdata")]
    out: PathBuf,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let written = riff::fixtures::generate(&cli.out)?;

    let mut total = 0;
    for w in &written {
        println!("{:<22} {:>4} rows {:>7} B", w.name, w.rows, w.bytes);
        total += w.bytes;
    }
    println!(
        "\nwrote {} files ({} KiB) to {}",
        written.len(),
        total / 1024,
        cli.out.display()
    );
    Ok(())
}
