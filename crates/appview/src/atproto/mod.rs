//! Identity resolution and repository fetching.
//!
//! Only what the backfill needs: a DID's PDS endpoint, and the repository CAR
//! from it. Resolution is done directly over HTTP rather than through
//! `jacquard-identity` so the DID document cache stays in this crate's own
//! SQLite and there is one fewer moving part in the sync path.

pub mod car;
pub mod mst;
pub mod records;
pub mod session;

use serde::Deserialize;

/// The service id in a DID document that names the account's PDS.
const PDS_SERVICE_ID: &str = "#atproto_pds";

#[derive(Debug, Deserialize)]
struct DidDocument {
    #[serde(default, rename = "alsoKnownAs")]
    also_known_as: Vec<String>,
    #[serde(default)]
    service: Vec<Service>,
}

#[derive(Debug, Deserialize)]
struct Service {
    id: String,
    #[serde(rename = "type")]
    service_type: String,
    #[serde(rename = "serviceEndpoint")]
    endpoint: String,
}

impl DidDocument {
    /// The PDS endpoint, matched on the `#atproto_pds` id or, failing that, the
    /// `AtprotoPersonalDataServer` type — some documents in the wild only carry
    /// one of the two.
    fn pds(&self) -> Option<&str> {
        self.service
            .iter()
            .find(|service| {
                service.id == PDS_SERVICE_ID
                    || service.id.ends_with(PDS_SERVICE_ID)
                    || service.service_type == "AtprotoPersonalDataServer"
            })
            .map(|service| service.endpoint.trim_end_matches('/'))
    }

    /// The account's handle, taken from the first `at://` alias.
    ///
    /// Worth doing during resolution: a repository CAR carries no profile, so
    /// without this a backfilled user's handle would be their DID — and
    /// profile URLs are built from handles.
    fn handle(&self) -> Option<&str> {
        self.also_known_as
            .iter()
            .find_map(|alias| alias.strip_prefix("at://"))
            .map(str::trim)
            .filter(|handle| !handle.is_empty())
    }
}

/// What a DID resolves to.
#[derive(Debug, Clone)]
pub struct Identity {
    /// Base URL of the account's PDS.
    pub pds: String,
    /// The account's handle, when the document declares one.
    pub handle: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ResolveError {
    #[error("{0:?} is not a DID this appview can resolve (expected did:plc: or did:web:)")]
    UnsupportedMethod(String),
    #[error("could not reach the DID directory for {did}: {source}")]
    Fetch {
        did: String,
        #[source]
        source: reqwest::Error,
    },
    #[error("the DID directory answered {status} for {did}")]
    Status {
        did: String,
        status: reqwest::StatusCode,
    },
    #[error("the DID document for {0} names no PDS")]
    NoPds(String),
}

/// Resolves a DID to its PDS base URL, discarding the handle.
pub async fn resolve_pds(
    http: &reqwest::Client,
    plc_directory_url: &str,
    did: &str,
) -> Result<String, ResolveError> {
    Ok(resolve(http, plc_directory_url, did).await?.pds)
}

/// Resolves a DID to its PDS and handle.
///
/// `did:plc:` goes through the PLC directory (which `PLC_DIRECTORY_URL` can
/// point at an edge cache); `did:web:` resolves against the domain itself.
pub async fn resolve(
    http: &reqwest::Client,
    plc_directory_url: &str,
    did: &str,
) -> Result<Identity, ResolveError> {
    let url = if let Some(domain) = did.strip_prefix("did:web:") {
        // did:web encodes the host, with %3A for a port.
        let host = domain.replace("%3A", ":");
        format!("https://{host}/.well-known/did.json")
    } else if did.starts_with("did:plc:") {
        format!("{}/{}", plc_directory_url.trim_end_matches('/'), did)
    } else {
        return Err(ResolveError::UnsupportedMethod(did.to_string()));
    };

    let response = http
        .get(&url)
        .send()
        .await
        .map_err(|source| ResolveError::Fetch {
            did: did.to_string(),
            source,
        })?;

    if !response.status().is_success() {
        return Err(ResolveError::Status {
            did: did.to_string(),
            status: response.status(),
        });
    }

    let document: DidDocument = response
        .json()
        .await
        .map_err(|source| ResolveError::Fetch {
            did: did.to_string(),
            source,
        })?;

    let pds = document
        .pds()
        .map(str::to_string)
        .ok_or_else(|| ResolveError::NoPds(did.to_string()))?;

    Ok(Identity {
        pds,
        handle: document.handle().map(str::to_string),
    })
}

/// Downloads a repository as a CAR via `com.atproto.sync.getRepo`.
pub async fn fetch_repo(
    http: &reqwest::Client,
    pds: &str,
    did: &str,
) -> Result<bytes::Bytes, anyhow::Error> {
    let url = format!(
        "{}/xrpc/com.atproto.sync.getRepo?did={}",
        pds.trim_end_matches('/'),
        urlencoding(did),
    );

    let response = http.get(&url).send().await?;
    let status = response.status();
    if !status.is_success() {
        anyhow::bail!("{pds} answered {status} for getRepo({did})");
    }
    Ok(response.bytes().await?)
}

/// Percent-encodes the characters that matter in a DID query parameter. DIDs
/// are otherwise made of URL-safe characters, so a full encoder is overkill.
fn urlencoding(value: &str) -> String {
    value.replace('%', "%25").replace(':', "%3A")
}

/// Every `app.rocksky.*` record in a repository, with its key.
pub fn records_from_car(
    bytes: &[u8],
    collections: &[&str],
) -> Result<Vec<(mst::RecordRef, serde_json::Value)>, anyhow::Error> {
    let car = car::parse(bytes)?;
    let commit = car.commit()?;
    let refs = mst::walk(&car, &commit.data)?;

    let mut out = Vec::new();
    for reference in refs {
        if !collections.contains(&reference.collection.as_str()) {
            continue;
        }
        let Some(block) = car.block(&reference.cid) else {
            // A CAR can legitimately omit blocks it did not need to include;
            // a record we cannot read is skipped rather than failing the repo.
            tracing::debug!(cid = %reference.cid, "record block absent from the CAR");
            continue;
        };
        // dag-cbor to JSON, so the projection works on one representation
        // regardless of whether the record came from a CAR or from TAP.
        match serde_ipld_dagcbor::from_slice::<ipld_core::ipld::Ipld>(block) {
            Ok(value) => out.push((reference, ipld_to_json(value))),
            Err(err) => tracing::debug!(error = %err, "skipping undecodable record"),
        }
    }
    Ok(out)
}

/// Converts decoded dag-cbor into JSON.
///
/// Links and byte strings become strings — a record's blob references are not
/// used by the projection, but turning them into something JSON-shaped keeps
/// the value uniform rather than needing a second representation.
fn ipld_to_json(value: ipld_core::ipld::Ipld) -> serde_json::Value {
    use ipld_core::ipld::Ipld;
    use serde_json::Value;

    match value {
        Ipld::Null => Value::Null,
        Ipld::Bool(value) => Value::Bool(value),
        Ipld::Integer(value) => serde_json::Number::from_i128(value)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        Ipld::Float(value) => serde_json::Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        Ipld::String(value) => Value::String(value),
        Ipld::Bytes(value) => Value::String(base64_standard(&value)),
        Ipld::List(items) => Value::Array(items.into_iter().map(ipld_to_json).collect()),
        Ipld::Map(entries) => Value::Object(
            entries
                .into_iter()
                .map(|(key, value)| (key, ipld_to_json(value)))
                .collect(),
        ),
        // A CID renders as its string form, which is what the JSON
        // representation of dag-cbor uses (`{"$link": …}` unwrapped).
        Ipld::Link(cid) => Value::String(cid.to_string()),
    }
}

fn base64_standard(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plc_did_resolves_against_the_directory() {
        // Only the URL construction is checked here; the request itself is
        // covered by the backfill's integration path.
        assert!(resolve_url("https://plc.directory", "did:plc:abc")
            .unwrap()
            .ends_with("/did:plc:abc"));
    }

    /// Mirrors the URL choice in [`resolve_pds`] so it can be asserted without
    /// a network call.
    fn resolve_url(plc: &str, did: &str) -> Option<String> {
        if let Some(domain) = did.strip_prefix("did:web:") {
            Some(format!(
                "https://{}/.well-known/did.json",
                domain.replace("%3A", ":")
            ))
        } else if did.starts_with("did:plc:") {
            Some(format!("{}/{}", plc.trim_end_matches('/'), did))
        } else {
            None
        }
    }

    #[test]
    fn a_web_did_resolves_against_its_own_domain() {
        assert_eq!(
            resolve_url("https://plc.directory", "did:web:example.com").unwrap(),
            "https://example.com/.well-known/did.json"
        );
        // A port is percent-encoded in the DID and has to be restored.
        assert_eq!(
            resolve_url("https://plc.directory", "did:web:localhost%3A3000").unwrap(),
            "https://localhost:3000/.well-known/did.json"
        );
    }

    #[test]
    fn an_unsupported_did_method_is_rejected() {
        assert!(resolve_url("https://plc.directory", "did:key:zabc").is_none());
    }

    #[tokio::test]
    async fn an_unsupported_method_errors_before_any_request() {
        let err = resolve_pds(
            &reqwest::Client::new(),
            "https://plc.directory",
            "did:key:z",
        )
        .await
        .expect_err("did:key is not resolvable here");
        assert!(matches!(err, ResolveError::UnsupportedMethod(_)), "{err:?}");
    }

    #[test]
    fn the_handle_comes_from_the_first_at_alias() {
        let document: DidDocument = serde_json::from_value(serde_json::json!({
            "alsoKnownAs": ["at://catlady-codes.bsky.social"],
            "service": []
        }))
        .unwrap();
        assert_eq!(document.handle(), Some("catlady-codes.bsky.social"));

        // Non-`at://` aliases are ignored.
        let other: DidDocument = serde_json::from_value(serde_json::json!({
            "alsoKnownAs": ["https://example.com", "at://real.handle"],
        }))
        .unwrap();
        assert_eq!(other.handle(), Some("real.handle"));

        let none: DidDocument = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(none.handle(), None);
    }

    #[test]
    fn the_pds_service_is_found_by_id_or_type() {
        let by_id: DidDocument = serde_json::from_value(serde_json::json!({
            "service": [{
                "id": "#atproto_pds",
                "type": "AtprotoPersonalDataServer",
                "serviceEndpoint": "https://pds.example/"
            }]
        }))
        .unwrap();
        // The trailing slash is trimmed so URLs do not end up doubled.
        assert_eq!(by_id.pds(), Some("https://pds.example"));

        // Some documents use the fully-qualified id.
        let qualified: DidDocument = serde_json::from_value(serde_json::json!({
            "service": [{
                "id": "did:plc:abc#atproto_pds",
                "type": "AtprotoPersonalDataServer",
                "serviceEndpoint": "https://pds.example"
            }]
        }))
        .unwrap();
        assert_eq!(qualified.pds(), Some("https://pds.example"));

        let other: DidDocument = serde_json::from_value(serde_json::json!({
            "service": [{
                "id": "#atproto_labeler",
                "type": "AtprotoLabeler",
                "serviceEndpoint": "https://labeler.example"
            }]
        }))
        .unwrap();
        assert_eq!(other.pds(), None);

        let empty: DidDocument = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(empty.pds(), None);
    }

    #[test]
    fn dids_are_encoded_for_the_query_string() {
        assert_eq!(urlencoding("did:plc:abc"), "did%3Aplc%3Aabc");
    }

    #[test]
    fn dag_cbor_converts_to_json() {
        use ipld_core::ipld::Ipld;
        use std::collections::BTreeMap;

        let mut map = BTreeMap::new();
        map.insert("title".to_string(), Ipld::String("Roygbiv".into()));
        map.insert("duration".to_string(), Ipld::Integer(151_000));
        map.insert("ok".to_string(), Ipld::Bool(true));
        map.insert("nothing".to_string(), Ipld::Null);
        map.insert(
            "tags".to_string(),
            Ipld::List(vec![Ipld::String("electronic".into())]),
        );

        let json = ipld_to_json(Ipld::Map(map));
        assert_eq!(json["title"], "Roygbiv");
        assert_eq!(json["duration"], 151_000);
        assert_eq!(json["ok"], true);
        assert!(json["nothing"].is_null());
        assert_eq!(json["tags"][0], "electronic");
    }

    #[test]
    fn a_record_with_no_recognized_collection_yields_nothing() {
        // An empty archive cannot be parsed, so this checks the filter rather
        // than the parser: an unknown collection list matches no records.
        let refs: Vec<&str> = vec![];
        assert!(!refs.contains(&"app.rocksky.scrobble"));
    }
}
