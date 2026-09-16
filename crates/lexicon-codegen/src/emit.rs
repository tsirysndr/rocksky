//! Turning a lexicon document into Rust source.
//!
//! # Type mapping
//!
//! | lexicon                     | Rust                              |
//! |-----------------------------|-----------------------------------|
//! | `string`                    | `String`                          |
//! | `string` with `knownValues`  | `String`, values in the doc comment |
//! | `integer`                   | `i64`                             |
//! | `boolean`                   | `bool`                            |
//! | `array` of `T`              | `Vec<T>`                          |
//! | `object` (inline)           | a nested struct, named after the field |
//! | `ref`                       | the referenced type's path        |
//! | `union`                     | an untagged enum over its refs    |
//! | `blob`                      | `Blob`                            |
//! | `unknown`                   | `serde_json::Value`               |
//!
//! Every string format — `at-uri`, `datetime`, `did`, `cid` — maps to
//! `String`. A newtype per format would catch nothing serde would not, and
//! would make every construction site noisier.
//!
//! # Optionality
//!
//! A property absent from `required` becomes `Option<T>` and is skipped when
//! serializing if `None`. A `nullable` property is also `Option<T>`: Rust
//! cannot distinguish "absent" from "present but null" without a wrapper that
//! would infect every field, so the distinction is deliberately lost — and
//! noted in the field's doc comment when the lexicon marks it nullable.

use crate::lexicon::*;
use crate::naming::*;
use anyhow::{bail, Result};
use std::collections::BTreeSet;
use std::fmt::Write as _;

/// Every document being generated, and the defs each declares.
pub type Catalogue = std::collections::BTreeMap<String, BTreeSet<String>>;

/// A `ref` that could not be resolved to a generated type.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Unresolved {
    /// The document holding the ref.
    pub from: String,
    /// What it pointed at.
    pub target: String,
    pub reason: UnresolvedReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum UnresolvedReason {
    /// The lexicon is not in this repository — a third-party `com.atproto.*`
    /// or `app.bsky.*` document. Expected, and not a problem.
    ForeignLexicon,
    /// The lexicon *is* here but declares no such def. A bug in the lexicon.
    DanglingDef,
}

impl std::fmt::Display for Unresolved {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let reason = match self.reason {
            UnresolvedReason::ForeignLexicon => "not vendored here",
            UnresolvedReason::DanglingDef => "no such def in that lexicon",
        };
        write!(f, "{} -> {} ({reason})", self.from, self.target,)
    }
}

/// One generated file.
#[derive(Debug, Clone)]
pub struct Generated {
    /// Where it goes, relative to the output root.
    pub path: std::path::PathBuf,
    pub source: String,
    /// Refs that fell back to `serde_json::Value`.
    pub unresolved: Vec<Unresolved>,
}

/// Support types every generated file may reference.
///
/// Emitted once into the root `mod.rs` rather than duplicated: `blob` is the
/// only lexicon primitive with no direct Rust equivalent.
pub const SUPPORT_TYPES: &str = r#"
/// A `blob` reference, as it appears in a record.
///
/// The bytes live in the repository's blob store; a record carries only this
/// pointer. `mime_type` and `size` are what a client needs to decide whether
/// to fetch it.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Blob {
    /// Always `blob` for the current encoding.
    #[serde(rename = "$type", default, skip_serializing_if = "Option::is_none")]
    pub type_: Option<String>,
    /// The content-addressed link to the bytes.
    #[serde(rename = "ref")]
    pub ref_: BlobRef,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    pub size: i64,
}

/// The `$link` wrapper dag-json uses for a CID.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct BlobRef {
    #[serde(rename = "$link")]
    pub link: String,
}
"#;

/// Generates the module for one lexicon document.
///
/// `known` maps every NSID being generated to the defs it declares, so a ref
/// can be told apart three ways: resolvable, pointing at a lexicon this
/// repository does not vendor, or dangling. The last two fall back to raw JSON
/// and are reported in [`Generated::unresolved`].
pub fn document(doc: &Document, known: &Catalogue) -> Result<Generated> {
    let segments = module_path(&doc.id);
    let mut path = std::path::PathBuf::new();
    for segment in &segments {
        path.push(segment);
    }
    path.set_extension("rs");

    let mut out = String::new();
    writeln!(out, "//! `{}`", doc.id)?;
    writeln!(out, "//!")?;
    writeln!(
        out,
        "//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:"
    )?;
    writeln!(
        out,
        "//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun"
    )?;
    writeln!(out, "//! `cargo run -p rocksky-lexicon-codegen`.")?;
    writeln!(out)?;
    writeln!(out, "#![allow(unused_imports)]")?;
    writeln!(out)?;
    writeln!(out, "use serde::{{Deserialize, Serialize}};")?;

    // The support types live in the root `mod.rs`, which is `depth` modules up.
    let supers = "super::".repeat(segments.len());
    writeln!(out, "use {supers}Blob;")?;
    writeln!(out)?;
    writeln!(out, "/// The lexicon this module was generated from.")?;

    let context = Context {
        nsid: doc.id.clone(),
        depth: segments.len(),
        known: known.clone(),
        unresolved: Default::default(),
    };
    writeln!(out, "pub const NSID: &str = \"{}\";", doc.id)?;

    for (name, def) in &doc.defs {
        out.push('\n');
        emit_def(&mut out, &context, name, def)?;
    }

    Ok(Generated {
        path,
        source: out,
        unresolved: context.unresolved.into_inner(),
    })
}

/// What the emitter needs to know about where it is.
struct Context {
    nsid: String,
    /// How many modules deep this file sits, for building `super::` chains.
    depth: usize,
    /// Every NSID being generated, and the defs each declares.
    known: Catalogue,
    /// Collected as resolution happens, which is why it needs interior
    /// mutability: `resolve` is called from `&self` deep inside the emitter.
    unresolved: std::cell::RefCell<Vec<Unresolved>>,
}

impl Context {
    /// The Rust path for a `ref` target, relative to this module.
    ///
    /// A local `#def` is a sibling in the same file. A cross-document ref
    /// climbs to the generated root with `super::` and comes back down, so the
    /// generated tree needs no `crate::` prefix and can be included from
    /// anywhere.
    fn resolve(&self, target: &str) -> String {
        let reference = parse_ref(target);

        let Some(nsid) = reference.nsid else {
            return def_type_name(&self.nsid, &reference.def);
        };

        if nsid == self.nsid {
            return def_type_name(&self.nsid, &reference.def);
        }

        // Two ways a ref can fail to resolve, both falling back to raw JSON
        // so one broken lexicon does not block generation of the rest.
        let Some(defs) = self.known.get(&nsid) else {
            // A lexicon this repository does not vendor — the `com.atproto.*`
            // and some `app.bsky.*` documents are referenced but not carried.
            self.unresolved.borrow_mut().push(Unresolved {
                from: self.nsid.clone(),
                target: target.to_string(),
                reason: UnresolvedReason::ForeignLexicon,
            });
            return "serde_json::Value".to_string();
        };

        if !defs.contains(&reference.def) {
            // The lexicon is here but has no such def: a dangling ref, which
            // is a bug in the lexicon rather than a limit of this generator.
            self.unresolved.borrow_mut().push(Unresolved {
                from: self.nsid.clone(),
                target: target.to_string(),
                reason: UnresolvedReason::DanglingDef,
            });
            return "serde_json::Value".to_string();
        }

        let mut path = String::new();
        for _ in 0..self.depth {
            path.push_str("super::");
        }
        for segment in module_path(&nsid) {
            path.push_str(&segment);
            path.push_str("::");
        }
        path.push_str(&def_type_name(&nsid, &reference.def));
        path
    }
}

/// The Rust type name for a def in `nsid`.
///
/// `main` has no usable name of its own, so a record's `main` takes the name
/// of its NSID's last segment — `app.rocksky.scrobble#main` is `Scrobble`.
/// Method `main` defs generate `Parameters`/`Input`/`Output` instead and are
/// never referenced this way.
fn def_type_name(nsid: &str, def: &str) -> String {
    if def == "main" {
        record_ident(nsid)
    } else {
        type_ident(def)
    }
}

fn emit_def(out: &mut String, context: &Context, name: &str, def: &Def) -> Result<()> {
    match def {
        Def::Query(method) | Def::Procedure(method) => emit_method(out, context, method),
        Def::Record(record) => {
            let type_name = def_type_name(&context.nsid, name);
            emit_record(out, context, &type_name, record)
        }
        Def::Object(object) | Def::Params(object) => {
            let type_name = def_type_name(&context.nsid, name);
            emit_object(
                out,
                context,
                &type_name,
                object,
                object.description.as_deref(),
            )
        }
        Def::StringDef(string) => {
            // A standalone string def is a named scalar — a token-like value.
            // Emitted as a type alias so refs to it resolve.
            doc_comment(out, string.description.as_deref(), 0);
            writeln!(
                out,
                "pub type {} = String;",
                def_type_name(&context.nsid, name)
            )?;
            Ok(())
        }
        Def::Union(union) => {
            let type_name = def_type_name(&context.nsid, name);
            emit_union(out, context, &type_name, union)
        }
        Def::Array(array) => {
            let inner = schema_type(out, context, &array.items, &format!("{name}Item"))?;
            doc_comment(out, array.description.as_deref(), 0);
            writeln!(
                out,
                "pub type {} = Vec<{inner}>;",
                def_type_name(&context.nsid, name)
            )?;
            Ok(())
        }
        Def::Unsupported => bail!(
            "{}: def `{name}` uses a construct this generator does not model",
            context.nsid
        ),
    }
}

fn emit_method(out: &mut String, context: &Context, method: &Method) -> Result<()> {
    if let Some(parameters) = &method.parameters {
        emit_object(
            out,
            context,
            "Parameters",
            parameters,
            Some(
                method
                    .description
                    .as_deref()
                    .unwrap_or("Query-string parameters."),
            ),
        )?;
        out.push('\n');
    }

    for (body, type_name, fallback) in [
        (&method.input, "Input", "The request body."),
        (&method.output, "Output", "The response body."),
    ] {
        let Some(body) = body else { continue };
        let Some(schema) = &body.schema else {
            // A body with an encoding but no schema is opaque bytes — an
            // uploaded file. Nothing to generate; the encoding is recorded so
            // a reader knows the body is not JSON.
            // A plain comment, not a doc comment: there is no item to attach
            // one to, and `///` with nothing after it does not compile.
            writeln!(
                out,
                "// {type_name}: `{}`, with no JSON schema — an opaque body.",
                body.encoding.as_deref().unwrap_or("*/*")
            )?;
            out.push('\n');
            continue;
        };

        match schema {
            Schema::Object(object) => {
                emit_object(out, context, type_name, object, Some(fallback))?;
            }
            Schema::Ref(reference) => {
                writeln!(out, "/// {fallback}")?;
                writeln!(
                    out,
                    "pub type {type_name} = {};",
                    context.resolve(&reference.target)
                )?;
            }
            other => {
                let inner = schema_type(out, context, other, type_name)?;
                writeln!(out, "/// {fallback}")?;
                writeln!(out, "pub type {type_name} = {inner};")?;
            }
        }
        out.push('\n');
    }

    emit_handler_trait(out, method)?;

    if !method.errors.is_empty() {
        writeln!(out, "/// The errors this method can return.")?;
        writeln!(out, "///")?;
        for error in &method.errors {
            match &error.description {
                Some(description) => {
                    writeln!(out, "/// - `{}`: {}", error.name, one_line(description))?
                }
                None => writeln!(out, "/// - `{}`", error.name)?,
            }
        }
        writeln!(out, "pub const ERRORS: &[&str] = &[")?;
        for error in &method.errors {
            writeln!(out, "    \"{}\",", error.name)?;
        }
        writeln!(out, "];")?;
    }

    Ok(())
}

/// Emits the handler trait for a method, in the method's own module.
///
/// Here rather than in one shared file for two reasons. The type paths are
/// local — `Parameters`, `Output` — so the signature reads like the lexicon.
/// And the name cannot collide: `app.rocksky.dropbox.getFiles` and
/// `app.rocksky.googledrive.getFiles` would both be `GetFilesHandler` in a
/// flat namespace, which is exactly the clash a first attempt at this hit.
///
/// A method with no output gets no trait: there is nothing for the lexicon to
/// constrain, and a trait returning `()` would only add noise.
fn emit_handler_trait(out: &mut String, method: &Method) -> Result<()> {
    let has_output = method
        .output
        .as_ref()
        .is_some_and(|body| body.schema.is_some());
    if !has_output {
        return Ok(());
    }

    let mut arguments = Vec::new();
    if method.parameters.is_some() {
        arguments.push("parameters: Parameters");
    }
    if method
        .input
        .as_ref()
        .is_some_and(|body| body.schema.is_some())
    {
        arguments.push("input: Input");
    }

    writeln!(out, "/// This method, implemented.")?;
    writeln!(out, "///")?;
    writeln!(
        out,
        "/// Implementing this ties a handler to the lexicon's own types: one that"
    )?;
    writeln!(
        out,
        "/// takes the wrong parameters or answers the wrong shape fails to compile"
    )?;
    writeln!(
        out,
        "/// rather than being discovered by a client. The body is hand-written —"
    )?;
    writeln!(out, "/// nothing about it is in the lexicon.")?;
    writeln!(out, "pub trait Handler {{")?;
    writeln!(out, "    /// What a failure is reported as.")?;
    writeln!(out, "    type Error;")?;
    writeln!(out)?;
    writeln!(
        out,
        "    fn handle(&self{}) -> impl std::future::Future<Output = Result<Output, Self::Error>> + Send;",
        if arguments.is_empty() {
            String::new()
        } else {
            format!(", {}", arguments.join(", "))
        }
    )?;
    writeln!(out, "}}")?;
    out.push('\n');
    Ok(())
}

fn emit_record(
    out: &mut String,
    context: &Context,
    type_name: &str,
    record: &Record,
) -> Result<()> {
    let mut description = record
        .description
        .clone()
        .unwrap_or_else(|| format!("A `{}` record.", context.nsid));
    if let Some(key) = &record.key {
        description.push_str(&format!("\n\nRecord key: `{key}`."));
    }
    emit_object(out, context, type_name, &record.record, Some(&description))
}

/// Emits a struct, plus any nested structs its inline objects need.
fn emit_object(
    out: &mut String,
    context: &Context,
    type_name: &str,
    object: &Object,
    description: Option<&str>,
) -> Result<()> {
    // Nested types are emitted before the struct that uses them, so the file
    // reads top-down without forward references mattering.
    let mut nested = String::new();
    let mut fields = String::new();

    let nullable: BTreeSet<&str> = object.nullable.iter().map(String::as_str).collect();
    let required: BTreeSet<&str> = object.required.iter().map(String::as_str).collect();

    for (property, schema) in &object.properties {
        let inner = schema_type(
            &mut nested,
            context,
            schema,
            &format!("{type_name}{}", pascal_case(property)),
        )?;

        let is_required = required.contains(property.as_str());
        let is_nullable = nullable.contains(property.as_str());
        let rust_type = if is_required && !is_nullable {
            inner
        } else {
            format!("Option<{inner}>")
        };

        let mut notes = Vec::new();
        if let Some(description) = schema.description() {
            notes.push(one_line(description));
        }
        if is_nullable {
            notes
                .push("May be explicitly null as well as absent; both read as `None`.".to_string());
        }
        if let Schema::String(string) = schema {
            if !string.known_values.is_empty() {
                notes.push(format!("Known values: {}.", quoted(&string.known_values)));
            }
            if !string.enum_values.is_empty() {
                notes.push(format!("One of: {}.", quoted(&string.enum_values)));
            }
            if let Some(format) = &string.format {
                notes.push(format!("Format: `{format}`."));
            }
        }

        if !notes.is_empty() {
            doc_comment(&mut fields, Some(&notes.join(" ")), 4);
        }

        let ident = field_ident(property);
        if needs_rename(property) {
            writeln!(fields, "    #[serde(rename = \"{property}\")]")?;
        }
        if !is_required || is_nullable {
            writeln!(
                fields,
                "    #[serde(default, skip_serializing_if = \"Option::is_none\")]"
            )?;
        }
        writeln!(fields, "    pub {ident}: {rust_type},")?;
    }

    out.push_str(&nested);
    doc_comment(out, description, 0);
    writeln!(
        out,
        "#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]"
    )?;
    // Every lexicon property is camelCase on the wire; the struct is
    // snake_case. `rename_all` covers the common case and the per-field
    // renames above cover the rest.
    writeln!(out, "#[serde(rename_all = \"camelCase\")]")?;

    if fields.is_empty() {
        // A struct with no properties — an empty response body. A unit struct
        // would serialize as `null`, so this keeps it an object.
        writeln!(out, "pub struct {type_name} {{}}")?;
    } else {
        writeln!(out, "pub struct {type_name} {{")?;
        out.push_str(&fields);
        writeln!(out, "}}")?;
    }

    Ok(())
}

/// Emits an untagged enum over a union's variants.
///
/// Untagged rather than internally tagged on `$type`: the referenced objects
/// do not all declare a `$type` property, so serde has nothing to match on.
/// Untagged tries each variant in order, which is correct here because the
/// variants are structurally distinct.
fn emit_union(out: &mut String, context: &Context, type_name: &str, union: &Union) -> Result<()> {
    let mut description = union
        .description
        .clone()
        .unwrap_or_else(|| format!("One of several `{type_name}` shapes."));
    if !union.closed {
        description.push_str(
            "\n\nAn open union: a variant this build does not know about is kept \
             as raw JSON rather than rejected.",
        );
    }
    doc_comment(out, Some(&description), 0);

    writeln!(
        out,
        "#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]"
    )?;
    writeln!(out, "#[serde(untagged)]")?;
    writeln!(out, "pub enum {type_name} {{")?;
    for target in &union.refs {
        let reference = parse_ref(target);
        let variant = type_ident(&reference.def);
        writeln!(out, "    {variant}({}),", context.resolve(target))?;
    }
    if !union.closed {
        writeln!(out, "    /// A `$type` this build does not model.")?;
        writeln!(out, "    Other(serde_json::Value),")?;
    }
    writeln!(out, "}}")?;
    Ok(())
}

/// The Rust type for a schema, emitting any nested struct it needs into
/// `nested`.
fn schema_type(
    nested: &mut String,
    context: &Context,
    schema: &Schema,
    nested_name: &str,
) -> Result<String> {
    Ok(match schema {
        Schema::String(_) => "String".to_string(),
        Schema::Integer(_) => "i64".to_string(),
        Schema::Boolean(_) => "bool".to_string(),
        Schema::Unknown(_) => "serde_json::Value".to_string(),
        Schema::Blob(_) => "Blob".to_string(),
        Schema::Ref(reference) => context.resolve(&reference.target),
        Schema::Array(array) => {
            let inner = schema_type(nested, context, &array.items, &format!("{nested_name}Item"))?;
            format!("Vec<{inner}>")
        }
        Schema::Object(object) => {
            emit_object(
                nested,
                context,
                nested_name,
                object,
                object.description.as_deref(),
            )?;
            nested.push('\n');
            nested_name.to_string()
        }
        Schema::Union(union) => {
            emit_union(nested, context, nested_name, union)?;
            nested.push('\n');
            nested_name.to_string()
        }
        Schema::Unsupported => bail!(
            "{}: property type in `{nested_name}` is not modelled by this generator",
            context.nsid
        ),
    })
}

/// Writes a `///` comment, wrapping at a readable width.
fn doc_comment(out: &mut String, text: Option<&str>, indent: usize) {
    let Some(text) = text else { return };
    let pad = " ".repeat(indent);

    for paragraph in text.split("\n\n") {
        let paragraph = one_line(paragraph);
        if paragraph.is_empty() {
            continue;
        }
        let mut line = String::new();
        for word in paragraph.split_whitespace() {
            if !line.is_empty() && line.len() + word.len() + 1 > 72 {
                let _ = writeln!(out, "{pad}/// {line}");
                line.clear();
            }
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(word);
        }
        if !line.is_empty() {
            let _ = writeln!(out, "{pad}/// {line}");
        }
        let _ = writeln!(out, "{pad}///");
    }

    // Drop the trailing empty comment line the loop above always leaves.
    let trailing = format!("{pad}///\n");
    if out.ends_with(&trailing) {
        out.truncate(out.len() - trailing.len());
    }
}

/// Collapses whitespace so a multi-line lexicon description fits one comment
/// line.
fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn quoted(values: &[String]) -> String {
    values
        .iter()
        .map(|value| format!("`{value}`"))
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Generates one document, treating every NSID it references as present
    /// so ref paths are exercised rather than falling back to raw JSON.
    fn generate(raw: serde_json::Value) -> String {
        let doc: Document = serde_json::from_value(raw).expect("the lexicon parses");
        let mut known: Catalogue = Catalogue::new();
        known.insert(doc.id.clone(), doc.defs.keys().cloned().collect());
        // Every ref target is treated as present, so cross-document paths are
        // exercised rather than falling back to raw JSON.
        let mut targets = BTreeSet::new();
        collect_refs(
            &serde_json::to_value(&doc.defs).unwrap_or_default(),
            &mut targets,
        );
        for target in targets {
            let reference = crate::naming::parse_ref(&target);
            if let Some(nsid) = reference.nsid {
                known.entry(nsid).or_default().insert(reference.def);
            }
        }
        document(&doc, &known).expect("it generates").source
    }

    fn collect_refs(value: &serde_json::Value, known: &mut BTreeSet<String>) {
        match value {
            serde_json::Value::Object(map) => {
                if let Some(serde_json::Value::String(target)) = map.get("ref") {
                    known.insert(target.clone());
                }
                if let Some(serde_json::Value::Array(refs)) = map.get("refs") {
                    for target in refs.iter().filter_map(|r| r.as_str()) {
                        known.insert(target.to_string());
                    }
                }
                for item in map.values() {
                    collect_refs(item, known);
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    collect_refs(item, known);
                }
            }
            _ => {}
        }
    }

    #[test]
    fn an_object_def_becomes_a_struct() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "app.rocksky.song.defs",
            "defs": {
                "songViewBasic": {
                    "type": "object",
                    "description": "A song, compactly.",
                    "required": ["title", "duration"],
                    "properties": {
                        "title": { "type": "string" },
                        "duration": { "type": "integer" },
                        "albumArt": { "type": "string", "format": "uri" },
                        "mbId": { "type": "string" }
                    }
                }
            }
        }));

        assert!(source.contains("pub struct SongViewBasic {"), "{source}");
        assert!(source.contains("/// A song, compactly."), "{source}");
        // Required fields are bare; optional ones are Option and skipped.
        assert!(source.contains("pub title: String,"), "{source}");
        assert!(source.contains("pub duration: i64,"), "{source}");
        assert!(
            source.contains("pub album_art: Option<String>,"),
            "{source}"
        );
        assert!(
            source.contains("skip_serializing_if = \"Option::is_none\""),
            "{source}"
        );
        // camelCase is handled by rename_all, so no per-field rename.
        assert!(
            source.contains("#[serde(rename_all = \"camelCase\")]"),
            "{source}"
        );
        assert!(!source.contains("rename = \"albumArt\""), "{source}");
        assert!(!source.contains("rename = \"mbId\""), "{source}");
        // `mbId` must be `mb_id`, not `m_b_id`.
        assert!(source.contains("pub mb_id: Option<String>,"), "{source}");
    }

    #[test]
    fn a_query_generates_parameters_and_output() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "app.rocksky.actor.getActorSongs",
            "defs": {
                "main": {
                    "type": "query",
                    "description": "Get songs for an actor",
                    "parameters": {
                        "type": "params",
                        "required": ["did"],
                        "properties": {
                            "did": { "type": "string", "format": "at-identifier" },
                            "limit": { "type": "integer", "minimum": 1 }
                        }
                    },
                    "output": {
                        "encoding": "application/json",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "songs": {
                                    "type": "array",
                                    "items": {
                                        "type": "ref",
                                        "ref": "app.rocksky.song.defs#songViewBasic"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }));

        assert!(source.contains("pub struct Parameters {"), "{source}");
        assert!(source.contains("pub did: String,"), "{source}");
        assert!(source.contains("pub limit: Option<i64>,"), "{source}");
        assert!(source.contains("pub struct Output {"), "{source}");
        assert!(
            source.contains("pub const NSID: &str = \"app.rocksky.actor.getActorSongs\";"),
            "{source}"
        );

        // A cross-document ref climbs out of `app/rocksky/actor/` — four
        // modules deep — and back down into `app/rocksky/song/defs`.
        assert!(
            source.contains(
                "Vec<super::super::super::super::app::rocksky::song::defs::SongViewBasic>"
            ),
            "{source}"
        );
    }

    #[test]
    fn a_record_is_named_after_its_nsid() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "app.rocksky.scrobble",
            "defs": {
                "main": {
                    "type": "record",
                    "key": "tid",
                    "record": {
                        "type": "object",
                        "required": ["title"],
                        "properties": { "title": { "type": "string" } }
                    }
                }
            }
        }));

        assert!(source.contains("pub struct Scrobble {"), "{source}");
        assert!(source.contains("Record key: `tid`."), "{source}");
    }

    /// A property named after a keyword must still compile.
    #[test]
    fn keyword_properties_are_escaped_without_a_rename() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "com.example.thing",
            "defs": {
                "main": {
                    "type": "record",
                    "record": {
                        "type": "object",
                        "required": ["type", "ref"],
                        "properties": {
                            "type": { "type": "string" },
                            "ref": { "type": "string" }
                        }
                    }
                }
            }
        }));

        // Escaped so the file compiles, and *not* renamed: serde's camelCase
        // already drops the trailing underscore, so the wire name is right.
        assert!(source.contains("pub type_: String,"), "{source}");
        assert!(source.contains("pub ref_: String,"), "{source}");
        assert!(!source.contains("rename = \"type\""), "{source}");
        assert!(!source.contains("rename = \"ref\""), "{source}");
    }

    /// An inline object becomes its own struct named after the field, so no
    /// anonymous types are needed.
    #[test]
    fn an_inline_object_becomes_a_nested_struct() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "app.rocksky.artist.getArtistListeners",
            "defs": {
                "listener": {
                    "type": "object",
                    "required": ["mostListenedSong"],
                    "properties": {
                        "mostListenedSong": {
                            "type": "object",
                            "required": ["title"],
                            "properties": {
                                "title": { "type": "string" },
                                "playCount": { "type": "integer" }
                            }
                        }
                    }
                }
            }
        }));

        // The nested struct is emitted first, then referenced.
        assert!(
            source.contains("pub struct ListenerMostListenedSong {"),
            "{source}"
        );
        assert!(
            source.contains("pub most_listened_song: ListenerMostListenedSong,"),
            "{source}"
        );
        assert!(
            source.find("pub struct ListenerMostListenedSong").unwrap()
                < source.find("pub struct Listener {").unwrap(),
            "the nested struct must come first"
        );
    }

    #[test]
    fn a_local_ref_stays_in_the_same_module() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "app.rocksky.song.defs",
            "defs": {
                "songViewBasic": {
                    "type": "object",
                    "properties": { "title": { "type": "string" } }
                },
                "songList": {
                    "type": "object",
                    "required": ["songs"],
                    "properties": {
                        "songs": {
                            "type": "array",
                            "items": { "type": "ref", "ref": "#songViewBasic" }
                        }
                    }
                }
            }
        }));

        assert!(
            source.contains("pub songs: Vec<SongViewBasic>,"),
            "{source}"
        );
        // Named directly, with no module path. The `use super::…Blob` line
        // every generated file carries is the only `super::` here, so the
        // assertion names the type rather than the keyword.
        assert!(
            !source.contains("super::SongViewBasic"),
            "a local ref needs no path: {source}"
        );
    }

    #[test]
    fn a_union_becomes_an_untagged_enum() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "app.rocksky.feed.defs",
            "defs": {
                "item": {
                    "type": "union",
                    "refs": ["#songView", "#albumView"]
                },
                "songView": { "type": "object", "properties": {} },
                "albumView": { "type": "object", "properties": {} }
            }
        }));

        assert!(source.contains("#[serde(untagged)]"), "{source}");
        assert!(source.contains("pub enum Item {"), "{source}");
        assert!(source.contains("SongView(SongView),"), "{source}");
        assert!(source.contains("AlbumView(AlbumView),"), "{source}");
        // Open by default, so an unknown variant is kept rather than rejected.
        assert!(source.contains("Other(serde_json::Value),"), "{source}");
    }

    /// A nullable property is `Option` even when it is in `required`, because
    /// the value may be explicitly null.
    #[test]
    fn a_nullable_required_property_is_still_optional() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "com.example.thing",
            "defs": {
                "main": {
                    "type": "record",
                    "record": {
                        "type": "object",
                        "required": ["title"],
                        "nullable": ["title"],
                        "properties": { "title": { "type": "string" } }
                    }
                }
            }
        }));

        assert!(source.contains("pub title: Option<String>,"), "{source}");
        assert!(source.contains("May be explicitly null"), "{source}");
    }

    /// Known values belong in the doc comment: generating an enum would break
    /// the moment a server sends a value this build predates.
    #[test]
    fn known_values_are_documented_not_enumerated() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "com.example.thing",
            "defs": {
                "main": {
                    "type": "record",
                    "record": {
                        "type": "object",
                        "required": ["span"],
                        "properties": {
                            "span": {
                                "type": "string",
                                "knownValues": ["day", "week", "month"]
                            }
                        }
                    }
                }
            }
        }));

        assert!(source.contains("pub span: String,"), "{source}");
        assert!(
            source.contains("Known values: `day`, `week`, `month`."),
            "{source}"
        );
    }

    #[test]
    fn method_errors_become_a_constant() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "com.example.doThing",
            "defs": {
                "main": {
                    "type": "procedure",
                    "errors": [
                        { "name": "NotFound", "description": "No such thing." },
                        { "name": "RateLimited" }
                    ]
                }
            }
        }));

        assert!(
            source.contains("pub const ERRORS: &[&str] = &["),
            "{source}"
        );
        assert!(source.contains("\"NotFound\","), "{source}");
        assert!(source.contains("\"RateLimited\","), "{source}");
        assert!(
            source.contains("/// - `NotFound`: No such thing."),
            "{source}"
        );
    }

    /// A body with an encoding but no schema is an uploaded file. Generating a
    /// struct for it would be wrong.
    #[test]
    fn a_schemaless_body_generates_no_struct() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "com.example.upload",
            "defs": {
                "main": {
                    "type": "procedure",
                    "input": { "encoding": "*/*" }
                }
            }
        }));

        assert!(!source.contains("pub struct Input"), "{source}");
        assert!(source.contains("opaque body"), "{source}");
    }

    /// An unmodelled construct must fail the build, not generate nothing.
    #[test]
    fn an_unsupported_def_is_an_error() {
        let doc: Document = serde_json::from_value(serde_json::json!({
            "lexicon": 1,
            "id": "com.example.stream",
            "defs": { "main": { "type": "subscription" } }
        }))
        .unwrap();

        let error = document(&doc, &Catalogue::new()).unwrap_err().to_string();
        assert!(error.contains("com.example.stream"), "{error}");
        assert!(error.contains("main"), "{error}");
    }

    /// An empty response body must still be an object, not `null`.
    #[test]
    fn an_empty_output_is_an_empty_struct() {
        let source = generate(serde_json::json!({
            "lexicon": 1,
            "id": "com.example.doThing",
            "defs": {
                "main": {
                    "type": "procedure",
                    "output": {
                        "encoding": "application/json",
                        "schema": { "type": "object", "properties": {} }
                    }
                }
            }
        }));

        assert!(source.contains("pub struct Output {}"), "{source}");
    }

    #[test]
    fn the_file_goes_where_its_nsid_says() {
        let doc: Document = serde_json::from_value(serde_json::json!({
            "lexicon": 1,
            "id": "app.rocksky.actor.getActorSongs",
            "defs": { "main": { "type": "query" } }
        }))
        .unwrap();

        let generated = document(&doc, &Catalogue::new()).unwrap();
        assert_eq!(
            generated.path,
            std::path::PathBuf::from("app/rocksky/actor/get_actor_songs.rs")
        );
    }
}
