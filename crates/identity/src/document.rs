//! The DID document, and the two things anyone reads out of it.

use serde::Deserialize;

/// The service id naming an account's PDS.
const PDS_SERVICE_ID: &str = "#atproto_pds";

#[derive(Debug, Clone, Deserialize)]
pub struct DidDocument {
    #[serde(default, rename = "alsoKnownAs")]
    pub also_known_as: Vec<String>,
    #[serde(default)]
    pub service: Vec<Service>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Service {
    pub id: String,
    #[serde(rename = "type")]
    pub service_type: String,
    #[serde(rename = "serviceEndpoint")]
    pub endpoint: String,
}

impl DidDocument {
    /// The PDS endpoint.
    ///
    /// Matched on the `#atproto_pds` id or the `AtprotoPersonalDataServer`
    /// type: documents in the wild carry one or the other, and older ones
    /// write the id fully qualified rather than as a fragment.
    pub fn pds(&self) -> Option<&str> {
        self.service
            .iter()
            .find(|service| {
                service.id == PDS_SERVICE_ID
                    || service.id.ends_with(PDS_SERVICE_ID)
                    || service.service_type == "AtprotoPersonalDataServer"
            })
            .map(|service| service.endpoint.trim_end_matches('/'))
    }

    /// The handle, from the first `at://` alias.
    ///
    /// `alsoKnownAs` can hold other URI schemes — a website, a mastodon
    /// account — so the prefix is what selects the handle rather than
    /// position.
    pub fn handle(&self) -> Option<&str> {
        self.also_known_as
            .iter()
            .find_map(|alias| alias.strip_prefix("at://"))
            .map(str::trim)
            .filter(|handle| !handle.is_empty())
    }

    /// Whether this document confirms a handle claim, case-insensitively.
    ///
    /// The check that turns a claim into an identity — see the crate note.
    pub fn confirms(&self, handle: &str) -> bool {
        self.also_known_as.iter().any(|alias| {
            alias
                .strip_prefix("at://")
                .is_some_and(|declared| declared.trim().eq_ignore_ascii_case(handle.trim()))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: serde_json::Value) -> DidDocument {
        serde_json::from_value(json).unwrap()
    }

    #[test]
    fn the_handle_is_the_at_alias_not_the_first_one() {
        let document = parse(serde_json::json!({
            "alsoKnownAs": ["https://example.com", "at://real.handle"],
            "service": []
        }));
        assert_eq!(document.handle(), Some("real.handle"));
    }

    #[test]
    fn a_document_with_no_alias_has_no_handle() {
        let document = parse(serde_json::json!({ "service": [] }));
        assert_eq!(document.handle(), None);
    }

    /// Both spellings appear in the wild; matching only one loses the PDS and
    /// with it the ability to read or write the repository.
    #[test]
    fn the_pds_is_found_by_id_or_by_type() {
        let by_id = parse(serde_json::json!({
            "service": [{
                "id": "#atproto_pds",
                "type": "AtprotoPersonalDataServer",
                "serviceEndpoint": "https://pds.example/"
            }]
        }));
        assert_eq!(by_id.pds(), Some("https://pds.example"));

        let qualified = parse(serde_json::json!({
            "service": [{
                "id": "did:plc:abc#atproto_pds",
                "type": "Other",
                "serviceEndpoint": "https://pds.example"
            }]
        }));
        assert_eq!(qualified.pds(), Some("https://pds.example"));

        let by_type = parse(serde_json::json!({
            "service": [{
                "id": "#something_else",
                "type": "AtprotoPersonalDataServer",
                "serviceEndpoint": "https://pds.example"
            }]
        }));
        assert_eq!(by_type.pds(), Some("https://pds.example"));

        let neither = parse(serde_json::json!({
            "service": [{
                "id": "#feedgen",
                "type": "RockskyFeedGenerator",
                "serviceEndpoint": "https://feeds.example"
            }]
        }));
        assert_eq!(neither.pds(), None);
    }

    /// The confirmation step. A document that lists a different handle must
    /// not confirm the claim, or handle resolution proves nothing.
    #[test]
    fn a_claim_is_confirmed_only_by_a_matching_alias() {
        let document = parse(serde_json::json!({
            "alsoKnownAs": ["at://Alice.Example"],
            "service": []
        }));

        // Handles are case-insensitive.
        assert!(document.confirms("alice.example"));
        assert!(document.confirms("ALICE.EXAMPLE"));

        assert!(!document.confirms("bob.example"));
        assert!(!document.confirms("alice.example.evil.com"));
        assert!(!document.confirms(""));

        // A document listing several aliases confirms any of them.
        let several = parse(serde_json::json!({
            "alsoKnownAs": ["at://old.handle", "at://new.handle"],
            "service": []
        }));
        assert!(several.confirms("old.handle"));
        assert!(several.confirms("new.handle"));
        // …but `handle()` still reports the first, which is the current one.
        assert_eq!(several.handle(), Some("old.handle"));
    }
}
