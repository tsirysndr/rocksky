//! `lexgen` — generates the Rust lexicon types.
//!
//! ```text
//! cargo run -p rocksky-lexicon-codegen
//! cargo run -p rocksky-lexicon-codegen -- --check
//! ```
//!
//! The defaults point at this repository's own paths, so the common case takes
//! no arguments. `--check` regenerates into memory and compares, which is what
//! CI should run: it fails if the committed output has drifted from the
//! lexicons, rather than silently rebuilding it.

use anyhow::{Context, Result};
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(about = "Generate Rust types from ATProto lexicon JSON")]
struct Args {
    /// The lexicon JSON tree, as produced by `bun pkl:gen` in apps/api.
    ///
    /// Defaults to the `lexicons` symlink beside this crate, which points at
    /// `apps/api/lexicons` — so the command works from the crate directory or
    /// from the repository root without an argument either way.
    #[arg(long, default_value = "crates/lexicon-codegen/lexicons")]
    lexicons: PathBuf,

    /// Where the generated modules go.
    #[arg(long, default_value = "crates/lexicon/src")]
    out: PathBuf,

    /// Name the tree's root `lib.rs` rather than `mod.rs`, for when the
    /// output directory is a crate's `src`.
    #[arg(long, default_value_t = true)]
    crate_root: bool,

    /// Compare against what is on disk instead of writing, and fail on any
    /// difference.
    #[arg(long)]
    check: bool,

    /// `-v` logs each document, `-vv` each generated file.
    #[arg(short, long, action = clap::ArgAction::Count)]
    verbose: u8,
}

fn main() -> Result<()> {
    let args = Args::parse();

    // `-v` for the per-document detail, `-vv` for every file. Defaults to the
    // summary lines, which is what a normal run wants; `RUST_LOG` overrides it
    // for anything more specific.
    let default = match args.verbose {
        0 => "info",
        1 => "rocksky_lexicon_codegen=debug",
        _ => "rocksky_lexicon_codegen=trace",
    };
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(default)),
        )
        .without_time()
        .with_target(false)
        .init();

    let mut args = args;

    // Both defaults are written relative to the repository root. Running from
    // the crate directory is just as natural, so fall back to the same paths
    // without the `crates/lexicon-codegen/` prefix rather than making the
    // caller care where they are.
    for path in [&mut args.lexicons, &mut args.out] {
        let original = path.clone();
        if !path.exists() {
            if let Ok(local) = path.strip_prefix("crates/lexicon-codegen") {
                if local.exists() {
                    tracing::debug!(
                        from = %original.display(),
                        to = %local.display(),
                        "resolved a path relative to the crate directory"
                    );
                    *path = local.to_path_buf();
                    continue;
                }
            }
            if let Ok(local) = path.strip_prefix("crates") {
                let from_crate_dir = PathBuf::from("..").join(local);
                if from_crate_dir.exists() {
                    *path = from_crate_dir;
                }
            }
        }
    }

    if !args.lexicons.is_dir() {
        anyhow::bail!(
            "{} is not a directory — run this from the repository root, or pass --lexicons",
            args.lexicons.display()
        );
    }

    let mut output = rocksky_lexicon_codegen::generate(&args.lexicons)
        .with_context(|| format!("generating from {}", args.lexicons.display()))?;
    if args.crate_root {
        output = output.as_crate_root();
    }

    // Before either branch, so `--check` compares formatted source against a
    // formatted tree. Without this the check reports every file as drifted the
    // moment anyone runs `cargo fmt`.
    output.format();

    if args.check {
        let mut stale = Vec::new();

        for file in &output.files {
            let path = args.out.join(&file.path);
            match std::fs::read_to_string(&path) {
                Ok(existing) if existing == file.source => {}
                Ok(_) => stale.push(format!("{} differs", file.path.display())),
                Err(_) => stale.push(format!("{} is missing", file.path.display())),
            }
        }

        // A file on disk that is no longer generated is just as much a
        // mismatch as one that changed.
        let expected: std::collections::BTreeSet<PathBuf> =
            output.files.iter().map(|file| file.path.clone()).collect();
        for found in existing_files(&args.out)? {
            if !expected.contains(&found) {
                stale.push(format!("{} is no longer generated", found.display()));
            }
        }

        if !stale.is_empty() {
            eprintln!(
                "the generated lexicon types are out of date ({} problems):",
                stale.len()
            );
            for problem in stale.iter().take(20) {
                eprintln!("  {problem}");
            }
            if stale.len() > 20 {
                eprintln!("  … and {} more", stale.len() - 20);
            }
            eprintln!("\nrun: cargo run -p rocksky-lexicon-codegen");
            std::process::exit(1);
        }

        report_unresolved(&output);
        println!("{} generated files are up to date", output.files.len());
        return Ok(());
    }

    report_unresolved(&output);

    output.write(&args.out)?;
    Ok(())
}

/// Prints the refs that fell back to raw JSON.
///
/// A foreign lexicon is expected — this repository does not vendor
/// `com.atproto.*`. A dangling def is a bug in the lexicon, so it is printed
/// separately and loudly.
fn report_unresolved(output: &rocksky_lexicon_codegen::Output) {
    use rocksky_lexicon_codegen::emit::UnresolvedReason;

    let unresolved = output.unresolved();
    let (dangling, foreign): (Vec<_>, Vec<_>) = unresolved
        .iter()
        .partition(|entry| entry.reason == UnresolvedReason::DanglingDef);

    if !foreign.is_empty() {
        tracing::info!(
            refs = foreign.len(),
            "some refs point at lexicons not vendored here; those fields are \
             `serde_json::Value`"
        );
        for entry in &foreign {
            tracing::debug!("{entry}");
        }
    }

    if !dangling.is_empty() {
        tracing::warn!(
            refs = dangling.len(),
            "refs point at a def that does not exist — bugs in the lexicons"
        );
        for entry in &dangling {
            tracing::warn!("  {entry}");
        }
        tracing::warn!(
            "those fields fell back to `serde_json::Value`; fix the lexicon to \
             get a real type"
        );
    }
}

/// Every `.rs` under `dir`, relative to it.
fn existing_files(dir: &PathBuf) -> Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    if dir.is_dir() {
        walk(dir, dir, &mut out)?;
    }
    Ok(out)
}

fn walk(root: &PathBuf, dir: &PathBuf, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            walk(root, &path, out)?;
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            out.push(path.strip_prefix(root)?.to_path_buf());
        }
    }
    Ok(())
}
