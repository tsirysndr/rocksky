//! The lexicon document, as far as this generator needs to understand it.
//!
//! Deliberately not a complete model of the ATProto lexicon spec — only the
//! constructs the `app.rocksky.*` lexicons actually use. Across the 189
//! documents that is:
//!
//! | construct   | count | generated as                      |
//! |-------------|-------|-----------------------------------|
//! | `query`     |    99 | `Parameters` + `Output`           |
//! | `object`    |    81 | a struct                          |
//! | `procedure` |    52 | `Parameters` + `Input` + `Output` |
//! | `record`    |    15 | a struct with `$type`             |
//! | `union`     |     2 | an untagged enum                  |
//!
//! Anything outside that — `subscription`, `token`, `bytes`, `cid-link` — is
//! reported as unsupported rather than silently skipped, so a lexicon that
//! starts using one fails the build instead of quietly generating nothing.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// One lexicon file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    #[serde(default)]
    pub defs: BTreeMap<String, Def>,
}

/// A named definition inside a document.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Def {
    Query(Method),
    Procedure(Method),
    Record(Record),
    Object(Object),
    /// A bare `params` def, which a few lexicons use in place of an object.
    Params(Object),
    #[serde(rename = "string")]
    StringDef(StringType),
    Union(Union),
    Array(Array),
    /// Anything this generator does not model. Kept as a variant rather than
    /// a parse failure so the error names the def and the file.
    #[serde(other)]
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Method {
    #[serde(default)]
    pub description: Option<String>,
    /// Query-string parameters. Always a `params` object when present.
    #[serde(default)]
    pub parameters: Option<Object>,
    /// Request body, for procedures.
    #[serde(default)]
    pub input: Option<Body>,
    #[serde(default)]
    pub output: Option<Body>,
    /// Named errors the method can return.
    #[serde(default)]
    pub errors: Vec<MethodError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodError {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// A request or response body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Body {
    #[serde(default)]
    pub encoding: Option<String>,
    #[serde(default)]
    pub schema: Option<Schema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    #[serde(default)]
    pub description: Option<String>,
    /// `tid`, `literal:self`, `any` — affects nothing in the generated type.
    #[serde(default)]
    pub key: Option<String>,
    pub record: Object,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Object {
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub required: Vec<String>,
    /// Properties that may be explicitly `null` as well as absent. The spec
    /// distinguishes the two; Rust's `Option` does not, so both become
    /// `Option<T>` and the distinction is lost — which is the right trade,
    /// because serde cannot express "present but null" without a wrapper that
    /// would infect every field.
    #[serde(default)]
    pub nullable: Vec<String>,
    #[serde(default)]
    pub properties: BTreeMap<String, Schema>,
}

/// A property's type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum Schema {
    String(StringType),
    Integer(IntegerType),
    Boolean(BooleanType),
    Object(Box<Object>),
    Array(Array),
    #[serde(rename = "ref")]
    Ref(RefType),
    Union(Union),
    Blob(Blob),
    Unknown(Unknown),
    #[serde(other)]
    Unsupported,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StringType {
    #[serde(default)]
    pub description: Option<String>,
    /// `at-uri`, `datetime`, `did`, `uri`, `at-identifier`, `cid`. Recorded
    /// for the doc comment; every one of them is a `String` in Rust, because
    /// a newtype per format would make every construction site noisier without
    /// catching anything serde would not.
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub known_values: Vec<String>,
    #[serde(default, rename = "enum")]
    pub enum_values: Vec<String>,
    #[serde(default)]
    pub default: Option<String>,
    #[serde(default)]
    pub min_length: Option<u64>,
    #[serde(default)]
    pub max_length: Option<u64>,
    #[serde(default)]
    pub max_graphemes: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IntegerType {
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub default: Option<i64>,
    #[serde(default)]
    pub minimum: Option<i64>,
    #[serde(default)]
    pub maximum: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BooleanType {
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub default: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Array {
    #[serde(default)]
    pub description: Option<String>,
    pub items: Box<Schema>,
    #[serde(default, rename = "minLength")]
    pub min_length: Option<u64>,
    #[serde(default, rename = "maxLength")]
    pub max_length: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefType {
    #[serde(default)]
    pub description: Option<String>,
    /// Either `#localDef` or a full `nsid#def`.
    #[serde(rename = "ref")]
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Union {
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub refs: Vec<String>,
    /// A closed union cannot gain variants, so an unknown `$type` is an error
    /// rather than a fallback.
    #[serde(default)]
    pub closed: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Blob {
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub accept: Vec<String>,
    #[serde(default)]
    pub max_size: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Unknown {
    #[serde(default)]
    pub description: Option<String>,
}

impl Schema {
    pub fn description(&self) -> Option<&str> {
        match self {
            Schema::String(s) => s.description.as_deref(),
            Schema::Integer(s) => s.description.as_deref(),
            Schema::Boolean(s) => s.description.as_deref(),
            Schema::Object(s) => s.description.as_deref(),
            Schema::Array(s) => s.description.as_deref(),
            Schema::Ref(s) => s.description.as_deref(),
            Schema::Union(s) => s.description.as_deref(),
            Schema::Blob(s) => s.description.as_deref(),
            Schema::Unknown(s) => s.description.as_deref(),
            Schema::Unsupported => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_query_parses_with_its_parameters_and_output() {
        let raw = serde_json::json!({
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
        });

        let document: Document = serde_json::from_value(raw).expect("parses");
        assert_eq!(document.id, "app.rocksky.actor.getActorSongs");

        let Some(Def::Query(method)) = document.defs.get("main") else {
            panic!("main should be a query");
        };
        let parameters = method.parameters.as_ref().expect("has parameters");
        assert_eq!(parameters.required, vec!["did"]);
        assert!(matches!(
            parameters.properties.get("did"),
            Some(Schema::String(_))
        ));

        let schema = method.output.as_ref().unwrap().schema.as_ref().unwrap();
        let Schema::Object(object) = schema else {
            panic!("the output is an object");
        };
        let Some(Schema::Array(array)) = object.properties.get("songs") else {
            panic!("songs is an array");
        };
        let Schema::Ref(reference) = array.items.as_ref() else {
            panic!("its items are refs");
        };
        assert_eq!(reference.target, "app.rocksky.song.defs#songViewBasic");
    }

    #[test]
    fn a_record_parses_with_its_key_and_shape() {
        let raw = serde_json::json!({
            "lexicon": 1,
            "id": "app.rocksky.scrobble",
            "defs": {
                "main": {
                    "type": "record",
                    "key": "tid",
                    "record": {
                        "type": "object",
                        "required": ["title", "artist"],
                        "properties": {
                            "title": { "type": "string" },
                            "artist": { "type": "string" },
                            "duration": { "type": "integer" }
                        }
                    }
                }
            }
        });

        let document: Document = serde_json::from_value(raw).expect("parses");
        let Some(Def::Record(record)) = document.defs.get("main") else {
            panic!("main should be a record");
        };
        assert_eq!(record.key.as_deref(), Some("tid"));
        assert_eq!(record.record.properties.len(), 3);
        assert_eq!(record.record.required.len(), 2);
    }

    /// An unmodelled construct must surface as `Unsupported` rather than
    /// failing the parse, so the error can name the file and def.
    #[test]
    fn an_unmodelled_def_is_reported_not_dropped() {
        let raw = serde_json::json!({
            "lexicon": 1,
            "id": "com.example.thing",
            "defs": {
                "main": { "type": "subscription", "message": {} }
            }
        });

        let document: Document = serde_json::from_value(raw).expect("still parses");
        assert!(matches!(document.defs.get("main"), Some(Def::Unsupported)));
    }

    #[test]
    fn an_unmodelled_property_type_is_reported_not_dropped() {
        let schema: Schema =
            serde_json::from_value(serde_json::json!({ "type": "cid-link" })).expect("parses");
        assert!(matches!(schema, Schema::Unsupported));
    }

    /// Both spellings of an enumerated string are read, because the lexicons
    /// use `knownValues` and the spec also allows `enum`.
    #[test]
    fn enumerated_strings_keep_their_values() {
        let schema: Schema = serde_json::from_value(serde_json::json!({
            "type": "string",
            "knownValues": ["day", "week", "month"]
        }))
        .unwrap();
        let Schema::String(string) = schema else {
            panic!("a string");
        };
        assert_eq!(string.known_values, ["day", "week", "month"]);
    }
}
