//! Every ListenBrainz read, run against a real SQLite.
//!
//! These statements are built with sea-query and rendered per dialect, and
//! several of them do things the builder cannot check: `DATE(...)` over a
//! timestamp, `COUNT(DISTINCT ...)`, a `GROUP BY` whose projection is cast
//! differently on each backend, a `LIKE` on a hash prefix. A statement that
//! does not parse or binds its parameters wrongly is invisible until it is
//! executed, which is what this does.
//!
//! The assertions are about the shape clients depend on — counts, ordering,
//! and the keys that must be present — rather than about the SQL.

use chrono::{DateTime, Duration, Utc};
use rocksky_db::Backend;

use crate::listenbrainz::core::listens::{get_listens, ListensParams};
use crate::listenbrainz::feedback::get_feedback::{get_feedback, FeedbackParams};
use crate::listenbrainz::range;
use crate::listenbrainz::statistics::{
    activity::get_listening_activity, artists::get_top_artists, recordings::get_top_recordings,
    releases::get_top_releases, StatsParams,
};
use crate::listenbrainz::{catalogue, feedback, metadata, msid, users};

/// One listener, two artists, three tracks and a handful of plays laid out so
/// the ranking has something to order.
struct Fixture {
    db: Backend,
    user: rocksky_db::models::User,
    /// The track played most, and the one that is loved.
    top_track: String,
}

async fn insert(db: &Backend, sql: &str, values: &[&str]) {
    let mut statement = db.sql(sql.to_string());
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            statement.push(", ");
        }
        statement.bind(*value);
    }
    statement.push(")");
    db.execute(&statement).await.unwrap();
}

async fn fixture(now: DateTime<Utc>) -> Fixture {
    let db = rocksky_db::connect_in_memory().await.unwrap();

    let user = rocksky_db::new_id();
    insert(
        &db,
        "INSERT INTO users (xata_id, did, handle, avatar) VALUES (",
        &[&user, "did:plc:alice", "alice.test", "a"],
    )
    .await;

    let friend = rocksky_db::new_id();
    insert(
        &db,
        "INSERT INTO users (xata_id, did, handle, avatar) VALUES (",
        &[&friend, "did:plc:bob", "bob.test", "b"],
    )
    .await;

    insert(
        &db,
        "INSERT INTO follows (xata_id, uri, follower_did, subject_did) VALUES (",
        &[
            &rocksky_db::new_id(),
            "at://alice/follow/1",
            "did:plc:alice",
            "did:plc:bob",
        ],
    )
    .await;

    let boc = rocksky_db::new_id();
    insert(
        &db,
        "INSERT INTO artists (xata_id, name, sha256) VALUES (",
        &[&boc, "Boards of Canada", "sha-boc"],
    )
    .await;
    let various = rocksky_db::new_id();
    insert(
        &db,
        "INSERT INTO artists (xata_id, name, sha256) VALUES (",
        &[&various, "Various Artists", "sha-va"],
    )
    .await;

    let album = rocksky_db::new_id();
    insert(
        &db,
        "INSERT INTO albums (xata_id, title, artist, sha256) VALUES (",
        &[&album, "Geogaddi", "Boards of Canada", "sha-geogaddi"],
    )
    .await;
    let compilation = rocksky_db::new_id();
    insert(
        &db,
        "INSERT INTO albums (xata_id, title, artist, sha256) VALUES (",
        &[&compilation, "Warp 10", "Various Artists", "sha-warp"],
    )
    .await;

    let mut tracks = Vec::new();
    for (title, artist, album_title, mb_id) in [
        (
            "Dawn Chorus",
            "Boards of Canada",
            "Geogaddi",
            Some("mb-dawn"),
        ),
        ("1969", "Boards of Canada", "Geogaddi", None),
        ("Tri-Repetae", "Autechre", "Warp 10", None),
    ] {
        let id = rocksky_db::new_id();
        let sha = msid::track_sha256(title, artist, album_title);
        let mut statement = db.sql(
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256, mb_id) VALUES ("
                .to_string(),
        );
        statement
            .bind(&id)
            .push(", ")
            .bind(title)
            .push(", ")
            .bind(artist)
            .push(", ")
            .bind(if album_title == "Warp 10" {
                "Various Artists"
            } else {
                artist
            })
            .push(", ")
            .bind(album_title)
            .push(", ")
            .bind(151_000i64)
            .push(", ")
            .bind(&sha)
            .push(", ");
        match mb_id {
            Some(mb_id) => statement.bind(mb_id),
            None => statement.push("NULL"),
        };
        statement.push(")");
        db.execute(&statement).await.unwrap();
        tracks.push(id);
    }

    // Four plays of the first track, two of the second, one of the third, a
    // few seconds apart. Seconds rather than minutes so that a fixture built
    // from the wall clock still sits inside "this week" when the test happens
    // to run just after midnight on a Monday.
    let plays: [(usize, &str, &str, i64); 7] = [
        (0, &album, &boc, 1),
        (0, &album, &boc, 2),
        (0, &album, &boc, 3),
        (0, &album, &boc, 4),
        (1, &album, &boc, 5),
        (1, &album, &boc, 6),
        (2, &compilation, &various, 7),
    ];
    for (track, album_id, artist_id, ago) in plays {
        let at = rocksky_db::format_timestamp(now - Duration::seconds(ago));
        let mut statement = db.sql(
            "INSERT INTO scrobbles (xata_id, user_id, track_id, album_id, artist_id, uri, timestamp) VALUES ("
                .to_string(),
        );
        statement
            .bind(rocksky_db::new_id())
            .push(", ")
            .bind(&user)
            .push(", ")
            .bind(&tracks[track])
            .push(", ")
            .bind(album_id)
            .push(", ")
            .bind(artist_id)
            .push(", ")
            .bind(format!("at://alice/scrobble/{}", ago))
            .push(", ")
            .bind(at)
            .push(")");
        db.execute(&statement).await.unwrap();
    }

    insert(
        &db,
        "INSERT INTO loved_tracks (xata_id, user_id, track_id, uri) VALUES (",
        &[
            &rocksky_db::new_id(),
            &user,
            &tracks[0],
            "at://alice/like/1",
        ],
    )
    .await;

    let user = users::find(&db, "alice.test").await.unwrap().unwrap();
    Fixture {
        db,
        user,
        top_track: tracks[0].clone(),
    }
}

/// A Monday, so "this week" is a fresh window and the fixture's plays all sit
/// inside every range under test.
fn now() -> DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-09-21T12:00:00Z")
        .unwrap()
        .with_timezone(&Utc)
}

#[tokio::test]
async fn a_user_resolves_by_handle_or_did() {
    let f = fixture(now()).await;

    assert_eq!(
        users::find(&f.db, "did:plc:alice")
            .await
            .unwrap()
            .unwrap()
            .handle,
        "alice.test"
    );
    // Clients round-trip the name through a URL and do not always preserve
    // case; a handle that does not resolve is a 404 on every screen.
    assert_eq!(
        users::find(&f.db, "ALICE.TEST")
            .await
            .unwrap()
            .unwrap()
            .handle,
        "alice.test"
    );
    assert!(users::find(&f.db, "nobody.test").await.unwrap().is_none());
}

#[tokio::test]
async fn listens_come_back_newest_first_with_the_account_bounds() {
    let f = fixture(now()).await;

    let response = get_listens(&f.db, &f.user, ListensParams::default())
        .await
        .unwrap();

    assert_eq!(response.payload.count, 7);
    assert_eq!(response.payload.user_id, "alice.test");

    let times: Vec<i64> = response
        .payload
        .listens
        .iter()
        .map(|listen| listen.listened_at.unwrap())
        .collect();
    assert!(
        times.windows(2).all(|pair| pair[0] >= pair[1]),
        "newest first"
    );

    // The bounds are the account's, not the page's: a client compares the two
    // to decide whether there is another page.
    assert_eq!(response.payload.latest_listen_ts, times.first().copied());
    assert_eq!(response.payload.oldest_listen_ts, times.last().copied());

    // Every listen has to carry an MSID, or the heart button on it cannot
    // name the track it belongs to.
    assert!(response
        .payload
        .listens
        .iter()
        .all(|listen| listen.recording_msid.is_some()));
}

#[tokio::test]
async fn listens_page_by_timestamp() {
    let f = fixture(now()).await;

    let first = get_listens(
        &f.db,
        &f.user,
        ListensParams {
            count: Some(3),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(first.payload.count, 3);

    let oldest = first.payload.listens.last().unwrap().listened_at.unwrap();
    let next = get_listens(
        &f.db,
        &f.user,
        ListensParams {
            count: Some(3),
            max_ts: Some(oldest),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    // Exclusive, so the row the client already holds is not handed back — an
    // inclusive bound repeats one listen on every page boundary forever.
    assert!(next
        .payload
        .listens
        .iter()
        .all(|listen| listen.listened_at.unwrap() < oldest));
}

#[tokio::test]
async fn the_charts_rank_by_plays_and_report_a_total() {
    let f = fixture(now()).await;
    let window = range::window("this_week", now()).unwrap();
    let params = StatsParams::default();

    let artists = get_top_artists(&f.db, &f.user, "this_week", &window, &params)
        .await
        .unwrap()
        .payload;
    let names: Vec<&str> = artists
        .artists
        .as_ref()
        .unwrap()
        .iter()
        .map(|entry| entry.artist_name.as_str())
        .collect();
    // The compilation placeholder is excluded, so the one Various Artists
    // play does not appear at all.
    assert_eq!(names, vec!["Boards of Canada"]);
    assert_eq!(artists.artists.as_ref().unwrap()[0].listen_count, 6);
    assert_eq!(artists.total_artist_count, Some(1));
    assert_eq!(artists.range, "this_week");

    let releases = get_top_releases(&f.db, &f.user, "this_week", &window, &params)
        .await
        .unwrap()
        .payload;
    let releases_list = releases.releases.as_ref().unwrap();
    assert_eq!(releases_list[0].release_name.as_deref(), Some("Geogaddi"));
    assert_eq!(releases_list[0].listen_count, 6);
    // A compilation is still a real album, so it is charted.
    assert_eq!(releases.total_release_count, Some(2));

    let recordings = get_top_recordings(&f.db, &f.user, "this_week", &window, &params)
        .await
        .unwrap()
        .payload;
    let top = &recordings.recordings.as_ref().unwrap()[0];
    assert_eq!(top.track_name.as_deref(), Some("Dawn Chorus"));
    assert_eq!(top.listen_count, 4);
    assert_eq!(top.recording_mbid.as_deref(), Some("mb-dawn"));
    assert_eq!(recordings.total_recording_count, Some(3));
}

#[tokio::test]
async fn a_chart_pages_without_losing_or_repeating_an_entry() {
    let f = fixture(now()).await;
    let window = range::window("this_week", now()).unwrap();

    let page = |offset| StatsParams {
        count: Some(2),
        offset: Some(offset),
        range: None,
    };

    let first = get_top_recordings(&f.db, &f.user, "this_week", &window, &page(0))
        .await
        .unwrap()
        .payload;
    let second = get_top_recordings(&f.db, &f.user, "this_week", &window, &page(2))
        .await
        .unwrap()
        .payload;

    assert_eq!(first.count, 2);
    assert_eq!(second.count, 1);
    assert_eq!(second.offset, 2);

    let names = |payload: &crate::listenbrainz::types::StatsPayload| {
        payload
            .recordings
            .as_ref()
            .unwrap()
            .iter()
            .map(|entry| entry.track_name.clone().unwrap())
            .collect::<Vec<_>>()
    };
    let mut all = names(&first);
    all.extend(names(&second));
    all.sort();
    all.dedup();
    assert_eq!(all.len(), 3, "three distinct tracks across the two pages");
}

#[tokio::test]
async fn the_listening_activity_fills_the_whole_window() {
    let f = fixture(now()).await;
    let window = range::window("this_month", now()).unwrap();

    let payload = get_listening_activity(&f.db, &f.user, "this_month", &window)
        .await
        .unwrap()
        .payload;

    // Every day from the first of the month to today, including the empty
    // ones — a chart that skips them compresses its gaps.
    assert_eq!(payload.listening_activity.len(), 21);
    assert_eq!(
        payload
            .listening_activity
            .iter()
            .map(|b| b.listen_count)
            .sum::<i64>(),
        7
    );
    assert_eq!(payload.listening_activity.last().unwrap().listen_count, 7);
    assert!(payload
        .listening_activity
        .iter()
        .all(|bucket| !bucket.time_range.is_empty()));
}

#[tokio::test]
async fn all_time_activity_starts_at_the_first_listen() {
    let f = fixture(now()).await;
    let window = range::window("all_time", now()).unwrap();

    let payload = get_listening_activity(&f.db, &f.user, "all_time", &window)
        .await
        .unwrap()
        .payload;

    // The range itself starts in 2002; charting from there would draw two
    // decades of empty bars before the account existed.
    assert_eq!(payload.listening_activity.len(), 1);
    assert_eq!(payload.listening_activity[0].time_range, "2026");
    assert_eq!(payload.listening_activity[0].listen_count, 7);
}

#[tokio::test]
async fn loved_tracks_carry_the_metadata_and_the_total() {
    let f = fixture(now()).await;

    let response = get_feedback(&f.db, &f.user, &FeedbackParams::default())
        .await
        .unwrap();

    assert_eq!(response.count, 1);
    assert_eq!(response.total_count, 1);
    let item = &response.feedback[0];
    assert_eq!(item.score, 1);
    assert_eq!(
        item.track_metadata.as_ref().unwrap().track_name,
        "Dawn Chorus"
    );
    assert!(item.recording_msid.is_some());

    // Nothing is stored with a negative score, so a request for hates is
    // empty rather than the loves under the wrong sign.
    let hates = get_feedback(
        &f.db,
        &f.user,
        &FeedbackParams {
            score: Some(-1),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert!(hates.feedback.is_empty());
}

/// The round trip the heart button depends on: a chart or a listen hands the
/// client an MSID, and the client sends that MSID back to love the track. If
/// it does not resolve, the love lands on nothing.
#[tokio::test]
async fn an_msid_from_a_listen_resolves_back_to_its_track() {
    let f = fixture(now()).await;

    let listens = get_listens(&f.db, &f.user, ListensParams::default())
        .await
        .unwrap();
    let listen = listens
        .payload
        .listens
        .iter()
        .find(|listen| listen.track_metadata.track_name == "Dawn Chorus")
        .unwrap();

    let resolved = feedback::resolve(&f.db, None, listen.recording_msid.as_deref())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(resolved.id, f.top_track);

    // An MBID is the stronger claim and is tried first.
    let by_mbid = feedback::resolve(&f.db, Some("mb-dawn"), None)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(by_mbid.id, f.top_track);

    assert!(feedback::resolve(&f.db, Some("mb-nothing"), None)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn following_lists_handles_rather_than_dids() {
    let f = fixture(now()).await;

    let following = crate::listenbrainz::core::following::get_following(&f.db, &f.user)
        .await
        .unwrap();
    // The client asks each of these for their listens, so they have to be
    // names this API accepts in a path.
    assert_eq!(following.following, vec!["bob.test".to_string()]);
    assert_eq!(following.user, "alice.test");

    let bob = users::find(&f.db, "bob.test").await.unwrap().unwrap();
    let followers = crate::listenbrainz::core::following::get_followers(&f.db, &bob)
        .await
        .unwrap();
    assert_eq!(followers.followers, vec!["alice.test".to_string()]);
}

#[tokio::test]
async fn searching_users_matches_part_of_a_handle() {
    let f = fixture(now()).await;

    let found = crate::listenbrainz::core::search_users::search_users(&f.db, "ali")
        .await
        .unwrap();
    assert_eq!(found.users.len(), 1);
    assert_eq!(found.users[0].user_name, "alice.test");

    assert!(
        crate::listenbrainz::core::search_users::search_users(&f.db, "  ")
            .await
            .unwrap()
            .users
            .is_empty(),
        "a blank term is not a match-everything"
    );
}

#[tokio::test]
async fn a_metadata_lookup_answers_from_the_catalogue() {
    let f = fixture(now()).await;

    let hit = metadata::lookup(&f.db, "Boards of Canada", "Dawn Chorus", Some("Geogaddi"))
        .await
        .unwrap();
    assert_eq!(hit.recording_mbid.as_deref(), Some("mb-dawn"));
    assert_eq!(hit.release_name.as_deref(), Some("Geogaddi"));

    // Without the album it still resolves, by title and artist.
    let no_album = metadata::lookup(&f.db, "Boards of Canada", "1969", None)
        .await
        .unwrap();
    assert_eq!(no_album.recording_name.as_deref(), Some("1969"));

    // A miss is an empty answer rather than an error: the lookup succeeded,
    // it matched nothing.
    let miss = metadata::lookup(&f.db, "Nobody", "Nothing", None)
        .await
        .unwrap();
    assert!(miss.recording_name.is_none());
}

/// A window with no plays in it still has to answer the keys a client cannot
/// decode without — the charts screen fails to parse, rather than showing an
/// empty chart, if `count`, `range` or the timestamps go missing.
#[tokio::test]
async fn an_empty_window_still_answers_a_complete_payload() {
    let f = fixture(now()).await;
    let window = range::window("year", now()).unwrap();

    let value = serde_json::to_value(
        get_top_artists(&f.db, &f.user, "year", &window, &StatsParams::default())
            .await
            .unwrap(),
    )
    .unwrap();
    let payload = &value["payload"];

    assert_eq!(payload["artists"].as_array().unwrap().len(), 0);
    assert_eq!(payload["count"], 0);
    assert_eq!(payload["range"], "year");
    assert_eq!(payload["total_artist_count"], 0);
    for key in ["from_ts", "to_ts", "last_updated", "offset", "user_id"] {
        assert!(!payload[key].is_null(), "{key} must be present");
    }
}

/// Chart rows are decoded into one type whichever chart they came from, so
/// every key has to be there even when it is null.
#[tokio::test]
async fn a_chart_row_carries_every_key_including_the_nulls() {
    let f = fixture(now()).await;
    let window = range::window("this_week", now()).unwrap();

    let value = serde_json::to_value(
        get_top_artists(
            &f.db,
            &f.user,
            "this_week",
            &window,
            &StatsParams::default(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    let entry = &value["payload"]["artists"][0];

    for key in [
        "artist_name",
        "artist_mbids",
        "release_name",
        "release_mbid",
        "track_name",
        "recording_mbid",
        "listen_count",
    ] {
        assert!(entry.get(key).is_some(), "{key} must be present");
    }
    assert_eq!(entry["artist_name"], "Boards of Canada");
}

#[tokio::test]
async fn the_msid_on_a_chart_row_and_on_a_listen_agree() {
    let f = fixture(now()).await;

    let tracks = rocksky_db::loaders::tracks_by_id(&f.db, [Some(f.top_track.clone())])
        .await
        .unwrap();
    let track = &tracks[&f.top_track];

    assert_eq!(
        catalogue::recording_msid(track),
        msid::from_sha256(&msid::track_sha256(
            "Dawn Chorus",
            "Boards of Canada",
            "Geogaddi"
        ))
    );
}

/// The routes as a client actually addresses them.
///
/// The unit tests above prove the queries answer; these prove the answers are
/// reachable. A path that does not match what the client asks for is a 404,
/// and a 404 on a read renders as an empty screen rather than an error — the
/// exact failure this API was extended to fix — so the spellings are worth
/// asserting rather than eyeballing.
mod http {
    use super::*;
    use actix_web::{test, web, App};
    use std::sync::Arc;

    macro_rules! app {
        ($f:expr) => {
            test::init_service(
                App::new()
                    .app_data(web::Data::new(Arc::new($f.db.clone())))
                    .app_data(web::Data::new(crate::cache::Cache::new().unwrap()))
                    .service(crate::listenbrainz::handlers::handle_get_listens)
                    .service(crate::listenbrainz::handlers::handle_get_playing_now)
                    .service(crate::listenbrainz::handlers::handle_get_listen_count)
                    .service(crate::listenbrainz::handlers::handle_get_following)
                    .service(crate::listenbrainz::handlers::handle_get_followers)
                    .service(crate::listenbrainz::handlers::handle_get_feedback)
                    .service(crate::listenbrainz::handlers::handle_get_artists)
                    .service(crate::listenbrainz::handlers::handle_get_releases)
                    .service(crate::listenbrainz::handlers::handle_get_recordings)
                    .service(crate::listenbrainz::handlers::handle_get_release_groups)
                    .service(crate::listenbrainz::handlers::handle_get_listening_activity)
                    .service(crate::listenbrainz::handlers::handle_search_users)
                    .service(crate::listenbrainz::handlers::handle_metadata_lookup)
                    .service(crate::listenbrainz::handlers::handle_delete_listen),
            )
            .await
        };
    }

    /// A GET, as a status and a parsed body.
    macro_rules! get {
        ($app:expr, $uri:expr) => {{
            let response =
                test::call_service(&$app, test::TestRequest::get().uri($uri).to_request()).await;
            let status = response.status().as_u16();
            let body = test::read_body(response).await;
            let json: serde_json::Value =
                serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
            (status, json)
        }};
    }

    /// Every read a client makes, at the URL it makes it at, with the query
    /// parameters it sends.
    /// The handlers resolve a range against the wall clock, so the fixture
    /// has to be anchored there too — a fixed date would fall outside "this
    /// month" the moment the month turned.
    #[actix_web::test]
    async fn every_screen_reaches_its_route() {
        let f = fixture(Utc::now()).await;
        let app = app!(f);

        let (status, body) = get!(app, "/1/user/alice.test/listens?count=25");
        assert_eq!(status, 200);
        assert_eq!(body["payload"]["count"], 7);

        let (status, body) = get!(app, "/1/user/alice.test/listen-count");
        assert_eq!(status, 200);
        assert_eq!(body["payload"]["count"], 7);

        let (status, body) = get!(app, "/1/user/alice.test/playing-now");
        assert_eq!(status, 200);
        assert_eq!(body["payload"]["count"], 0);
        assert_eq!(body["payload"]["user_id"], "alice.test");

        let (status, body) = get!(app, "/1/user/alice.test/following");
        assert_eq!(status, 200);
        assert_eq!(body["following"][0], "bob.test");

        let (status, body) = get!(app, "/1/user/bob.test/followers");
        assert_eq!(status, 200);
        assert_eq!(body["followers"][0], "alice.test");

        // `metadata=true` is sent by clients and is not a parameter this
        // handler declares. An unknown query parameter must not 400.
        let (status, body) = get!(
            app,
            "/1/feedback/user/alice.test/get-feedback?count=25&offset=0&metadata=true"
        );
        assert_eq!(status, 200);
        assert_eq!(body["total_count"], 1);

        for (path, key) in [
            ("artists", "artists"),
            ("releases", "releases"),
            ("recordings", "recordings"),
            ("release-groups", "release_groups"),
        ] {
            let uri = format!(
                "/1/stats/user/alice.test/{}?offset=0&range=this_week&count=25",
                path
            );
            let (status, body) = get!(app, &uri);
            assert_eq!(status, 200, "{path}");
            assert!(body["payload"][key].is_array(), "{path} answered {body}");
            assert_eq!(body["payload"]["range"], "this_week", "{path}");
        }

        let (status, body) = get!(
            app,
            "/1/stats/user/alice.test/listening-activity?range=this_month"
        );
        assert_eq!(status, 200);
        let bars = body["payload"]["listening_activity"].as_array().unwrap();
        assert!(!bars.is_empty());
        assert_eq!(
            bars.iter()
                .map(|bar| bar["listen_count"].as_i64().unwrap())
                .sum::<i64>(),
            7
        );

        let (status, body) = get!(app, "/1/search/users?search_term=ali");
        assert_eq!(status, 200);
        assert_eq!(body["users"][0]["user_name"], "alice.test");

        let (status, body) = get!(
            app,
            "/1/metadata/lookup?artist_name=Boards%20of%20Canada&recording_name=Dawn%20Chorus"
        );
        assert_eq!(status, 200);
        assert_eq!(body["recording_mbid"], "mb-dawn");
    }

    /// A range the client never sends but a URL might carry is a 400 naming
    /// the nine that work, rather than silently charting all time.
    #[actix_web::test]
    async fn an_unknown_range_is_refused() {
        let f = fixture(Utc::now()).await;
        let app = app!(f);

        let (status, body) = get!(app, "/1/stats/user/alice.test/artists?range=fortnight");
        assert_eq!(status, 400);
        assert!(body["error"].as_str().unwrap().contains("half_yearly"));
    }

    /// Missing the `range` parameter altogether means all time, as on
    /// ListenBrainz — not a 400.
    #[actix_web::test]
    async fn a_missing_range_means_all_time() {
        let f = fixture(Utc::now()).await;
        let app = app!(f);

        let (status, body) = get!(app, "/1/stats/user/alice.test/artists");
        assert_eq!(status, 200);
        assert_eq!(body["payload"]["range"], "all_time");
    }

    #[actix_web::test]
    async fn an_unknown_user_is_a_404_that_says_so() {
        let f = fixture(Utc::now()).await;
        let app = app!(f);

        let (status, body) = get!(app, "/1/user/nobody.test/listens");
        assert_eq!(status, 404);
        assert_eq!(body["code"], 404);
        assert!(body["error"].as_str().unwrap().contains("nobody.test"));
    }

    /// Deleting a listen is refused rather than pretended: the row would come
    /// straight back on the next sync. See `core::delete_listen`.
    #[actix_web::test]
    async fn deleting_a_listen_is_refused_with_a_reason() {
        let f = fixture(Utc::now()).await;
        let app = app!(f);

        let response = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/1/delete-listen")
                .set_json(serde_json::json!({
                    "listened_at": 1_700_000_000i64,
                    "recording_msid": "00000000-0000-0000-0000-000000000000",
                }))
                .to_request(),
        )
        .await;

        assert_eq!(response.status().as_u16(), 501);
        let body: serde_json::Value = test::read_body_json(response).await;
        assert!(body["error"].as_str().unwrap().contains("repository"));
    }
}
