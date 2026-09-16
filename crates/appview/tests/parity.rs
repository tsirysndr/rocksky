//! Wire-shape parity against the live TypeScript API.
//!
//! The fixtures under `fixtures/` are real responses captured from
//! `https://api.rocksky.app` (public, unauthenticated endpoints). They exist
//! because the response shapes are not fully described by the lexicons — the
//! handlers add fields the schemas do not declare — so the only trustworthy
//! reference is what the deployed API actually sends.
//!
//! These tests compare **key sets**, not values: the fixture is a snapshot of
//! someone's listening history and its values will not match synthetic input.
//! A missing or renamed key is the failure mode that silently breaks a client,
//! and that is what is checked here.

use chrono::{DateTime, TimeZone, Utc};
use rocksky_appview::db::models::{Album, Artist, Scrobble, Track, User};
use rocksky_appview::likes::Likes;
use rocksky_appview::views::{
    ArtistView, FirstScrobbleView, ScrobbleViewBasic, ScrobbleViewDetailed, TrackView,
};
use rocksky_appview::xrpc::app_rocksky::actor::{
    ActorScrobbleView, ArtistViewBasic, SongViewBasic,
};
use serde_json::Value;
use std::collections::BTreeSet;

fn fixture(name: &str) -> Value {
    let path = format!("{}/tests/fixtures/{name}.json", env!("CARGO_MANIFEST_DIR"));
    let raw =
        std::fs::read_to_string(&path).unwrap_or_else(|err| panic!("cannot read {path}: {err}"));
    serde_json::from_str(&raw).unwrap_or_else(|err| panic!("{path} is not valid JSON: {err}"))
}

fn keys(value: &Value) -> BTreeSet<String> {
    value
        .as_object()
        .expect("expected a JSON object")
        .keys()
        .cloned()
        .collect()
}

/// Reports both directions, so a failure says which keys are missing and which
/// are extra rather than just "not equal".
fn assert_same_keys(what: &str, expected: &Value, actual: &Value) {
    let expected = keys(expected);
    let actual = keys(actual);

    let missing: Vec<&String> = expected.difference(&actual).collect();
    let extra: Vec<&String> = actual.difference(&expected).collect();

    assert!(
        missing.is_empty() && extra.is_empty(),
        "{what} does not match the live API.\n  missing: {missing:?}\n  extra:   {extra:?}"
    );
}

fn at(raw: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(raw)
        .unwrap()
        .with_timezone(&Utc)
}

fn user() -> User {
    User {
        id: "rec_user".into(),
        did: "did:plc:alice".into(),
        display_name: Some("Alice".into()),
        handle: "alice.test".into(),
        avatar: "https://example.invalid/a.png".into(),
        is_bot: false,
        bot_flagged_at: None,
        bot_reason: None,
        created_at: at("2026-01-01T00:00:00Z"),
        updated_at: at("2026-01-01T00:00:00Z"),
        xata_version: Some(0),
    }
}

fn track() -> Track {
    Track {
        id: "rec_track".into(),
        title: "Roygbiv".into(),
        artist: "Boards of Canada".into(),
        album_artist: "Boards of Canada".into(),
        album_art: Some("https://example.invalid/cover.jpg".into()),
        album: "Music Has the Right to Children".into(),
        track_number: Some(4),
        duration: 151_000,
        mb_id: None,
        isrc: Some("GBAAA0000001".into()),
        youtube_link: None,
        spotify_link: None,
        apple_music_link: None,
        tidal_link: None,
        sha256: "sha-track".into(),
        disc_number: Some(1),
        lyrics: None,
        composer: None,
        genre: Some("electronic".into()),
        label: None,
        copyright_message: None,
        key: Some("A minor".into()),
        bpm: Some(85.5),
        uri: Some("at://did:plc:alice/app.rocksky.song/1".into()),
        album_uri: Some("at://did:plc:alice/app.rocksky.album/1".into()),
        artist_uri: Some("at://did:plc:alice/app.rocksky.artist/1".into()),
        created_at: at("2026-01-01T00:00:00Z"),
        updated_at: at("2026-01-02T00:00:00Z"),
        xata_version: Some(0),
    }
}

fn artist() -> Artist {
    Artist {
        id: "rec_artist".into(),
        name: "Boards of Canada".into(),
        biography: None,
        born: None,
        born_in: None,
        died: None,
        picture: Some("https://example.invalid/artist.jpg".into()),
        sha256: "sha-artist".into(),
        uri: Some("at://did:plc:alice/app.rocksky.artist/1".into()),
        apple_music_link: None,
        spotify_link: None,
        tidal_link: None,
        youtube_link: None,
        genres: Some(r#"["electronic","ambient"]"#.into()),
        created_at: at("2026-01-01T00:00:00Z"),
        updated_at: at("2026-01-01T00:00:00Z"),
        xata_version: Some(0),
    }
}

fn scrobble() -> Scrobble {
    Scrobble {
        id: "rec_scrobble".into(),
        user_id: Some("rec_user".into()),
        track_id: Some("rec_track".into()),
        album_id: Some("rec_album".into()),
        artist_id: Some("rec_artist".into()),
        uri: Some("at://did:plc:alice/app.rocksky.scrobble/1".into()),
        timestamp: at("2026-09-15T19:59:13Z"),
        created_at: at("2026-09-15T19:59:31.519Z"),
        updated_at: at("2026-09-15T19:59:31.519Z"),
        xata_version: Some(0),
    }
}

#[test]
fn get_scrobbles_items_match_the_live_shape() {
    let live = fixture("getScrobbles");
    let live_item = &live["scrobbles"][0];
    assert!(live_item.is_object(), "fixture has no scrobbles");

    let view = ScrobbleViewBasic::new(
        &scrobble(),
        &track(),
        &user(),
        Some(&artist()),
        Likes {
            count: 0,
            liked: false,
        },
    );

    assert_same_keys(
        "app.rocksky.scrobble.getScrobbles scrobbles[]",
        live_item,
        &serde_json::to_value(&view).unwrap(),
    );
}

#[test]
fn get_scrobbles_envelope_matches() {
    let live = fixture("getScrobbles");
    let ours = serde_json::json!({ "scrobbles": [] });
    assert_same_keys("app.rocksky.scrobble.getScrobbles", &live, &ours);
}

#[test]
fn get_scrobble_matches_the_live_shape() {
    let live = fixture("getScrobble");

    let view = ScrobbleViewDetailed::new(
        &scrobble(),
        &track(),
        &user(),
        Some(&artist()),
        Some("at://did:plc:alice/app.rocksky.album/1".into()),
        vec![artist()],
        1,
        2,
        Some(FirstScrobbleView {
            handle: "alice.test".into(),
            avatar: "https://example.invalid/a.png".into(),
            timestamp: at("2026-09-15T19:59:13Z"),
        }),
        Likes {
            count: 0,
            liked: false,
        },
    );

    assert_same_keys(
        "app.rocksky.scrobble.getScrobble",
        &live,
        &serde_json::to_value(&view).unwrap(),
    );
}

#[test]
fn embedded_artist_records_match_the_live_shape() {
    let live = fixture("getScrobble");
    let live_artist = &live["artists"][0];
    assert!(live_artist.is_object(), "fixture has no artists");

    assert_same_keys(
        "app.rocksky.scrobble.getScrobble artists[]",
        live_artist,
        &serde_json::to_value(ArtistView::from(&artist())).unwrap(),
    );
}

/// The live API emits `null` for absent values rather than omitting the key.
/// A client written against `mbId === null` breaks if the key disappears, so
/// this is checked directly rather than only implied by the key-set tests.
#[test]
fn absent_values_are_null_rather_than_omitted() {
    let live = fixture("getScrobbles");
    let live_item = &live["scrobbles"][0];
    assert!(
        live_item["mbId"].is_null(),
        "fixture should have a null mbId to compare against"
    );

    let mut bare = track();
    bare.mb_id = None;
    bare.isrc = None;
    bare.bpm = None;

    let view = ScrobbleViewBasic::new(
        &scrobble(),
        &bare,
        &user(),
        None,
        Likes {
            count: 0,
            liked: false,
        },
    );
    let value = serde_json::to_value(&view).unwrap();

    for key in ["mbId", "isrc", "bpm", "tags", "composer", "label"] {
        assert!(
            value.get(key).is_some(),
            "{key} must be present as null, not omitted"
        );
        assert!(
            value[key].is_null(),
            "{key} should be null, got {}",
            value[key]
        );
    }
}

/// `tags` differs between the two views: `null` in the feed
/// (`artists?.genres`) and `[]` in the detail (`artists?.genres || []`).
#[test]
fn tags_follow_each_views_own_rule() {
    let feed = ScrobbleViewBasic::new(&scrobble(), &track(), &user(), None, Likes::default());
    assert!(
        serde_json::to_value(&feed).unwrap()["tags"].is_null(),
        "the feed view reports null tags for a missing artist"
    );

    let detail = ScrobbleViewDetailed::new(
        &scrobble(),
        &track(),
        &user(),
        None,
        None,
        vec![],
        0,
        0,
        None,
        Likes::default(),
    );
    assert_eq!(
        serde_json::to_value(&detail).unwrap()["tags"],
        serde_json::json!([]),
        "the detail view reports an empty array"
    );
}

/// An artist row with a NULL `genres` column reports `null`, which is what the
/// live response shows — not an empty array.
#[test]
fn a_null_genres_column_stays_null() {
    let mut without = artist();
    without.genres = None;
    let value = serde_json::to_value(ArtistView::from(&without)).unwrap();
    assert!(value["genres"].is_null(), "{value}");

    let value = serde_json::to_value(ArtistView::from(&artist())).unwrap();
    assert_eq!(
        value["genres"],
        serde_json::json!(["electronic", "ambient"])
    );
}

/// Timestamps must carry exactly three fractional digits, as
/// `Date#toISOString()` does.
#[test]
fn timestamps_are_formatted_like_javascript() {
    let live = fixture("getScrobbles");
    let live_date = live["scrobbles"][0]["date"].as_str().unwrap();
    assert_eq!(live_date.len(), 24, "live: {live_date}");
    assert!(live_date.ends_with('Z'), "live: {live_date}");

    let view = ScrobbleViewBasic::new(
        &scrobble(),
        &track(),
        &user(),
        Some(&artist()),
        Likes::default(),
    );
    let value = serde_json::to_value(&view).unwrap();
    let ours = value["date"].as_str().unwrap();
    assert_eq!(ours, "2026-09-15T19:59:13.000Z");
    assert_eq!(ours.len(), live_date.len());
}

/// The detail view carries `lyrics` and `listeners` but no `likesCount`; the
/// feed view is the other way round. Mixing them up is an easy mistake and
/// would quietly change both payloads.
#[test]
fn the_two_scrobble_views_differ_where_the_live_api_differs() {
    let feed = keys(&fixture("getScrobbles")["scrobbles"][0]);
    let detail = keys(&fixture("getScrobble"));

    assert!(feed.contains("likesCount"), "feed has likesCount");
    assert!(!detail.contains("likesCount"), "detail does not");

    assert!(detail.contains("lyrics"), "detail has lyrics");
    assert!(!feed.contains("lyrics"), "feed does not");

    for key in ["listeners", "scrobbles", "artists", "firstScrobble"] {
        assert!(detail.contains(key), "detail has {key}");
        assert!(!feed.contains(key), "feed does not have {key}");
    }

    for key in ["userAvatar", "userDisplayName"] {
        assert!(feed.contains(key), "feed has {key}");
        assert!(!detail.contains(key), "detail does not have {key}");
    }
}

/// Keeps the unused-import warning honest: `Album` and `TimeZone` are here for
/// the fixtures that will use them as more views are ported.
#[allow(dead_code)]
fn _unused(album: Album) -> i64 {
    let _ = Utc.timestamp_opt(0, 0);
    album.year.unwrap_or(0)
}

// ------------------------------------------------- app.rocksky.actor.*

fn actor_scrobble() -> ActorScrobbleView {
    let scrobble = scrobble();
    let track = track();
    let user = user();
    ActorScrobbleView {
        id: scrobble.id.clone(),
        track_id: scrobble.track_id.clone(),
        title: track.title.clone(),
        artist: track.artist.clone(),
        album_artist: track.album_artist.clone(),
        album_art: track.album_art.clone(),
        album: track.album.clone(),
        handle: user.handle.clone(),
        did: user.did.clone(),
        avatar: user.avatar.clone(),
        uri: scrobble.uri.clone(),
        track_uri: track.uri.clone(),
        liked: false,
        artist_uri: track.artist_uri.clone(),
        album_uri: track.album_uri.clone(),
        created_at: scrobble.created_at,
    }
}

fn song_basic() -> SongViewBasic {
    let track = track();
    SongViewBasic {
        id: track.id.clone(),
        uri: track.uri.clone(),
        title: track.title.clone(),
        artist: track.artist.clone(),
        artist_uri: track.artist_uri.clone(),
        album: track.album.clone(),
        album_uri: track.album_uri.clone(),
        album_art: track.album_art.clone(),
        album_artist: track.album_artist.clone(),
        copyright_message: track.copyright_message.clone(),
        disc_number: track.disc_number,
        duration: track.duration,
        sha256: track.sha256.clone(),
        track_number: track.track_number,
        play_count: 3,
        unique_listeners: 2,
        created_at: track.created_at,
    }
}

fn artist_basic() -> ArtistViewBasic {
    let artist = artist();
    ArtistViewBasic {
        id: artist.id.clone(),
        name: artist.name.clone(),
        picture: artist.picture.clone(),
        sha256: artist.sha256.clone(),
        uri: artist.uri.clone(),
        tags: Some(vec!["Rock".into()]),
        play_count: 5,
        unique_listeners: 4,
    }
}

/// The actor feed's field set, against the live response.
///
/// This is the check that caught the view being wrong. The actor feed was
/// first implemented by reusing `ScrobbleViewBasic`, which the *global* feed
/// uses — and the two live responses share only 11 of their fields, 16 against
/// 36. A profile page reading `handle` would have found `user` instead and
/// rendered blank.
#[test]
fn the_actor_feed_matches_the_live_shape() {
    let live = fixture("getActorScrobbles");
    let live_item = &live["scrobbles"][0];
    assert!(live_item.is_object(), "fixture has no scrobbles");

    assert_same_keys(
        "app.rocksky.actor.getActorScrobbles scrobbles[]",
        live_item,
        &serde_json::to_value(actor_scrobble()).unwrap(),
    );
}

/// And the two feeds must stay different views, so a later refactor cannot
/// quietly collapse them back together.
#[test]
fn the_actor_feed_is_not_the_global_feed() {
    let actor = keys(&fixture("getActorScrobbles")["scrobbles"][0]);
    let global = keys(&fixture("getScrobbles")["scrobbles"][0]);

    assert_ne!(actor, global);
    assert_eq!(actor.len(), 16, "the actor feed is the compact one");
    assert!(
        global.len() > 30,
        "the global feed carries the whole track: {}",
        global.len()
    );

    // The naming difference that matters most: who listened.
    assert!(actor.contains("handle") && actor.contains("did"));
    assert!(global.contains("user") && global.contains("userAvatar"));
    // And `trackId` is only on the actor feed.
    assert!(actor.contains("trackId") && !global.contains("trackId"));
}

#[test]
fn the_actor_top_songs_view_matches_the_live_shape() {
    let live = fixture("getActorSongs");
    let live_item = &live["tracks"][0];
    assert!(live_item.is_object(), "fixture has no tracks");

    assert_same_keys(
        "app.rocksky.actor.getActorSongs tracks[]",
        live_item,
        &serde_json::to_value(song_basic()).unwrap(),
    );
}

#[test]
fn the_actor_artists_view_matches_the_live_shape() {
    let live = fixture("getActorArtists");
    let live_item = &live["artists"][0];
    assert!(live_item.is_object(), "fixture has no artists");

    assert_same_keys(
        "app.rocksky.actor.getActorArtists artists[]",
        live_item,
        &serde_json::to_value(artist_basic()).unwrap(),
    );
}

/// Loved songs answer the detailed track view, whose field set includes the
/// `xataVersion` and `updatedAt` the compact view omits.
#[test]
fn loved_songs_match_the_live_detailed_shape() {
    let live = fixture("getActorLovedSongs");
    let live_item = &live["tracks"][0];
    assert!(live_item.is_object(), "fixture has no tracks");

    assert_same_keys(
        "app.rocksky.actor.getActorLovedSongs tracks[]",
        live_item,
        &serde_json::to_value(TrackView::from(&track())).unwrap(),
    );
}

/// An artist with no genres serializes `tags: null`, not `[]` — an empty array
/// would make the UI render an empty genre-chip row.
#[test]
fn an_artist_without_genres_reports_null_tags() {
    let mut artist = artist_basic();
    artist.tags = None;
    let value = serde_json::to_value(artist).unwrap();
    assert!(value["tags"].is_null(), "{value}");
}
