//! Rust types from ATProto lexicons.
//!
//! `apps/api` generates its TypeScript types from the same source, through
//! `pkl` → JSON → `@atproto/lex-cli`. This is the third leg of that pipeline:
//! the JSON those two steps produce, turned into Rust.
//!
//! ```text
//! apps/api/pkl/defs/**.pkl          the source of truth, hand-edited
//!        │  bun pkl:gen
//!        ▼
//! apps/api/lexicons/**/*.json       the lexicon documents
//!        │                    ╲  bun lexgen
//!        │ cargo run -p        ╲
//!        │  rocksky-lexicon-    ╲
//!        ▼  codegen              ▼
//! crates/appview/src/lexicon/  apps/api/src/lexicon/
//! ```
//!
//! Generating from the JSON rather than from the `.pkl` is deliberate: the
//! JSON is what every other consumer reads, so a divergence between the Rust
//! and TypeScript types can only come from the generators, never from the
//! source.
//!
//! What it does *not* do is generate handlers or clients. The output is types
//! only — structs, enums and the NSID constants — because a self-hosted
//! instance's handlers are where all the interesting behaviour lives and a
//! generated skeleton would only get in the way.

pub mod emit;
pub mod handlers;
pub mod lexicon;
pub mod naming;

use anyhow::{Context as _, Result};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// Every generated file, plus the `mod.rs` tree that links them.
#[derive(Debug, Clone)]
pub struct Output {
    pub files: Vec<emit::Generated>,
}

impl Output {
    /// Renames the tree's root from `mod.rs` to `lib.rs`.
    ///
    /// The `super::` chains inside the generated files count modules from the
    /// tree's root, which is the crate root either way — so nothing else
    /// changes.
    pub fn as_crate_root(mut self) -> Self {
        for file in &mut self.files {
            if file.path == PathBuf::from("mod.rs") {
                file.path = PathBuf::from("lib.rs");
            }
        }
        self
    }

    /// Every ref that fell back to raw JSON, deduplicated.
    ///
    /// Surfaced rather than swallowed: a [`emit::UnresolvedReason::DanglingDef`]
    /// is a bug in the lexicon — `apps/api/lexicons/apikey/defs.json` declares
    /// no defs at all while four documents reference `#apiKey` — and the only
    /// way anyone finds out is if the generator says so.
    pub fn unresolved(&self) -> Vec<emit::Unresolved> {
        let mut all: Vec<emit::Unresolved> = self
            .files
            .iter()
            .flat_map(|file| file.unresolved.iter().cloned())
            .collect();
        all.sort();
        all.dedup();
        all
    }
}

/// Reads every `.json` under `root` and generates the module tree.
///
/// The tree's root file is `mod.rs`, which suits a module inside a larger
/// crate. Call [`Output::as_crate_root`] to rename it to `lib.rs` when the
/// output *is* a crate.
#[tracing::instrument(skip_all, fields(root = %root.display()))]
pub fn generate(root: &Path) -> Result<Output> {
    let mut paths = Vec::new();
    collect_json(root, &mut paths)?;
    paths.sort();
    tracing::info!(lexicons = paths.len(), "reading lexicons");

    // Two passes: the ids have to be known before any document is generated,
    // so a ref can tell an internal target from an external one.
    let mut documents = Vec::new();
    let mut seen: BTreeMap<String, PathBuf> = BTreeMap::new();

    for path in &paths {
        let raw =
            std::fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
        let document: lexicon::Document =
            serde_json::from_str(&raw).with_context(|| format!("parsing {}", path.display()))?;

        // Two files declaring one NSID would silently overwrite each other —
        // the failure `apps/api`'s own lexgen script hit and had to work
        // around with a de-duplicated file list.
        if let Some(first) = seen.get(&document.id) {
            anyhow::bail!(
                "{} is declared twice: {} and {}",
                document.id,
                first.display(),
                path.display()
            );
        }
        tracing::debug!(
            nsid = %document.id,
            defs = document.defs.len(),
            file = %path.display(),
            "parsed"
        );
        seen.insert(document.id.clone(), path.clone());
        documents.push((path.clone(), document));
    }

    let known: emit::Catalogue = documents
        .iter()
        .map(|(_, document)| (document.id.clone(), document.defs.keys().cloned().collect()))
        .collect();

    tracing::info!(
        documents = documents.len(),
        defs = known.values().map(BTreeSet::len).sum::<usize>(),
        "catalogue built"
    );

    let mut files = Vec::new();
    for (path, document) in &documents {
        let generated = emit::document(document, &known)
            .with_context(|| format!("generating from {}", path.display()))?;
        if !generated.unresolved.is_empty() {
            tracing::debug!(
                nsid = %document.id,
                unresolved = generated.unresolved.len(),
                "some refs fell back to raw JSON"
            );
        }
        tracing::trace!(
            nsid = %document.id,
            path = %generated.path.display(),
            bytes = generated.source.len(),
            "generated"
        );
        files.push(generated);
    }

    // An NSID can be both a record and a namespace: `app.rocksky.album` is a
    // record lexicon, and `app.rocksky.album.getAlbum` puts files in an
    // `album/` directory. Rust allows `album.rs` or `album/mod.rs` but not
    // both, so the record moves into the directory's `mod.rs`.
    relocate_colliding_files(&mut files);

    // The wiring: the method table and one trait per method. Generated
    // because getting a route path or an HTTP method wrong is quiet, while the
    // handler bodies stay hand-written because nothing about them is in the
    // lexicon. See `handlers`.
    let methods = handlers::methods(&documents);
    tracing::info!(
        queries = methods
            .iter()
            .filter(|m| m.kind == handlers::MethodKind::Query)
            .count(),
        procedures = methods
            .iter()
            .filter(|m| m.kind == handlers::MethodKind::Procedure)
            .count(),
        "collected methods"
    );

    files.push(emit::Generated {
        path: PathBuf::from("methods.rs"),
        source: handlers::method_table(&methods)?,
        unresolved: Vec::new(),
    });

    let modules = module_tree(&mut files);
    tracing::info!(
        types = files.len(),
        modules = modules.len(),
        "generated the module tree"
    );
    files.extend(modules);
    Ok(Output { files })
}

/// Moves `a/b/c.rs` to `a/b/c/mod.rs` when `a/b/c/` is also a directory.
fn relocate_colliding_files(files: &mut [emit::Generated]) {
    let directories: BTreeSet<PathBuf> = files
        .iter()
        .filter_map(|file| file.path.parent().map(Path::to_path_buf))
        .flat_map(|dir| {
            // Every ancestor, so a nested collision is caught too.
            let mut all = Vec::new();
            let mut current = dir;
            while !current.as_os_str().is_empty() {
                all.push(current.clone());
                current = current.parent().map(Path::to_path_buf).unwrap_or_default();
            }
            all
        })
        .collect();

    for file in files.iter_mut() {
        let as_directory = file.path.with_extension("");
        if directories.contains(&as_directory) {
            tracing::debug!(
                from = %file.path.display(),
                to = %as_directory.join("mod.rs").display(),
                "an NSID is both a record and a namespace; merging into mod.rs"
            );
            file.path = as_directory.join("mod.rs");
        }
    }
}

fn collect_json(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in std::fs::read_dir(dir).with_context(|| format!("reading {}", dir.display()))? {
        let path = entry?.path();
        if path.is_dir() {
            collect_json(&path, out)?;
        } else if path.extension().is_some_and(|ext| ext == "json") {
            out.push(path);
        }
    }
    Ok(())
}

/// Builds the `mod.rs` for every directory the generated files occupy.
///
/// A directory whose `mod.rs` is already a relocated record has its
/// declarations appended to that file *in place*. Returning a second
/// `Generated` for the same path instead — which an earlier version did —
/// leaves two entries for one file: writing happens to work because the later
/// one wins, but `--check` compares both and reports the stale one as drift.
fn module_tree(files: &mut Vec<emit::Generated>) -> Vec<emit::Generated> {
    // directory -> the child modules it declares
    let mut children: BTreeMap<PathBuf, Vec<String>> = BTreeMap::new();

    for file in files.iter() {
        let mut current = PathBuf::new();
        let components: Vec<_> = file.path.components().collect();

        for (index, component) in components.iter().enumerate() {
            let name = component.as_os_str().to_string_lossy().to_string();
            let is_leaf = index == components.len() - 1;
            let module = if is_leaf {
                name.trim_end_matches(".rs").to_string()
            } else {
                name
            };

            children
                .entry(current.clone())
                .or_default()
                .push(module.clone());

            if is_leaf {
                break;
            }
            current.push(module);
        }
    }

    // Directories whose `mod.rs` is already a generated document. Their
    // declarations are appended to the existing file rather than emitted as a
    // second one.
    let occupied_dirs: BTreeSet<PathBuf> = files
        .iter()
        .filter(|file| file.path.file_name().is_some_and(|name| name == "mod.rs"))
        .filter_map(|file| file.path.parent().map(Path::to_path_buf))
        .collect();

    let snapshot = files.clone();
    for file in files.iter_mut() {
        if !file.path.file_name().is_some_and(|name| name == "mod.rs") {
            continue;
        }
        let Some(dir) = file.path.parent().map(Path::to_path_buf) else {
            continue;
        };

        let mut modules = children_of(&snapshot, &dir);
        modules.sort();
        modules.dedup();
        if modules.is_empty() {
            continue;
        }

        file.source
            .push_str("\n// The namespace this record also heads.\n");
        for module in modules {
            file.source.push_str(&format!("pub mod {module};\n"));
        }
    }

    children
        .into_iter()
        .filter(|(dir, _)| !occupied_dirs.contains(dir))
        .map(|(dir, mut modules)| {
            modules.sort();
            modules.dedup();

            let mut source = String::new();
            if dir.as_os_str().is_empty() {
                source.push_str(
                    "//! Types generated from the ATProto lexicons.\n\
                     //!\n\
                     //! Generated by `rocksky-lexicon-codegen`. Do not edit — see that\n\
                     //! crate's documentation for the pipeline.\n\n",
                );
                // The one lexicon primitive with no Rust equivalent, defined
                // once here and imported by every generated file.
                source.push_str(emit::SUPPORT_TYPES);
                source.push('\n');
            } else {
                source.push_str(&format!(
                    "//! `{}` — generated. Do not edit.\n\n",
                    dir.components()
                        .map(|c| c.as_os_str().to_string_lossy())
                        .collect::<Vec<_>>()
                        .join(".")
                ));
            }
            for module in modules {
                source.push_str(&format!("pub mod {module};\n"));
            }

            emit::Generated {
                path: dir.join("mod.rs"),
                source,
                unresolved: Vec::new(),
            }
        })
        .collect()
}

/// The module names a directory directly contains.
fn children_of(files: &[emit::Generated], dir: &Path) -> Vec<String> {
    files
        .iter()
        .filter_map(|file| {
            let relative = file.path.strip_prefix(dir).ok()?;
            let mut components = relative.components();
            let first = components.next()?.as_os_str().to_string_lossy().to_string();

            if components.next().is_some() {
                // A subdirectory.
                return Some(first);
            }
            // A file directly here. `mod.rs` is this module itself.
            let name = first.trim_end_matches(".rs").to_string();
            (name != "mod").then_some(name)
        })
        .collect()
}

/// Runs `rustfmt` over `source`, or returns it unchanged.
///
/// Formatting is part of generation, not a step someone runs afterwards.
/// Without it, `--check` compares unformatted output against a tree that a
/// `cargo fmt` has touched, and reports every file as drifted — a check that
/// cannot pass gets ignored, which is worse than not having one. Emitting
/// formatted source in the first place makes the check mean what it says.
///
/// A missing or failing `rustfmt` is not fatal: the unformatted source is
/// valid Rust and compiles identically. It is logged, because a tree generated
/// without it will then look drifted to the next `--check`.
fn formatted(source: &str) -> String {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let mut child = match Command::new("rustfmt")
        .args(["--edition", "2021", "--emit", "stdout", "--quiet"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            tracing::warn!(error = %err, "rustfmt is unavailable; emitting unformatted source");
            return source.to_string();
        }
    };

    if let Some(stdin) = child.stdin.as_mut() {
        if let Err(err) = stdin.write_all(source.as_bytes()) {
            tracing::warn!(error = %err, "could not write to rustfmt");
            return source.to_string();
        }
    }

    match child.wait_with_output() {
        Ok(output) if output.status.success() => {
            String::from_utf8(output.stdout).unwrap_or_else(|_| source.to_string())
        }
        Ok(output) => {
            // Almost always a syntax error in the generated source, which is a
            // generator bug worth seeing rather than hiding.
            tracing::warn!(
                status = ?output.status.code(),
                stderr = %String::from_utf8_lossy(&output.stderr),
                "rustfmt rejected generated source"
            );
            source.to_string()
        }
        Err(err) => {
            tracing::warn!(error = %err, "rustfmt did not finish");
            source.to_string()
        }
    }
}

impl Output {
    /// Formats every file, in place.
    ///
    /// Called by both `write` and `--check`, so the two compare the same thing.
    #[tracing::instrument(skip(self))]
    pub fn format(&mut self) {
        for file in &mut self.files {
            file.source = formatted(&file.source);
        }
        tracing::debug!(files = self.files.len(), "formatted the generated tree");
    }

    /// Writes the tree under `out_dir`, replacing whatever was there.
    ///
    /// The directory is cleared first so a def deleted from a lexicon does not
    /// leave a stale generated file behind — the failure mode `apps/api`'s
    /// script documents having hit.
    #[tracing::instrument(skip(self), fields(out = %out_dir.display()))]
    pub fn write(&self, out_dir: &Path) -> Result<usize> {
        if out_dir.exists() {
            tracing::debug!("clearing the previous output");
            std::fs::remove_dir_all(out_dir)
                .with_context(|| format!("clearing {}", out_dir.display()))?;
        }

        for file in &self.files {
            let path = out_dir.join(&file.path);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("creating {}", parent.display()))?;
            }
            std::fs::write(&path, &file.source)
                .with_context(|| format!("writing {}", path.display()))?;
        }

        tracing::info!(files = self.files.len(), "wrote the generated tree");
        Ok(self.files.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generated(path: &str, source: &str) -> emit::Generated {
        emit::Generated {
            path: PathBuf::from(path),
            source: source.to_string(),
            unresolved: Vec::new(),
        }
    }

    /// The generated tree has to be byte-identical to what `cargo fmt` would
    /// produce, or `--check` fails the moment anyone formats the repository.
    /// This is the property that makes the check usable.
    #[test]
    fn generated_source_is_already_formatted() {
        let ugly = "pub  struct   Foo{pub bar:String,}\n";
        let once = formatted(ugly);

        assert_ne!(once, ugly, "rustfmt did not run — is it installed?");
        assert_eq!(
            formatted(&once),
            once,
            "formatting must be a fixed point, or every run reports drift"
        );
    }

    /// Source rustfmt cannot parse comes back unchanged rather than empty.
    ///
    /// A generator bug should produce source that fails to compile — visible
    /// and fixable — not a truncated file.
    #[test]
    fn unformattable_source_survives() {
        let broken = "pub struct Foo { this is not rust\n";
        assert_eq!(formatted(broken), broken);
    }

    #[test]
    fn the_module_tree_links_every_directory() {
        let mut files = vec![
            generated("app/rocksky/song/defs.rs", ""),
            generated("app/rocksky/actor/get_actor_songs.rs", ""),
            generated("app/rocksky/scrobble.rs", ""),
        ];

        let tree = module_tree(&mut files);
        let by_path: BTreeMap<_, _> = tree
            .iter()
            .map(|file| (file.path.to_string_lossy().to_string(), &file.source))
            .collect();

        assert!(by_path["mod.rs"].contains("pub mod app;"));
        assert!(by_path["app/mod.rs"].contains("pub mod rocksky;"));

        let rocksky = by_path["app/rocksky/mod.rs"];
        assert!(rocksky.contains("pub mod actor;"), "{rocksky}");
        assert!(rocksky.contains("pub mod song;"), "{rocksky}");
        // A leaf file in this directory is declared here, not given its own
        // directory.
        assert!(rocksky.contains("pub mod scrobble;"), "{rocksky}");

        assert!(by_path["app/rocksky/song/mod.rs"].contains("pub mod defs;"));
        assert!(by_path["app/rocksky/actor/mod.rs"].contains("pub mod get_actor_songs;"));
    }

    /// A directory holding several files must declare each exactly once.
    #[test]
    fn sibling_modules_are_declared_once_each() {
        let mut files = vec![
            generated("app/rocksky/actor/get_actor_songs.rs", ""),
            generated("app/rocksky/actor/get_actor_albums.rs", ""),
            generated("app/rocksky/actor/defs.rs", ""),
        ];

        let tree = module_tree(&mut files);
        let actor = tree
            .iter()
            .find(|file| file.path == PathBuf::from("app/rocksky/actor/mod.rs"))
            .expect("the actor module");

        assert_eq!(
            actor.source.matches("pub mod ").count(),
            3,
            "{}",
            actor.source
        );
        // Sorted, so regenerating is stable.
        let declared: Vec<&str> = actor
            .source
            .lines()
            .filter_map(|line| line.strip_prefix("pub mod "))
            .map(|line| line.trim_end_matches(';'))
            .collect();
        let mut sorted = declared.clone();
        sorted.sort();
        assert_eq!(declared, sorted);
    }

    /// An NSID that is both a record and a namespace must produce exactly one
    /// file for its `mod.rs`.
    ///
    /// `app.rocksky.album` is a record, and `app.rocksky.album.getAlbum` puts
    /// files in an `album/` directory, so the record moves to
    /// `album/mod.rs` and the directory's module declarations are appended to
    /// it. Emitting a second `Generated` for the same path instead — which an
    /// earlier version did — writes correctly by ordering luck but makes
    /// `--check` compare the stale copy and report drift on nine files.
    #[test]
    fn a_relocated_record_produces_one_file_not_two() {
        // Built the way `generate` does: relocate, merge, then extend.
        let mut merged = vec![
            generated("app/rocksky/album.rs", "// the album record"),
            generated("app/rocksky/album/get_album.rs", ""),
            generated("app/rocksky/album/get_albums.rs", ""),
        ];
        relocate_colliding_files(&mut merged);
        let modules = module_tree(&mut merged);
        merged.extend(modules);

        let album_mod: Vec<&emit::Generated> = merged
            .iter()
            .filter(|file| file.path == PathBuf::from("app/rocksky/album/mod.rs"))
            .collect();

        assert_eq!(
            album_mod.len(),
            1,
            "one file per path, got {} for album/mod.rs",
            album_mod.len()
        );

        let source = &album_mod[0].source;
        assert!(source.contains("// the album record"), "{source}");
        assert!(source.contains("pub mod get_album;"), "{source}");
        assert!(source.contains("pub mod get_albums;"), "{source}");

        // And no path appears twice anywhere.
        let mut paths: Vec<&PathBuf> = merged.iter().map(|file| &file.path).collect();
        let total = paths.len();
        paths.sort();
        paths.dedup();
        assert_eq!(paths.len(), total, "a path is generated twice");
    }

    /// A duplicated NSID must fail loudly. `apps/api`'s own generator hit this
    /// and aborted mid-run, leaving stale files behind.
    #[test]
    fn a_duplicated_nsid_is_an_error() {
        let dir = tempdir();
        let one = dir.join("a.json");
        let two = dir.join("b.json");
        let body = r#"{"lexicon":1,"id":"com.example.thing","defs":{}}"#;
        std::fs::write(&one, body).unwrap();
        std::fs::write(&two, body).unwrap();

        let error = generate(&dir).unwrap_err();
        let message = format!("{error:#}");
        assert!(message.contains("com.example.thing"), "{message}");
        assert!(message.contains("declared twice"), "{message}");
    }

    /// Writing must clear the output first, or a def removed from a lexicon
    /// leaves a generated file that still compiles and still gets used.
    #[test]
    fn writing_removes_files_that_are_no_longer_generated() {
        let out = tempdir().join("generated");
        std::fs::create_dir_all(out.join("app")).unwrap();
        let stale = out.join("app/stale.rs");
        std::fs::write(&stale, "// left over from a previous run").unwrap();

        let output = Output {
            files: vec![generated("app/rocksky/scrobble.rs", "// fresh")],
        };
        output.write(&out).unwrap();

        assert!(!stale.exists(), "the stale file survived");
        assert!(out.join("app/rocksky/scrobble.rs").exists());
    }

    fn tempdir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "lexgen-test-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
}
