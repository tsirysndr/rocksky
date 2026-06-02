//! Model serde tests — make sure camelCase aliasing and Deref work.

use rocksky::{Album, ApiKey, Profile};
use serde_json::json;

#[test]
fn profile_deref_to_basic_fields() {
    let p: Profile = serde_json::from_value(json!({
        "id": "u1",
        "did": "did:plc:alice",
        "handle": "alice.bsky.social",
        "displayName": "Alice",
        "spotifyConnected": true,
    }))
    .unwrap();
    // Via Deref<Target = ProfileBasic>.
    assert_eq!(p.handle.as_deref(), Some("alice.bsky.social"));
    assert_eq!(p.display_name.as_deref(), Some("Alice"));
    assert_eq!(p.spotify_connected, Some(true));
}

#[test]
fn album_with_tracks_round_trips() {
    let a: Album = serde_json::from_value(json!({
        "id": "a1",
        "title": "Hounds of Love",
        "artist": "Kate Bush",
        "year": 1985,
        "tracks": [{"id": "s1", "title": "Running Up That Hill"}],
        "tags": ["pop", "art rock"],
    }))
    .unwrap();
    assert_eq!(a.title.as_deref(), Some("Hounds of Love"));
    assert_eq!(a.year, Some(1985));
    assert_eq!(a.tracks.len(), 1);
    assert_eq!(a.tracks[0].title.as_deref(), Some("Running Up That Hill"));
    assert_eq!(a.tags[1], "art rock");
}

#[test]
fn apikey_camel_case_aliases() {
    let k: ApiKey = serde_json::from_value(json!({
        "id": "k1",
        "name": "ci",
        "apiKey": "secret",
        "sharedSecret": "shh",
        "enabled": true,
    }))
    .unwrap();
    assert_eq!(k.api_key.as_deref(), Some("secret"));
    assert_eq!(k.shared_secret.as_deref(), Some("shh"));
    assert_eq!(k.enabled, Some(true));
}

#[test]
fn unknown_fields_are_ignored() {
    // Serde defaults to "allow extra fields" without #[serde(deny_unknown_fields)],
    // so future server additions won't break compiled consumers.
    let _: Profile = serde_json::from_value(json!({
        "did": "did:plc:x",
        "futureFieldWeDontKnow": 42,
    }))
    .unwrap();
}
