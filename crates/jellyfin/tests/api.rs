//! End-to-end tests for the Jellyfin surface, ported from smolsonic's suite.
//!
//! Where they diverge from the original, it is because Rocksky's model differs
//! rather than because a case was dropped:
//!
//! - audio is served by a redirect to object storage, so the streaming
//!   assertions check the 302 and its `Location` instead of range bytes;
//! - only tracks can be favourited (`loved_tracks` is what the ATProto like
//!   record mirrors), so starring an album or artist is rejected rather than
//!   stored;
//! - there is no video library, no lyric sidecars and no Last.fm/MusicBrainz
//!   plugins, so smolsonic's video, lyric, similar and remote-image tests have
//!   no counterpart here — the endpoints those clients call are still asserted
//!   to answer, empty, in `stubs_answer_instead_of_404ing`.
//!
//! Every test needs a Postgres; see `common::setup`.

mod common;

use actix_web::{http::StatusCode, test, App};
use serde_json::{json, Value};

/// Spin up the routes against a fixture, wrapped exactly as `run` wraps them so
/// the tests exercise the same path normalization real clients hit.
macro_rules! app {
    ($fx:expr) => {
        test::init_service(
            App::new()
                .app_data($fx.state.clone())
                .wrap(actix_web::middleware::from_fn(
                    rocksky_jellyfin::compat::normalize_path,
                ))
                .configure(rocksky_jellyfin::handlers::configure),
        )
        .await
    };
}

/// Authenticate as the fixture user and return `(token, user guid)`.
macro_rules! login {
    ($app:expr) => {{
        let req = test::TestRequest::post()
            .uri("/Users/AuthenticateByName")
            .insert_header((
                "X-Emby-Authorization",
                r#"MediaBrowser Client="t", Device="d", DeviceId="i", Version="v""#,
            ))
            .set_json(json!({ "Username": common::HANDLE, "Pw": common::API_KEY }))
            .to_request();
        let body: Value = test::call_and_read_body_json(&$app, req).await;
        let token = body["AccessToken"]
            .as_str()
            .expect("no access token in the auth response")
            .to_string();
        let user_id = body["User"]["Id"].as_str().unwrap().to_string();
        (token, user_id)
    }};
}

macro_rules! get_json {
    ($app:expr, $token:expr, $uri:expr) => {{
        let req = test::TestRequest::get()
            .uri(&$uri)
            .insert_header(("X-Emby-Token", $token.clone()))
            .to_request();
        let v: Value = test::call_and_read_body_json(&$app, req).await;
        v
    }};
}

macro_rules! get_status {
    ($app:expr, $token:expr, $uri:expr) => {{
        let req = test::TestRequest::get()
            .uri(&$uri)
            .insert_header(("X-Emby-Token", $token.clone()))
            .to_request();
        test::call_service(&$app, req).await.status()
    }};
}

macro_rules! post_json {
    ($app:expr, $token:expr, $uri:expr) => {{
        let req = test::TestRequest::post()
            .uri(&$uri)
            .insert_header(("X-Emby-Token", $token.clone()))
            .to_request();
        let v: Value = test::call_and_read_body_json(&$app, req).await;
        v
    }};
    ($app:expr, $token:expr, $uri:expr, $body:expr) => {{
        let req = test::TestRequest::post()
            .uri(&$uri)
            .insert_header(("X-Emby-Token", $token.clone()))
            .set_json($body)
            .to_request();
        let v: Value = test::call_and_read_body_json(&$app, req).await;
        v
    }};
}

/// The first item in a list whose `Name` matches, as a `(name → id)` lookup.
fn ids_by_name(items: &Value) -> std::collections::HashMap<String, String> {
    items["Items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| {
            (
                v["Name"].as_str().unwrap().to_string(),
                v["Id"].as_str().unwrap().to_string(),
            )
        })
        .collect()
}

// ── System ──────────────────────────────────────────────────────────────────

#[actix_web::test]
async fn system_info_public_needs_no_token() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let server_id = fx.state.server_id.clone();
    let app = app!(fx);

    let req = test::TestRequest::get()
        .uri("/System/Info/Public")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
    let body: Value = test::read_body_json(resp).await;
    assert_eq!(body["Id"], server_id);
    assert_eq!(body["ServerName"], "Rocksky Test");
    assert_eq!(body["ProductName"], "Jellyfin Server");
    assert_eq!(body["StartupWizardCompleted"], true);

    // The authenticated variant is refused without a token.
    let req = test::TestRequest::get().uri("/System/Info").to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::UNAUTHORIZED
    );

    // The login-screen user picker is deliberately empty: this server fronts
    // every Rocksky account, so there is no public list to publish.
    let req = test::TestRequest::get().uri("/Users/Public").to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    assert!(body.as_array().unwrap().is_empty());

    fx.cleanup().await;
}

#[actix_web::test]
async fn wrong_credentials_are_rejected() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let app = app!(fx);

    for (user, pw) in [
        (common::HANDLE, "not-the-key"),
        ("nobody.example.com", common::API_KEY),
        (common::HANDLE, ""),
    ] {
        let req = test::TestRequest::post()
            .uri("/Users/AuthenticateByName")
            .set_json(json!({ "Username": user, "Pw": pw }))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::UNAUTHORIZED,
            "expected 401 for {user}"
        );
    }

    // The Rocksky handle plus one of its enabled API keys is all it takes —
    // the same pair the Subsonic service accepts.
    let (token, user_id) = login!(app);
    assert!(!token.is_empty());
    assert_eq!(user_id.len(), 36, "user id must be a dashed UUID");

    let me = get_json!(app, token, "/Users/Me".to_string());
    assert_eq!(me["Name"], common::HANDLE);
    assert_eq!(me["Id"], user_id);
    // A Rocksky account owns its own library and nothing else.
    assert_eq!(me["Policy"]["IsAdministrator"], false);
    assert_eq!(me["Policy"]["EnableContentDeletion"], false);
    assert_eq!(me["Policy"]["EnableMediaPlayback"], true);

    fx.cleanup().await;
}

/// Jellyfin runs on ASP.NET Core, so its routing is case-insensitive, tolerant
/// of stray slashes, and answers the legacy `/emby` and `/mediabrowser`
/// prefixes. Clients rely on all three, and a server that doesn't 404s every
/// request and never gets past the connect screen.
#[actix_web::test]
async fn paths_are_matched_the_way_the_reference_server_matches_them() {
    let Some(fx) = common::setup().await else { return };
    let app = app!(fx);

    for path in [
        "/System/Info/Public",
        "/system/info/public",
        "/SYSTEM/INFO/PUBLIC",
        "/sYsTeM/iNfO/pUbLiC",
        "//System/Info/Public",
        "/System/Info/Public/",
        "/System//Info///Public//",
        "/emby/System/Info/Public",
        "/mediabrowser/System/Info/Public",
        "/emby/system/info/public/",
    ] {
        let req = test::TestRequest::get().uri(path).to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK, "{path}");
    }

    // Logging in through a lower-cased path yields a working token.
    let req = test::TestRequest::post()
        .uri("/users/authenticatebyname")
        .insert_header((
            "X-Emby-Authorization",
            r#"MediaBrowser Client="t", Device="d", DeviceId="i", Version="v""#,
        ))
        .set_json(json!({ "Username": common::HANDLE, "Pw": common::API_KEY }))
        .to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    let token = body["AccessToken"].as_str().unwrap().to_string();

    for path in [
        "/users/me",
        "/library/mediafolders",
        "/USERVIEWS",
        "/emby/Users/Me",
        "/items?includeItemTypes=MusicArtist",
    ] {
        assert_eq!(
            get_status!(app, token, path.to_string()),
            StatusCode::OK,
            "{path}"
        );
    }

    // The query string survives normalization, so filters still apply.
    let body = get_json!(app, token, "/ITEMS?includeItemTypes=Audio".to_string());
    assert_eq!(body["TotalRecordCount"], 1);
    assert_eq!(body["Items"][0]["Type"], "Audio");

    // Names in the path are data, not route literals, and must not be folded.
    let artists = get_json!(app, token, "/artists".to_string());
    let artist_id = artists["Items"][0]["Id"].as_str().unwrap().to_string();
    let by_id = get_json!(app, token, format!("/Artists/{artist_id}"));
    assert_eq!(by_id["Name"], "Test Artist");
    let encoded = get_json!(app, token, "/Artists/Test%20Artist".to_string());
    assert_eq!(encoded["Id"], artist_id);

    fx.cleanup().await;
}

// ── Browse and stream ───────────────────────────────────────────────────────

#[actix_web::test]
async fn authenticate_then_browse_then_stream() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let app = app!(fx);
    let (token, _) = login!(app);

    // A protected endpoint without a token is refused.
    let req = test::TestRequest::get()
        .uri("/Items?IncludeItemTypes=MusicArtist")
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::UNAUTHORIZED
    );

    // Bare /Items is the "what libraries are there" call.
    let views = get_json!(app, token, "/Items".to_string());
    let names: Vec<&str> = views["Items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["Name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["Music", "Playlists"]);
    assert_eq!(views["Items"][0]["Type"], "CollectionFolder");
    assert_eq!(views["Items"][0]["CollectionType"], "music");

    let artists = get_json!(
        app,
        token,
        "/Items?IncludeItemTypes=MusicArtist".to_string()
    );
    assert_eq!(artists["TotalRecordCount"], 1);
    assert_eq!(artists["Items"][0]["Name"], "Test Artist");
    assert_eq!(artists["Items"][0]["AlbumCount"], 1);
    let artist_id = artists["Items"][0]["Id"].as_str().unwrap().to_string();

    // The alpha rail filters every item type the same way. The fixture's
    // artist, album and song all start with T.
    for (uri, expected) in [
        ("/Items?IncludeItemTypes=MusicArtist&NameStartsWith=T", 1),
        ("/Items?IncludeItemTypes=MusicArtist&NameStartsWith=X", 0),
        ("/Items?IncludeItemTypes=MusicAlbum&NameStartsWith=T", 1),
        ("/Items?IncludeItemTypes=MusicAlbum&NameStartsWith=X", 0),
        ("/Items?IncludeItemTypes=Audio&NameStartsWith=T", 1),
        ("/Items?IncludeItemTypes=Audio&NameStartsWith=X", 0),
        ("/Artists?NameStartsWith=T", 1),
        ("/Artists?NameStartsWith=X", 0),
    ] {
        let body = get_json!(app, token, uri.to_string());
        assert_eq!(body["TotalRecordCount"], expected, "wrong count for {uri}");
    }

    // `NameStartsWith` really is a prefix, not a substring: "est" is inside
    // every fixture name and must still match nothing.
    let body = get_json!(
        app,
        token,
        "/Items?IncludeItemTypes=Audio&NameStartsWith=est".to_string()
    );
    assert_eq!(body["TotalRecordCount"], 0);

    for uri in [
        "/Artists/Prefixes",
        "/Items/Prefixes?IncludeItemTypes=MusicAlbum",
    ] {
        let body = get_json!(app, token, uri.to_string());
        let names: Vec<&str> = body
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v["Name"].as_str().unwrap())
            .collect();
        assert_eq!(names, vec!["T"], "{uri}");
    }

    // Drill down: artist → album → song.
    let albums = get_json!(app, token, format!("/Items?ParentId={artist_id}"));
    assert_eq!(albums["TotalRecordCount"], 1);
    assert_eq!(albums["Items"][0]["Name"], "Test Album");
    assert_eq!(albums["Items"][0]["SongCount"], 1);
    assert_eq!(albums["Items"][0]["ProductionYear"], 2020);
    let album_id = albums["Items"][0]["Id"].as_str().unwrap().to_string();

    let songs = get_json!(app, token, format!("/Items?ParentId={album_id}"));
    assert_eq!(songs["TotalRecordCount"], 1);
    let song = &songs["Items"][0];
    assert_eq!(song["Name"], "Test Song");
    assert_eq!(song["Type"], "Audio");
    assert_eq!(song["MediaType"], "Audio");
    assert_eq!(song["AlbumId"], album_id);
    assert_eq!(song["IndexNumber"], 1);
    // 60s in 100-nanosecond ticks.
    assert_eq!(song["RunTimeTicks"], 600_000_000_i64);
    assert_eq!(song["MediaSources"][0]["Container"], "mp3");
    assert_eq!(song["MediaStreams"][0]["SampleRate"], 44100);
    let song_id = song["Id"].as_str().unwrap().to_string();

    // Ids are dashed UUIDs — the official SDKs reject anything else and drop
    // the object without a word.
    for id in [&artist_id, &album_id, &song_id] {
        assert_eq!(id.len(), 36, "{id} is not a dashed UUID");
        assert_eq!(id.as_bytes()[8], b'-');
    }

    // Uploads live in object storage, so a stream is a redirect to it rather
    // than bytes proxied through this server.
    let req = test::TestRequest::get()
        .uri(&format!("/Audio/{song_id}/stream?api_key={token}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::FOUND);
    let location = resp
        .headers()
        .get("location")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(
        location.contains(&format!("uploads/{}.mp3", fx.id("tr", 1))),
        "unexpected stream target: {location}"
    );

    // The extension and universal variants resolve to the same object.
    for uri in [
        format!("/Audio/{song_id}/stream.mp3?api_key={token}"),
        format!("/Audio/{song_id}/universal?api_key={token}"),
        format!("/Items/{song_id}/File?api_key={token}"),
        format!("/Items/{song_id}/Download?api_key={token}"),
    ] {
        let req = test::TestRequest::get().uri(&uri).to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::FOUND, "{uri}");
        assert_eq!(
            resp.headers().get("location").unwrap().to_str().unwrap(),
            location,
            "{uri}"
        );
    }

    // HEAD is what clients probe with before playing.
    let req = test::TestRequest::default()
        .method(actix_web::http::Method::HEAD)
        .uri(&format!("/Audio/{song_id}/stream?api_key={token}"))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::FOUND
    );

    // No token, no stream — even though the redirect target is public, the id
    // that names it isn't.
    let req = test::TestRequest::get()
        .uri(&format!("/Audio/{song_id}/stream"))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::UNAUTHORIZED
    );

    // PlaybackInfo describes the same source, direct-play only.
    let info = get_json!(app, token, format!("/Items/{song_id}/PlaybackInfo"));
    assert_eq!(info["MediaSources"][0]["SupportsDirectPlay"], true);
    assert_eq!(info["MediaSources"][0]["SupportsTranscoding"], false);
    assert!(info["PlaySessionId"].as_str().unwrap().len() > 0);

    fx.cleanup().await;
}

#[actix_web::test]
async fn item_lookup_by_id_and_by_ids_list() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let app = app!(fx);
    let (token, user_id) = login!(app);

    let songs = get_json!(app, token, "/Items?IncludeItemTypes=Audio".to_string());
    let song_id = songs["Items"][0]["Id"].as_str().unwrap().to_string();
    let albums = get_json!(app, token, "/Items?IncludeItemTypes=MusicAlbum".to_string());
    let album_id = albums["Items"][0]["Id"].as_str().unwrap().to_string();

    let item = get_json!(app, token, format!("/Items/{song_id}"));
    assert_eq!(item["Name"], "Test Song");

    // The per-user detail path answers the same thing.
    let item = get_json!(app, token, format!("/Users/{user_id}/Items/{song_id}"));
    assert_eq!(item["Name"], "Test Song");

    // ?ids= takes a mixed list and returns each in turn.
    let body = get_json!(app, token, format!("/Items?ids={song_id},{album_id}"));
    assert_eq!(body["TotalRecordCount"], 2);

    // A library folder resolves through the same endpoint — clients fetch it
    // for the page header before listing children.
    let library = rocksky_jellyfin::guid::library_guid();
    let body = get_json!(app, token, format!("/Users/{user_id}/Items/{library}"));
    assert_eq!(body["Type"], "CollectionFolder");
    assert_eq!(body["CollectionType"], "music");

    assert_eq!(
        get_status!(
            app,
            token,
            "/Items/00000000-0000-0000-0000-000000000000".to_string()
        ),
        StatusCode::NOT_FOUND
    );

    fx.cleanup().await;
}

// ── Playlists ───────────────────────────────────────────────────────────────

#[actix_web::test]
async fn playlist_crud_roundtrip() {
    let Some(fx) = common::setup().await else {
        return;
    };
    common::add_song(
        &fx.pool,
        &fx.tag,
        &common::Song {
            id: fx.id("tr", 2),
            title: "Second Song".into(),
            artist: "Test Artist".into(),
            album: "Test Album".into(),
            artist_id: fx.id("ar", 1),
            album_id: fx.id("al", 1),
            genre: None,
            track_number: 2,
            duration_ms: 45_000,
        },
    )
    .await;

    let app = app!(fx);
    let (token, user_id) = login!(app);

    let songs = get_json!(app, token, "/Items?IncludeItemTypes=Audio".to_string());
    assert_eq!(songs["TotalRecordCount"], 2);
    let by_name = ids_by_name(&songs);
    let s1 = by_name["Test Song"].clone();
    let s2 = by_name["Second Song"].clone();

    // Create with one initial track in the JSON body.
    let created = post_json!(
        app,
        token,
        "/Playlists".to_string(),
        json!({ "Name": "My Mix", "Ids": [s1.clone()], "MediaType": "Audio" })
    );
    let playlist_id = created["Id"].as_str().unwrap().to_string();
    assert_eq!(playlist_id.len(), 36);

    let pl = get_json!(app, token, format!("/Playlists/{playlist_id}"));
    assert_eq!(pl["Name"], "My Mix");
    assert_eq!(pl["Type"], "Playlist");
    assert_eq!(pl["ChildCount"], 1);

    // It shows up as an item, in the Playlists library, and on /Playlists.
    let list = get_json!(app, token, "/Items?IncludeItemTypes=Playlist".to_string());
    assert_eq!(list["TotalRecordCount"], 1);
    assert_eq!(list["Items"][0]["Id"], playlist_id);

    let views = get_json!(app, token, format!("/Users/{user_id}/Views"));
    let names: Vec<&str> = views["Items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["Name"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"Playlists"));

    let playlists_lib = rocksky_jellyfin::guid::playlists_library_guid();
    let header = get_json!(
        app,
        token,
        format!("/Users/{user_id}/Items/{playlists_lib}")
    );
    assert_eq!(header["Type"], "CollectionFolder");
    assert_eq!(header["CollectionType"], "playlists");

    let list = get_json!(app, token, format!("/Items?parentId={playlists_lib}"));
    assert_eq!(list["TotalRecordCount"], 1);
    assert_eq!(list["Items"][0]["Id"], playlist_id);

    let list = get_json!(app, token, "/Playlists".to_string());
    assert_eq!(list["TotalRecordCount"], 1);

    // Append the second track.
    let req = test::TestRequest::post()
        .uri(&format!("/Playlists/{playlist_id}/Items?ids={s2}"))
        .insert_header(("X-Emby-Token", token.clone()))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NO_CONTENT
    );

    let items = get_json!(app, token, format!("/Playlists/{playlist_id}/Items"));
    assert_eq!(items["TotalRecordCount"], 2);
    assert_eq!(items["Items"][0]["Name"], "Test Song");
    assert_eq!(items["Items"][1]["Name"], "Second Song");
    // Entries are addressed by position: the same track can sit in a playlist
    // twice, so a song id would be ambiguous.
    let entry_0 = items["Items"][0]["PlaylistItemId"]
        .as_str()
        .unwrap()
        .to_string();
    let entry_1 = items["Items"][1]["PlaylistItemId"]
        .as_str()
        .unwrap()
        .to_string();
    assert_ne!(entry_0, entry_1);

    // Move position 0 to position 1.
    let req = test::TestRequest::post()
        .uri(&format!("/Playlists/{playlist_id}/Items/{entry_0}/Move/1"))
        .insert_header(("X-Emby-Token", token.clone()))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NO_CONTENT
    );
    let items = get_json!(app, token, format!("/Playlists/{playlist_id}/Items"));
    assert_eq!(items["Items"][0]["Name"], "Second Song");
    assert_eq!(items["Items"][1]["Name"], "Test Song");

    // Rename.
    let req = test::TestRequest::post()
        .uri(&format!("/Playlists/{playlist_id}"))
        .insert_header(("X-Emby-Token", token.clone()))
        .set_json(json!({ "Name": "Renamed Mix" }))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NO_CONTENT
    );
    let pl = get_json!(app, token, format!("/Playlists/{playlist_id}"));
    assert_eq!(pl["Name"], "Renamed Mix");

    // Remove the head entry.
    let items = get_json!(app, token, format!("/Playlists/{playlist_id}/Items"));
    let head = items["Items"][0]["PlaylistItemId"]
        .as_str()
        .unwrap()
        .to_string();
    let req = test::TestRequest::delete()
        .uri(&format!("/Playlists/{playlist_id}/Items?entryIds={head}"))
        .insert_header(("X-Emby-Token", token.clone()))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NO_CONTENT
    );
    let items = get_json!(app, token, format!("/Playlists/{playlist_id}/Items"));
    assert_eq!(items["TotalRecordCount"], 1);
    assert_eq!(items["Items"][0]["Name"], "Test Song");

    // Sharing isn't modelled, so a playlist has no other users.
    let users = get_json!(app, token, format!("/Playlists/{playlist_id}/Users"));
    assert!(users.as_array().unwrap().is_empty());

    // Only playlists are deletable — the library itself is owned by the upload
    // pipeline, not by this API.
    let req = test::TestRequest::delete()
        .uri(&format!("/Items/{s1}"))
        .insert_header(("X-Emby-Token", token.clone()))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::FORBIDDEN
    );

    let req = test::TestRequest::delete()
        .uri(&format!("/Items/{playlist_id}"))
        .insert_header(("X-Emby-Token", token.clone()))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        get_status!(app, token, format!("/Playlists/{playlist_id}")),
        StatusCode::NOT_FOUND
    );

    fx.cleanup().await;
}

// ── Favourites ──────────────────────────────────────────────────────────────

#[actix_web::test]
async fn favorites_roundtrip_via_userfavoriteitems_and_filters() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let app = app!(fx);
    let (token, user_id) = login!(app);

    let songs = get_json!(app, token, "/Items?IncludeItemTypes=Audio".to_string());
    assert_eq!(songs["TotalRecordCount"], 1);
    let song_id = songs["Items"][0]["Id"].as_str().unwrap().to_string();
    assert_eq!(songs["Items"][0]["UserData"]["IsFavorite"], false);

    let artists = get_json!(
        app,
        token,
        "/Items?IncludeItemTypes=MusicArtist".to_string()
    );
    let artist_id = artists["Items"][0]["Id"].as_str().unwrap().to_string();
    let albums = get_json!(app, token, "/Items?IncludeItemTypes=MusicAlbum".to_string());
    let album_id = albums["Items"][0]["Id"].as_str().unwrap().to_string();

    let ud = post_json!(app, token, format!("/UserFavoriteItems/{song_id}"));
    assert_eq!(ud["IsFavorite"], true);
    assert_eq!(ud["ItemId"], song_id);
    assert_eq!(ud["Key"], song_id);

    // The star landed in `loved_tracks`, which is what the profile and the
    // Subsonic service read.
    let starred: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM loved_tracks WHERE track_id = $1")
        .bind(fx.id("tr", 1))
        .fetch_one(fx.pool.as_ref())
        .await
        .unwrap();
    assert_eq!(starred, 1);

    for uri in [
        format!("/Items/{song_id}"),
        format!("/Users/{user_id}/Items/{song_id}"),
    ] {
        let item = get_json!(app, token, uri.clone());
        assert_eq!(item["UserData"]["IsFavorite"], true, "{uri}");
    }

    // Rocksky only knows how to love a track: an album or artist star has
    // nowhere to go, so it is refused rather than silently dropped.
    for id in [&album_id, &artist_id] {
        let req = test::TestRequest::post()
            .uri(&format!("/UserFavoriteItems/{id}"))
            .insert_header(("X-Emby-Token", token.clone()))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::BAD_REQUEST
        );
    }
    let req = test::TestRequest::post()
        .uri(&format!("/Users/{user_id}/FavoriteItems/{album_id}"))
        .insert_header(("X-Emby-Token", token.clone()))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::BAD_REQUEST
    );

    // Both spellings of the favourites filter return the starred track.
    for uri in [
        "/Items?Filters=IsFavorite&Recursive=true",
        "/Items?IsFavorite=true&IncludeItemTypes=Audio",
    ] {
        let favs = get_json!(app, token, uri.to_string());
        assert_eq!(favs["TotalRecordCount"], 1, "{uri}");
        assert_eq!(favs["Items"][0]["Id"], song_id, "{uri}");
        assert_eq!(favs["Items"][0]["Type"], "Audio", "{uri}");
    }

    // Asking for favourite artists or albums yields nothing, because nothing
    // of those kinds can be starred.
    for uri in [
        "/Items?Filters=IsFavorite&IncludeItemTypes=MusicArtist",
        "/Artists?isFavorite=true",
    ] {
        let favs = get_json!(app, token, uri.to_string());
        assert_eq!(favs["TotalRecordCount"], 0, "{uri}");
    }

    let ud = {
        let req = test::TestRequest::delete()
            .uri(&format!("/UserFavoriteItems/{song_id}"))
            .insert_header(("X-Emby-Token", token.clone()))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let v: Value = test::read_body_json(resp).await;
        v
    };
    assert_eq!(ud["IsFavorite"], false);
    assert_eq!(ud["ItemId"], song_id);

    let item = get_json!(app, token, format!("/Items/{song_id}"));
    assert_eq!(item["UserData"]["IsFavorite"], false);
    let favs = get_json!(
        app,
        token,
        "/Items?Filters=IsFavorite&Recursive=true".to_string()
    );
    assert_eq!(favs["TotalRecordCount"], 0);

    // An id we've never issued is a 404, not a silent no-op.
    let req = test::TestRequest::post()
        .uri("/UserFavoriteItems/00000000-0000-0000-0000-000000000000")
        .insert_header(("X-Emby-Token", token.clone()))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NOT_FOUND
    );

    fx.cleanup().await;
}

// ── UserData ────────────────────────────────────────────────────────────────

#[actix_web::test]
async fn user_data_roundtrip_played_rating_and_full_update() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let app = app!(fx);
    let (token, user_id) = login!(app);

    let songs = get_json!(app, token, "/Items?IncludeItemTypes=Audio".to_string());
    let song_id = songs["Items"][0]["Id"].as_str().unwrap().to_string();

    let ud = get_json!(app, token, format!("/UserItems/{song_id}/UserData"));
    assert_eq!(ud["Played"], false);
    assert_eq!(ud["PlayCount"], 0);
    assert_eq!(ud["PlaybackPositionTicks"], 0);
    assert_eq!(ud["IsFavorite"], false);
    assert!(ud["Rating"].is_null());
    assert!(ud["Likes"].is_null());
    assert_eq!(ud["Key"], song_id);
    assert_eq!(ud["ItemId"], song_id);

    let ud = post_json!(app, token, format!("/UserPlayedItems/{song_id}"));
    assert_eq!(ud["Played"], true);
    assert_eq!(ud["PlayCount"], 1);
    assert!(ud["LastPlayedDate"].as_str().unwrap().len() >= 19);

    let ud = post_json!(app, token, format!("/UserPlayedItems/{song_id}"));
    assert_eq!(ud["PlayCount"], 2);

    let item = get_json!(app, token, format!("/Items/{song_id}"));
    assert_eq!(item["UserData"]["Played"], true);
    assert_eq!(item["UserData"]["PlayCount"], 2);

    let ud = post_json!(
        app,
        token,
        format!("/UserItems/{song_id}/Rating?likes=true")
    );
    assert_eq!(ud["Likes"], true);
    // Play state survives a rating write.
    assert_eq!(ud["PlayCount"], 2);
    assert_eq!(ud["Played"], true);

    let ud = {
        let req = test::TestRequest::delete()
            .uri(&format!("/UserItems/{song_id}/Rating"))
            .insert_header(("X-Emby-Token", token.clone()))
            .to_request();
        let v: Value = test::call_and_read_body_json(&app, req).await;
        v
    };
    assert!(ud["Likes"].is_null());

    let ud = {
        let req = test::TestRequest::delete()
            .uri(&format!("/UserPlayedItems/{song_id}"))
            .insert_header(("X-Emby-Token", token.clone()))
            .to_request();
        let v: Value = test::call_and_read_body_json(&app, req).await;
        v
    };
    assert_eq!(ud["Played"], false);
    assert_eq!(ud["PlayCount"], 0);
    assert!(ud["LastPlayedDate"].is_null());

    // One body sets everything at once, favourite included.
    let ud = post_json!(
        app,
        token,
        format!("/UserItems/{song_id}/UserData"),
        json!({
            "Rating": 8.5,
            "PlaybackPositionTicks": 12_345_678_i64,
            "PlayCount": 5,
            "Played": true,
            "IsFavorite": true,
            "Likes": false,
            "LastPlayedDate": "2026-01-02T03:04:05.0000000",
        })
    );
    assert_eq!(ud["Rating"], 8.5);
    assert_eq!(ud["PlaybackPositionTicks"], 12_345_678_i64);
    assert_eq!(ud["PlayCount"], 5);
    assert_eq!(ud["Played"], true);
    assert_eq!(ud["IsFavorite"], true);
    assert_eq!(ud["Likes"], false);
    assert_eq!(ud["LastPlayedDate"], "2026-01-02T03:04:05.0000000");

    let item = get_json!(app, token, format!("/Items/{song_id}"));
    assert_eq!(item["UserData"]["Rating"], 8.5);
    assert_eq!(item["UserData"]["IsFavorite"], true);
    assert_eq!(item["UserData"]["PlaybackPositionTicks"], 12_345_678_i64);

    // The legacy per-user paths reach the same rows.
    let ud = {
        let req = test::TestRequest::delete()
            .uri(&format!("/Users/{user_id}/PlayedItems/{song_id}"))
            .insert_header(("X-Emby-Token", token.clone()))
            .to_request();
        let v: Value = test::call_and_read_body_json(&app, req).await;
        v
    };
    assert_eq!(ud["Played"], false);
    assert_eq!(ud["PlayCount"], 0);
    // Resetting play state leaves rating and favourite alone.
    assert_eq!(ud["IsFavorite"], true);
    assert_eq!(ud["Rating"], 8.5);
    assert_eq!(ud["Likes"], false);

    let ud = post_json!(
        app,
        token,
        format!("/Users/{user_id}/Items/{song_id}/Rating?likes=false")
    );
    assert_eq!(ud["Likes"], false);

    let ud = get_json!(
        app,
        token,
        format!("/Users/{user_id}/Items/{song_id}/UserData")
    );
    assert_eq!(ud["Likes"], false);
    assert_eq!(ud["IsFavorite"], true);

    let bogus = "00000000-0000-0000-0000-000000000000";
    for uri in [
        format!("/UserPlayedItems/{bogus}"),
        format!("/UserItems/{bogus}/Rating"),
        format!("/UserItems/{bogus}/UserData"),
    ] {
        let req = test::TestRequest::post()
            .uri(&uri)
            .insert_header(("X-Emby-Token", token.clone()))
            .set_json(json!({}))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::NOT_FOUND,
            "expected 404 for {uri}"
        );
    }

    fx.cleanup().await;
}

// ── Instant mix ─────────────────────────────────────────────────────────────

#[actix_web::test]
async fn instant_mix_seeds_and_limit() {
    let Some(fx) = common::setup().await else {
        return;
    };

    // A second artist and album, plus enough songs for the mix to fall through
    // its tiers: seed's own tracks, then the seed's genre, then random filler.
    common::add_artist(&fx.pool, &fx.id("ar", 2), "Another Artist", &["Rock"]).await;
    common::add_album(
        &fx.pool,
        &fx.id("al", 2),
        "Other Album",
        "Another Artist",
        2021,
    )
    .await;
    common::link_artist_album(&fx.pool, &fx.tag, &fx.id("ar", 2), &fx.id("al", 2)).await;

    for (n, title, artist_n, album_n, genre) in [
        (2, "Second Song", 1, 1, Some("Rock")),
        (3, "Third Song", 1, 1, Some("Rock")),
        (4, "Fourth Song", 2, 2, Some("Rock")),
        (5, "Fifth Song", 2, 2, Some("Jazz")),
    ] {
        common::add_song(
            &fx.pool,
            &fx.tag,
            &common::Song {
                id: fx.id("tr", n),
                title: title.into(),
                artist: if artist_n == 1 {
                    "Test Artist"
                } else {
                    "Another Artist"
                }
                .into(),
                album: if album_n == 1 {
                    "Test Album"
                } else {
                    "Other Album"
                }
                .into(),
                artist_id: fx.id("ar", artist_n),
                album_id: fx.id("al", album_n),
                genre: genre.map(str::to_string),
                track_number: n as i32,
                duration_ms: 60_000,
            },
        )
        .await;
    }

    let app = app!(fx);
    let (token, _) = login!(app);

    let artists = get_json!(
        app,
        token,
        "/Items?IncludeItemTypes=MusicArtist".to_string()
    );
    let ar1 = ids_by_name(&artists)["Test Artist"].clone();
    let albums = get_json!(app, token, "/Items?IncludeItemTypes=MusicAlbum".to_string());
    let al1 = ids_by_name(&albums)["Test Album"].clone();
    let songs = get_json!(
        app,
        token,
        "/Items?IncludeItemTypes=Audio&limit=100".to_string()
    );
    let so1 = ids_by_name(&songs)["Test Song"].clone();

    let mix = get_json!(app, token, format!("/Artists/{ar1}/InstantMix?limit=5"));
    assert_eq!(mix["TotalRecordCount"], 5);
    assert_eq!(mix["Items"][0]["Type"], "Audio");
    assert_eq!(mix["Items"][0]["MediaType"], "Audio");

    let mix = get_json!(app, token, format!("/Albums/{al1}/InstantMix?limit=3"));
    assert_eq!(mix["TotalRecordCount"], 3);

    // A song seed leads with the seed itself.
    let mix = get_json!(app, token, format!("/Songs/{so1}/InstantMix?limit=4"));
    assert_eq!(mix["TotalRecordCount"], 4);
    assert_eq!(mix["Items"][0]["Id"], so1);
    let unique: std::collections::HashSet<&str> = mix["Items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["Id"].as_str().unwrap())
        .collect();
    assert_eq!(unique.len(), 4, "instant mix must not repeat a track");

    // The generic /Items route dispatches on the seed's kind.
    let mix = get_json!(app, token, format!("/Items/{so1}/InstantMix?limit=2"));
    assert_eq!(mix["TotalRecordCount"], 2);
    assert_eq!(mix["Items"][0]["Id"], so1);

    // A genre seed can be named rather than addressed by id.
    //
    // Rocksky tags genres on the artist, not the track, so "Rock" means
    // "everything by an artist tagged Rock" — here the two songs on Another
    // Artist. The mix leads with those before falling through to filler.
    let mix = get_json!(
        app,
        token,
        "/MusicGenres/Rock/InstantMix?limit=2".to_string()
    );
    assert_eq!(mix["TotalRecordCount"], 2);
    for item in mix["Items"].as_array().unwrap() {
        assert_eq!(
            item["AlbumArtist"], "Another Artist",
            "a Rock mix must lead with the Rock-tagged artist's songs"
        );
    }

    // The query-parameter form answers empty rather than 404 for an id it
    // can't place — that call is how clients seed from a genre they only half
    // know, and a 404 there reads as a broken server.
    let mix = get_json!(
        app,
        token,
        "/MusicGenres/InstantMix?id=00000000-0000-0000-0000-000000000000&limit=5".to_string()
    );
    assert_eq!(mix["TotalRecordCount"], 0);

    // Playlist seed leads with the playlist's own tracks.
    let created = post_json!(
        app,
        token,
        "/Playlists".to_string(),
        json!({ "Name": "Mix Seed", "Ids": [so1.clone()], "MediaType": "Audio" })
    );
    let playlist_id = created["Id"].as_str().unwrap().to_string();
    let mix = get_json!(
        app,
        token,
        format!("/Playlists/{playlist_id}/InstantMix?limit=5")
    );
    assert_eq!(mix["TotalRecordCount"], 5);
    assert_eq!(mix["Items"][0]["Id"], so1);

    let bogus = "00000000-0000-0000-0000-000000000000";
    for uri in [
        format!("/Artists/{bogus}/InstantMix"),
        format!("/Albums/{bogus}/InstantMix"),
        format!("/Songs/{bogus}/InstantMix"),
        format!("/Playlists/{bogus}/InstantMix"),
        format!("/Items/{bogus}/InstantMix"),
    ] {
        assert_eq!(
            get_status!(app, token, uri.clone()),
            StatusCode::NOT_FOUND,
            "expected 404 for {uri}"
        );
    }

    fx.cleanup().await;
}

// ── Genres and filters ──────────────────────────────────────────────────────

#[actix_web::test]
async fn filters_and_genre_browsing() {
    let Some(fx) = common::setup().await else {
        return;
    };

    // Genres live on the artist in the Rocksky catalogue, so a second genre
    // means a second artist carrying it.
    common::add_artist(&fx.pool, &fx.id("ar", 2), "Rock Artist", &["Rock"]).await;
    common::add_artist(&fx.pool, &fx.id("ar", 3), "Jazz Artist", &["Jazz"]).await;
    common::add_album(&fx.pool, &fx.id("al", 2), "Rock Album", "Rock Artist", 2019).await;
    common::add_album(&fx.pool, &fx.id("al", 3), "Jazz Album", "Jazz Artist", 2019).await;
    common::link_artist_album(&fx.pool, &fx.tag, &fx.id("ar", 2), &fx.id("al", 2)).await;
    common::link_artist_album(&fx.pool, &fx.tag, &fx.id("ar", 3), &fx.id("al", 3)).await;
    common::add_song(
        &fx.pool,
        &fx.tag,
        &common::Song {
            id: fx.id("tr", 2),
            title: "Rock Song".into(),
            artist: "Rock Artist".into(),
            album: "Rock Album".into(),
            artist_id: fx.id("ar", 2),
            album_id: fx.id("al", 2),
            genre: Some("Rock".into()),
            track_number: 1,
            duration_ms: 60_000,
        },
    )
    .await;
    common::add_song(
        &fx.pool,
        &fx.tag,
        &common::Song {
            id: fx.id("tr", 3),
            title: "Jazz Song".into(),
            artist: "Jazz Artist".into(),
            album: "Jazz Album".into(),
            artist_id: fx.id("ar", 3),
            album_id: fx.id("al", 3),
            genre: Some("Jazz".into()),
            track_number: 1,
            duration_ms: 60_000,
        },
    )
    .await;

    let app = app!(fx);
    let (token, _) = login!(app);

    // Legacy filter shape: flat strings and years.
    let body = get_json!(app, token, "/Items/Filters".to_string());
    let genres: Vec<&str> = body["Genres"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert!(genres.contains(&"Rock"), "{genres:?}");
    assert!(genres.contains(&"Jazz"), "{genres:?}");
    let years: Vec<i64> = body["Years"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_i64().unwrap())
        .collect();
    assert!(years.contains(&2019), "{years:?}");
    assert!(years.contains(&2020), "{years:?}");
    assert!(body["Tags"].as_array().unwrap().is_empty());
    assert!(body["OfficialRatings"].as_array().unwrap().is_empty());

    // Modern shape: genres carry ids so the client can drill down.
    let body = get_json!(app, token, "/Items/Filters2".to_string());
    let genres = body["Genres"].as_array().unwrap();
    assert_eq!(genres.len(), 2);
    for g in genres {
        assert_eq!(g["Id"].as_str().unwrap().len(), 36);
        assert!(!g["Name"].as_str().unwrap().is_empty());
    }
    assert!(body["AudioLanguages"].as_array().unwrap().is_empty());

    for uri in ["/Genres", "/MusicGenres"] {
        let body = get_json!(app, token, uri.to_string());
        assert_eq!(body["TotalRecordCount"], 2, "{uri}");
    }

    let body = get_json!(app, token, "/Genres".to_string());
    let rock = body["Items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["Name"] == "Rock")
        .unwrap();
    assert_eq!(rock["Type"], "MusicGenre");
    assert_eq!(rock["SongCount"], 1);
    assert_eq!(rock["AlbumCount"], 1);
    let rock_id = rock["Id"].as_str().unwrap().to_string();

    let body = get_json!(app, token, "/Genres?NameStartsWith=R".to_string());
    assert_eq!(body["TotalRecordCount"], 1);
    assert_eq!(body["Items"][0]["Name"], "Rock");

    // The path segment is matched case-insensitively.
    let body = get_json!(app, token, "/Genres/rock".to_string());
    assert_eq!(body["Name"], "Rock");
    assert_eq!(body["Type"], "MusicGenre");
    assert_eq!(body["SongCount"], 1);

    let body = get_json!(app, token, "/MusicGenres/Jazz".to_string());
    assert_eq!(body["Name"], "Jazz");
    assert_eq!(body["SongCount"], 1);

    assert_eq!(
        get_status!(app, token, "/Genres/Reggae".to_string()),
        StatusCode::NOT_FOUND
    );

    // Drill-down by genre id, as songs and as albums.
    let body = get_json!(app, token, format!("/Items?parentId={rock_id}"));
    assert_eq!(body["TotalRecordCount"], 1);
    assert_eq!(body["Items"][0]["Name"], "Rock Song");
    assert_eq!(body["Items"][0]["Type"], "Audio");

    let body = get_json!(
        app,
        token,
        format!("/Items?parentId={rock_id}&IncludeItemTypes=MusicAlbum")
    );
    assert_eq!(body["TotalRecordCount"], 1);
    assert_eq!(body["Items"][0]["Type"], "MusicAlbum");
    assert_eq!(body["Items"][0]["Name"], "Rock Album");

    fx.cleanup().await;
}

// ── Counts, artist and album detail ─────────────────────────────────────────

#[actix_web::test]
async fn items_counts_and_detail_pages() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let app = app!(fx);
    let (token, _) = login!(app);

    let body = get_json!(app, token, "/Items/Counts".to_string());
    assert_eq!(body["SongCount"], 1);
    assert_eq!(body["AlbumCount"], 1);
    assert_eq!(body["ArtistCount"], 1);
    // There is no video in a Rocksky library, but the fields are required
    // non-nullable — they must be 0, not absent.
    assert_eq!(body["MovieCount"], 0);
    assert_eq!(body["SeriesCount"], 0);
    assert_eq!(body["EpisodeCount"], 0);

    let artists = get_json!(
        app,
        token,
        "/Items?IncludeItemTypes=MusicArtist".to_string()
    );
    let artist_id = artists["Items"][0]["Id"].as_str().unwrap().to_string();
    let body = get_json!(app, token, format!("/Items/{artist_id}"));
    assert_eq!(body["Type"], "MusicArtist");
    assert_eq!(body["Name"], "Test Artist");
    assert_eq!(body["IsFolder"], true);
    // No biography provider is wired in, so these stay null rather than empty.
    assert!(body["Overview"].is_null());
    assert!(body["Tags"].is_null());
    assert!(body["ExternalUrls"].is_null());

    // /Artists/{name} resolves by display name as well as by id.
    let by_name = get_json!(app, token, "/Artists/Test%20Artist".to_string());
    assert_eq!(by_name["Id"], artist_id);
    let by_id = get_json!(app, token, format!("/Artists/{artist_id}"));
    assert_eq!(by_id["Id"], artist_id);
    assert_eq!(
        get_status!(app, token, "/Artists/Nobody".to_string()),
        StatusCode::NOT_FOUND
    );

    let albums = get_json!(app, token, "/Items?IncludeItemTypes=MusicAlbum".to_string());
    let album_id = albums["Items"][0]["Id"].as_str().unwrap().to_string();
    let body = get_json!(app, token, format!("/Items/{album_id}"));
    assert_eq!(body["Type"], "MusicAlbum");
    assert_eq!(body["AlbumArtist"], "Test Artist");
    assert_eq!(body["ProductionYear"], 2020);
    assert_eq!(body["SongCount"], 1);
    assert_eq!(body["RunTimeTicks"], 600_000_000_i64);
    assert!(body["Overview"].is_null());
    // The album record hasn't been published, so there is no AT-URI to link.
    assert!(body["ExternalUrls"].is_null());

    fx.cleanup().await;
}

// ── Years, persons, studios ─────────────────────────────────────────────────

#[actix_web::test]
async fn years_persons_and_studios() {
    let Some(fx) = common::setup().await else {
        return;
    };

    common::add_artist(&fx.pool, &fx.id("ar", 2), "Second Artist", &[]).await;
    common::add_album(
        &fx.pool,
        &fx.id("al", 2),
        "Second Album",
        "Second Artist",
        2019,
    )
    .await;
    common::link_artist_album(&fx.pool, &fx.tag, &fx.id("ar", 2), &fx.id("al", 2)).await;
    common::add_song(
        &fx.pool,
        &fx.tag,
        &common::Song {
            id: fx.id("tr", 2),
            title: "Older Song".into(),
            artist: "Second Artist".into(),
            album: "Second Album".into(),
            artist_id: fx.id("ar", 2),
            album_id: fx.id("al", 2),
            genre: None,
            track_number: 1,
            duration_ms: 30_000,
        },
    )
    .await;

    let app = app!(fx);
    let (token, _) = login!(app);

    let body = get_json!(app, token, "/Years".to_string());
    assert_eq!(body["TotalRecordCount"], 2);
    assert_eq!(body["Items"][0]["Name"], "2019");
    assert_eq!(body["Items"][0]["Type"], "Year");
    assert_eq!(body["Items"][1]["Name"], "2020");
    let y2020 = body["Items"][1]["Id"].as_str().unwrap().to_string();

    let body = get_json!(app, token, "/Years?sortOrder=Descending".to_string());
    assert_eq!(body["Items"][0]["Name"], "2020");
    assert_eq!(body["Items"][1]["Name"], "2019");

    let body = get_json!(app, token, "/Years/2019".to_string());
    assert_eq!(body["Name"], "2019");
    assert_eq!(body["Type"], "Year");
    assert_eq!(body["ProductionYear"], 2019);
    assert_eq!(body["SongCount"], 1);
    assert_eq!(body["AlbumCount"], 1);

    assert_eq!(
        get_status!(app, token, "/Years/1999".to_string()),
        StatusCode::NOT_FOUND
    );

    // A year tile drills down into its songs, or its albums when asked.
    let body = get_json!(app, token, format!("/Items?parentId={y2020}"));
    assert_eq!(body["TotalRecordCount"], 1);
    assert_eq!(body["Items"][0]["Name"], "Test Song");

    let body = get_json!(
        app,
        token,
        format!("/Items?parentId={y2020}&IncludeItemTypes=MusicAlbum")
    );
    assert_eq!(body["TotalRecordCount"], 1);
    assert_eq!(body["Items"][0]["Type"], "MusicAlbum");

    // The catalogue carries no person or studio credits.
    for uri in ["/Persons", "/Studios"] {
        let body = get_json!(app, token, uri.to_string());
        assert_eq!(body["TotalRecordCount"], 0, "{uri}");
        assert!(body["Items"].as_array().unwrap().is_empty(), "{uri}");
    }
    for uri in ["/Persons/foo", "/Studios/foo"] {
        assert_eq!(
            get_status!(app, token, uri.to_string()),
            StatusCode::NOT_FOUND,
            "{uri}"
        );
    }

    fx.cleanup().await;
}

// ── Home rails ──────────────────────────────────────────────────────────────

#[actix_web::test]
async fn home_rails_suggestions_resume_and_latest() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let app = app!(fx);
    let (token, user_id) = login!(app);

    let body = get_json!(app, token, "/Items/Suggestions?limit=5".to_string());
    assert_eq!(body["TotalRecordCount"], 1);
    assert_eq!(body["Items"][0]["Type"], "MusicAlbum");

    let body = get_json!(
        app,
        token,
        "/Items/Suggestions?IncludeItemTypes=Audio&limit=5".to_string()
    );
    assert_eq!(body["TotalRecordCount"], 1);
    assert_eq!(body["Items"][0]["Type"], "Audio");

    // Nothing to resume until something has been left part-played.
    let body = get_json!(app, token, "/Items/Resume".to_string());
    assert_eq!(body["TotalRecordCount"], 0);

    let songs = get_json!(app, token, "/Items?IncludeItemTypes=Audio".to_string());
    let song_id = songs["Items"][0]["Id"].as_str().unwrap().to_string();
    let _ = post_json!(
        app,
        token,
        format!("/UserItems/{song_id}/UserData"),
        json!({ "PlaybackPositionTicks": 12_345_678_i64 })
    );

    for uri in [
        "/Items/Resume".to_string(),
        "/UserItems/Resume".to_string(),
        format!("/Users/{user_id}/Items/Resume"),
    ] {
        let body = get_json!(app, token, uri.clone());
        assert_eq!(body["TotalRecordCount"], 1, "{uri}");
        assert_eq!(body["Items"][0]["Id"], song_id, "{uri}");
    }

    // Finishing it takes it off the rail.
    let _ = post_json!(app, token, format!("/UserPlayedItems/{song_id}"));
    let body = get_json!(app, token, "/Items/Resume".to_string());
    assert_eq!(body["TotalRecordCount"], 0);

    // Latest is a bare array, not an ItemsResult — clients that get the
    // wrapper here render an empty row.
    let library = rocksky_jellyfin::guid::library_guid();
    for uri in [
        format!("/Users/{user_id}/Items/Latest?parentId={library}"),
        format!("/Users/{user_id}/Views/{library}/Latest"),
        "/UserItems/Latest".to_string(),
    ] {
        let body = get_json!(app, token, uri.clone());
        assert!(body.is_array(), "{uri} must be a bare array");
        assert_eq!(body.as_array().unwrap().len(), 1, "{uri}");
        assert_eq!(body[0]["Type"], "MusicAlbum", "{uri}");
    }

    let body = get_json!(
        app,
        token,
        "/Items/Latest?IncludeItemTypes=Audio".to_string()
    );
    assert_eq!(body[0]["Type"], "Audio");

    fx.cleanup().await;
}

// ── Search ──────────────────────────────────────────────────────────────────

#[actix_web::test]
async fn search_returns_items_and_hints() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let app = app!(fx);
    let (token, _) = login!(app);

    // Unfiltered search spans all three kinds; the fixture matches "Test" with
    // an artist, an album and a song.
    let body = get_json!(app, token, "/Items?searchTerm=Test".to_string());
    let types: Vec<&str> = body["Items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["Type"].as_str().unwrap())
        .collect();
    assert!(types.contains(&"MusicArtist"), "{types:?}");
    assert!(types.contains(&"MusicAlbum"), "{types:?}");
    assert!(types.contains(&"Audio"), "{types:?}");

    let body = get_json!(
        app,
        token,
        "/Items?searchTerm=Test&IncludeItemTypes=Audio".to_string()
    );
    assert_eq!(body["TotalRecordCount"], 1);
    assert_eq!(body["Items"][0]["Type"], "Audio");

    let body = get_json!(
        app,
        token,
        "/Items?searchTerm=nothingmatchesthis".to_string()
    );
    assert_eq!(body["TotalRecordCount"], 0);

    let hints = get_json!(app, token, "/Search/Hints?searchTerm=Test".to_string());
    assert!(hints["TotalRecordCount"].as_i64().unwrap() >= 3);
    let types: Vec<&str> = hints["SearchHints"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["Type"].as_str().unwrap())
        .collect();
    assert!(types.contains(&"Audio"), "{types:?}");

    // An empty term is a no-op rather than a whole-library dump.
    let hints = get_json!(app, token, "/Search/Hints".to_string());
    assert_eq!(hints["TotalRecordCount"], 0);
    assert!(hints["SearchHints"].as_array().unwrap().is_empty());

    fx.cleanup().await;
}

// ── Playback reporting ──────────────────────────────────────────────────────

#[actix_web::test]
async fn session_playback_reports_are_accepted() {
    let Some(fx) = common::setup().await else {
        return;
    };
    // Now-playing goes out over NATS; there is no broker here, which is what
    // proves the endpoints don't depend on one to answer.
    assert!(fx.state.nc.is_none());
    let app = app!(fx);
    let (token, _) = login!(app);

    let songs = get_json!(app, token, "/Items?IncludeItemTypes=Audio".to_string());
    let song_id = songs["Items"][0]["Id"].as_str().unwrap().to_string();

    for path in [
        "/Sessions/Playing",
        "/Sessions/Playing/Progress",
        "/Sessions/Playing/Stopped",
    ] {
        let req = test::TestRequest::post()
            .uri(path)
            .insert_header(("X-Emby-Token", token.clone()))
            .set_json(json!({ "ItemId": song_id.clone(), "PositionTicks": 100_000_000_i64 }))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::NO_CONTENT,
            "{path}"
        );
    }

    // 10s into a 60s track is not a listen, so nothing was marked played, but
    // the progress report did leave a resume position.
    let ud = get_json!(app, token, format!("/UserItems/{song_id}/UserData"));
    assert_eq!(ud["Played"], false);

    // Past the halfway mark it counts.
    let req = test::TestRequest::post()
        .uri("/Sessions/Playing/Stopped")
        .insert_header(("X-Emby-Token", token.clone()))
        .set_json(json!({ "ItemId": song_id.clone(), "PositionTicks": 400_000_000_i64 }))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NO_CONTENT
    );
    let ud = get_json!(app, token, format!("/UserItems/{song_id}/UserData"));
    assert_eq!(ud["Played"], true);
    assert_eq!(ud["PlayCount"], 1);
    // A stopped track is not a partly-played one.
    assert_eq!(ud["PlaybackPositionTicks"], 0);

    // A report about something we never issued an id for is ignored, not an
    // error — clients replay these and must not be made to retry.
    let req = test::TestRequest::post()
        .uri("/Sessions/Playing")
        .insert_header(("X-Emby-Token", token.clone()))
        .set_json(json!({ "ItemId": "00000000-0000-0000-0000-000000000000" }))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NO_CONTENT
    );

    fx.cleanup().await;
}

// ── Stubs ───────────────────────────────────────────────────────────────────

/// Endpoints with nothing behind them still have to answer. A 404 here is what
/// makes a client retry on every page render and fill the log with noise.
#[actix_web::test]
async fn stubs_answer_instead_of_404ing() {
    let Some(fx) = common::setup().await else {
        return;
    };
    let app = app!(fx);
    let (token, user_id) = login!(app);

    let songs = get_json!(app, token, "/Items?IncludeItemTypes=Audio".to_string());
    let song_id = songs["Items"][0]["Id"].as_str().unwrap().to_string();

    // Sessions, scheduled tasks and TV rails.
    let sessions = get_json!(app, token, "/Sessions".to_string());
    assert!(sessions.as_array().unwrap().is_empty());
    let tasks = get_json!(app, token, "/ScheduledTasks".to_string());
    assert!(tasks.as_array().unwrap().is_empty());
    for uri in ["/Shows/NextUp", "/Shows/Upcoming"] {
        let body = get_json!(app, token, uri.to_string());
        assert_eq!(body["TotalRecordCount"], 0, "{uri}");
    }

    // Detail-page rails that have no data here.
    for uri in [
        format!("/Items/{song_id}/SpecialFeatures"),
        format!("/Items/{song_id}/Ancestors"),
    ] {
        assert_eq!(
            get_status!(app, token, uri.clone()),
            StatusCode::OK,
            "{uri}"
        );
    }
    let similar = get_json!(app, token, format!("/Items/{song_id}/Similar"));
    assert_eq!(similar["TotalRecordCount"], 0);

    // ThemeMedia is a fixed object, not an array — clients deserialize it
    // strictly and an array breaks the whole detail page.
    let theme = get_json!(app, token, format!("/Items/{song_id}/ThemeMedia"));
    assert_eq!(theme["ThemeSongsResult"]["TotalRecordCount"], 0);
    assert_eq!(theme["OwnerId"], song_id);

    // Library shape.
    let folders = get_json!(app, token, "/Library/MediaFolders".to_string());
    assert_eq!(folders["TotalRecordCount"], 2);
    let virtual_folders = get_json!(app, token, "/Library/VirtualFolders".to_string());
    assert_eq!(virtual_folders.as_array().unwrap().len(), 2);
    let views = get_json!(app, token, "/UserViews".to_string());
    assert_eq!(views["TotalRecordCount"], 2);

    // Branding and display preferences, which the web client fetches first.
    let branding = get_json!(app, token, "/Branding/Configuration".to_string());
    assert_eq!(branding["CustomCss"], "");
    let prefs = get_json!(
        app,
        token,
        format!("/DisplayPreferences/usersettings?userId={user_id}")
    );
    assert_eq!(prefs["SortBy"], "SortName");

    // Uploads carry no lyric sidecar, and no live-update socket is served.
    for uri in [
        format!("/Audio/{song_id}/Lyrics"),
        "/socket".to_string(),
        format!("/Users/{user_id}/Images/Primary"),
    ] {
        assert_eq!(
            get_status!(app, token, uri.clone()),
            StatusCode::NOT_FOUND,
            "{uri}"
        );
    }

    // System ping is the probe clients use to decide a URL is a Jellyfin
    // server; the body is compared literally.
    let req = test::TestRequest::get().uri("/System/Ping").to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(body, json!("Jellyfin Server"));

    fx.cleanup().await;
}
