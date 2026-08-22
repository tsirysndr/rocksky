//! End-to-end tests: real routes, real DuckDB, real Parquet.
//!
//! Nothing is mocked. Each test generates the fixture catalog, opens it exactly
//! the way `main` does and drives the assembled actix app, so a change that
//! breaks the SQL, the view registration or the JSON shape fails here.

use actix_web::{http::StatusCode, test, web, App};
use riff::{db, fixtures, ratelimit, routes};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

// Fixture ids, spelled out so a test reads as the request someone would type.
const ASH_MERIDIAN: &str = "riffart000000000000001";
const KOVA_LUNE: &str = "riffart000000000000002";
const MARISOL_VEGA: &str = "riffart000000000000004";
const ODESSA_GREY: &str = "riffart000000000000006";
const VARIOUS_ARTISTS: &str = "riffart000000000000007";

const LOW_COUNTRY: &str = "riffalb000000000000001";
const NEON_TIDE: &str = "riffalb000000000000003";
const LAST_BUS_HOME: &str = "riffalb000000000000008";
const GREY_MATTER: &str = "riffalb000000000000009";
const SAMPLER: &str = "riffalb000000000000010";

/// "Neon Tide", track 1 of the album of the same name.
const TRACK_NEON_TIDE: &str = "rifftrk000000000000010";
/// "Slow Signal (feat. Marisol Vega)" — two credited artists.
const TRACK_SLOW_SIGNAL: &str = "rifftrk000000000000014";
/// Sampler track credited to Odessa Grey, and the one row with null_response=1.
const TRACK_NO_FEATURES: &str = "rifftrk000000000000040";

/// The fixture catalog is generated once for the whole test binary; the tests
/// only read it.
fn data_dir() -> &'static Path {
    static DIR: OnceLock<tempfile::TempDir> = OnceLock::new();
    DIR.get_or_init(|| {
        let dir = tempfile::tempdir().expect("tempdir");
        fixtures::generate(dir.path()).expect("generate fixtures");
        dir
    })
    .path()
}

fn settings(dir: PathBuf) -> db::Settings {
    db::Settings {
        data_dir: dir,
        db_path: None,
        pool_size: 4,
        pool_timeout: std::time::Duration::from_secs(5),
    }
}

/// Issues a GET against a freshly assembled app and returns status + JSON.
///
/// The app is rebuilt per call rather than shared: it keeps every test
/// independent, and opening an in-memory DuckDB over ten tiny Parquet files
/// costs milliseconds.
async fn get_in(dir: &Path, uri: &str) -> (StatusCode, Value) {
    let (catalog, _) = db::open(&settings(dir.to_path_buf())).expect("open catalog");
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(catalog))
            .configure(routes::configure),
    )
    .await;
    let res = test::call_service(&app, test::TestRequest::get().uri(uri).to_request()).await;
    let status = res.status();
    let bytes = test::read_body(res).await;
    let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, json)
}

async fn get(uri: &str) -> (StatusCode, Value) {
    get_in(data_dir(), uri).await
}

async fn get_ok(uri: &str) -> Value {
    let (status, body) = get(uri).await;
    assert_eq!(status, StatusCode::OK, "GET {uri} -> {body}");
    body
}

async fn get_text(uri: &str) -> (StatusCode, String, String) {
    let (catalog, _) = db::open(&settings(data_dir().to_path_buf())).expect("open catalog");
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(catalog))
            .configure(routes::configure),
    )
    .await;
    let res = test::call_service(&app, test::TestRequest::get().uri(uri).to_request()).await;
    let status = res.status();
    let content_type = res
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let body = String::from_utf8(test::read_body(res).await.to_vec()).unwrap();
    (status, content_type, body)
}

fn names(items: &Value) -> Vec<String> {
    items
        .as_array()
        .expect("array")
        .iter()
        .map(|i| i["name"].as_str().unwrap_or("<null>").to_string())
        .collect()
}

// ------------------------------------------------------------------- index

#[actix_web::test]
async fn index_serves_the_banner_and_the_endpoint_list() {
    let (status, content_type, body) = get_text("/").await;
    assert_eq!(status, StatusCode::OK);
    assert!(content_type.starts_with("text/plain"), "{content_type}");

    assert!(body.contains('█'), "expected ASCII art, got:\n{body}");
    assert!(body.contains("WHAT THIS IS"));
    assert!(body.contains("SPOTIFY_API_URL"));

    for endpoint in [
        "/v1/search",
        "/v1/artists/{id}",
        "/v1/artists/{id}/albums",
        "/v1/artists/{id}/top-tracks",
        "/v1/albums/{id}",
        "/v1/albums/{id}/tracks",
        "/v1/tracks/{id}",
        "/v1/audio-features/{id}",
    ] {
        assert!(body.contains(endpoint), "index is missing {endpoint}");
    }
}

#[actix_web::test]
async fn health_reports_ok() {
    let body = get_ok("/health").await;
    assert_eq!(body["status"], "ok");
}

// ----------------------------------------------------------------- artists

#[actix_web::test]
async fn artist_has_the_full_spotify_shape() {
    let a = get_ok(&format!("/v1/artists/{ASH_MERIDIAN}")).await;
    assert_eq!(a["id"], ASH_MERIDIAN);
    assert_eq!(a["name"], "Ash Meridian");
    assert_eq!(a["type"], "artist");
    assert_eq!(a["uri"], format!("spotify:artist:{ASH_MERIDIAN}"));
    assert_eq!(
        a["href"],
        format!("https://api.spotify.com/v1/artists/{ASH_MERIDIAN}")
    );
    assert_eq!(
        a["external_urls"]["spotify"],
        format!("https://open.spotify.com/artist/{ASH_MERIDIAN}")
    );
    assert_eq!(a["followers"]["total"], 812450);
    assert_eq!(a["popularity"], 71);

    // Genres come from artist_genres.parquet.
    let genres: Vec<&str> = a["genres"]
        .as_array()
        .unwrap()
        .iter()
        .map(|g| g.as_str().unwrap())
        .collect();
    assert_eq!(genres, vec!["chamber pop", "indie rock"]);

    // Images are widest-first; clients take images[0] as "the" picture.
    let images = a["images"].as_array().unwrap();
    assert_eq!(images.len(), 3);
    assert_eq!(images[0]["width"], 640);
    assert_eq!(images[2]["width"], 160);
}

#[actix_web::test]
async fn unknown_artist_is_a_spotify_shaped_404() {
    let (status, body) = get("/v1/artists/riffartdoesnotexist01").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"]["status"], 404);
    assert!(body["error"]["message"].is_string());
}

#[actix_web::test]
async fn several_artists_keep_null_holes_aligned_with_the_request() {
    let body = get_ok(&format!(
        "/v1/artists?ids={ASH_MERIDIAN},riffartdoesnotexist01,{KOVA_LUNE}"
    ))
    .await;
    let artists = body["artists"].as_array().unwrap();
    assert_eq!(artists.len(), 3);
    assert_eq!(artists[0]["name"], "Ash Meridian");
    // A miss is a null in place, not a shorter array — callers index positionally.
    assert!(artists[1].is_null());
    assert_eq!(artists[2]["name"], "Kova Lune");
}

#[actix_web::test]
async fn too_many_ids_is_rejected() {
    let ids = vec![ASH_MERIDIAN; 51].join(",");
    let (status, body) = get(&format!("/v1/artists?ids={ids}")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["status"], 400);
}

#[actix_web::test]
async fn missing_ids_parameter_is_rejected() {
    let (status, _) = get("/v1/artists?ids=").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[actix_web::test]
async fn artist_albums_are_newest_first_and_carry_album_group() {
    let body = get_ok(&format!("/v1/artists/{ASH_MERIDIAN}/albums")).await;

    // With no include_groups, Spotify returns every group — so the sampler the
    // artist merely appears on is in here alongside their own two albums.
    assert_eq!(body["total"], 3);
    assert_eq!(
        names(&body["items"]),
        vec!["Riff Sampler Vol. 1", "Hollow Season", "Low Country"],
        "albums must be newest-first by release date"
    );

    let groups: Vec<&str> = body["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["album_group"].as_str().unwrap())
        .collect();
    assert_eq!(groups, vec!["appears_on", "album", "album"]);
    assert_eq!(body["items"][1]["album_type"], "album");
}

#[actix_web::test]
async fn appears_on_is_a_relationship_not_an_album_type() {
    let body = get_ok(&format!(
        "/v1/artists/{ASH_MERIDIAN}/albums?include_groups=appears_on"
    ))
    .await;
    assert_eq!(body["total"], 1);
    let sampler = &body["items"][0];
    assert_eq!(sampler["id"], SAMPLER);
    // Grouped appears_on, even though the album is itself a compilation.
    assert_eq!(sampler["album_group"], "appears_on");
    assert_eq!(sampler["album_type"], "compilation");
}

#[actix_web::test]
async fn include_groups_filters_by_group() {
    let body = get_ok(&format!(
        "/v1/artists/{KOVA_LUNE}/albums?include_groups=single"
    ))
    .await;
    assert_eq!(names(&body["items"]), vec!["Neon Tide (Remixes)"]);
}

#[actix_web::test]
async fn top_tracks_are_ranked_by_popularity() {
    let body = get_ok(&format!("/v1/artists/{MARISOL_VEGA}/top-tracks")).await;
    let tracks = body["tracks"].as_array().unwrap();
    assert!(!tracks.is_empty());
    assert!(tracks.len() <= 10, "Spotify caps top-tracks at 10");

    let pops: Vec<i64> = tracks
        .iter()
        .map(|t| t["popularity"].as_i64().unwrap())
        .collect();
    let mut sorted = pops.clone();
    sorted.sort_unstable_by(|a, b| b.cmp(a));
    assert_eq!(pops, sorted, "top-tracks must be descending by popularity");
}

// ------------------------------------------------------------------ albums

#[actix_web::test]
async fn album_embeds_its_first_page_of_tracks() {
    let a = get_ok(&format!("/v1/albums/{NEON_TIDE}")).await;
    assert_eq!(a["name"], "Neon Tide");
    assert_eq!(a["type"], "album");
    assert_eq!(a["label"], "Halcyon Recordings");
    assert_eq!(a["total_tracks"], 6);
    assert_eq!(a["external_ids"]["upc"], "00602537000035");
    assert_eq!(a["external_ids"]["amgid"], "R  1889321");
    assert_eq!(names(&a["artists"]), vec!["Kova Lune"]);

    let copyrights = a["copyrights"].as_array().unwrap();
    assert_eq!(copyrights.len(), 2);
    assert_eq!(copyrights[0]["type"], "C");
    assert_eq!(copyrights[1]["type"], "P");

    let tracks = &a["tracks"];
    assert_eq!(tracks["total"], 6);
    assert_eq!(tracks["items"].as_array().unwrap().len(), 6);
    assert_eq!(tracks["items"][0]["name"], "Neon Tide");
    assert_eq!(tracks["items"][0]["track_number"], 1);
}

#[actix_web::test]
async fn album_without_copyright_or_upc_omits_them_cleanly() {
    let a = get_ok(&format!("/v1/albums/{LAST_BUS_HOME}")).await;
    // Empty array rather than entries with null text.
    assert_eq!(a["copyrights"].as_array().unwrap().len(), 0);
    // Absent external ids are omitted, exactly as Spotify does.
    assert!(a["external_ids"].get("upc").is_none());
    assert_eq!(a["label"], "Nightbus Collective");
}

#[actix_web::test]
async fn year_only_release_dates_are_reported_as_such() {
    let a = get_ok(&format!("/v1/albums/{GREY_MATTER}")).await;
    assert_eq!(a["release_date"], "2018");
    assert_eq!(a["release_date_precision"], "year");
}

#[actix_web::test]
async fn available_markets_are_expanded_from_the_shared_row() {
    let wide = get_ok(&format!("/v1/albums/{NEON_TIDE}")).await;
    let markets: Vec<&str> = wide["available_markets"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m.as_str().unwrap())
        .collect();
    assert!(markets.contains(&"US"));
    assert!(markets.contains(&"JP"));
    assert_eq!(markets.len(), 14);

    let narrow = get_ok(&format!("/v1/albums/{LAST_BUS_HOME}")).await;
    assert_eq!(narrow["available_markets"], serde_json::json!(["CA", "US"]));
}

#[actix_web::test]
async fn album_tracks_page_correctly() {
    let body = get_ok(&format!("/v1/albums/{NEON_TIDE}/tracks?limit=2&offset=2")).await;
    assert_eq!(body["total"], 6);
    assert_eq!(body["limit"], 2);
    assert_eq!(body["offset"], 2);
    assert_eq!(names(&body["items"]), vec!["Glasshouse", "Afterimage"]);
    assert!(body["next"].is_string(), "a third page exists");
    assert!(body["previous"].is_string(), "offset 2 has a previous page");

    let last = get_ok(&format!("/v1/albums/{NEON_TIDE}/tracks?limit=2&offset=4")).await;
    assert!(last["next"].is_null(), "no page past the end");
}

#[actix_web::test]
async fn compilation_credits_various_artists_as_the_album_artist() {
    let a = get_ok(&format!("/v1/albums/{SAMPLER}")).await;
    assert_eq!(a["album_type"], "compilation");
    // The four appears_on artists must not leak into album.artists.
    assert_eq!(names(&a["artists"]), vec!["Various Artists"]);
    assert_eq!(a["artists"][0]["id"], VARIOUS_ARTISTS);
}

// ------------------------------------------------------------------ tracks

#[actix_web::test]
async fn track_has_the_full_spotify_shape() {
    let t = get_ok(&format!("/v1/tracks/{TRACK_NEON_TIDE}")).await;
    assert_eq!(t["id"], TRACK_NEON_TIDE);
    assert_eq!(t["name"], "Neon Tide");
    assert_eq!(t["type"], "track");
    assert_eq!(t["is_local"], false);
    assert_eq!(t["track_number"], 1);
    assert_eq!(t["disc_number"], 1);
    assert_eq!(t["explicit"], false);
    assert!(t["duration_ms"].as_i64().unwrap() > 0);
    assert!(t["external_ids"]["isrc"].is_string());
    assert_eq!(names(&t["artists"]), vec!["Kova Lune"]);

    // The nested album is a simplified album: it has artists and images, and no
    // nested tracks list.
    assert_eq!(t["album"]["id"], NEON_TIDE);
    assert_eq!(t["album"]["name"], "Neon Tide");
    assert!(t["album"].get("tracks").is_none());
    assert_eq!(t["album"]["images"].as_array().unwrap().len(), 3);
}

#[actix_web::test]
async fn explicit_flag_is_a_bool_not_an_integer() {
    // "Undertow" is the explicit=1 row in the fixtures.
    let body = get_ok("/v1/search?type=track&q=track:%22Undertow%22").await;
    let t = &body["tracks"]["items"][0];
    assert_eq!(t["name"], "Undertow");
    assert_eq!(t["explicit"], true);
}

#[actix_web::test]
async fn featured_artists_are_credited_on_the_track() {
    let t = get_ok(&format!("/v1/tracks/{TRACK_SLOW_SIGNAL}")).await;
    assert_eq!(t["name"], "Slow Signal (feat. Marisol Vega)");
    // Primary artist first, feature second — index_in_track ordering.
    assert_eq!(names(&t["artists"]), vec!["Kova Lune", "Marisol Vega"]);
}

#[actix_web::test]
async fn compilation_tracks_credit_the_original_artist() {
    let t = get_ok(&format!("/v1/tracks/{TRACK_NO_FEATURES}")).await;
    assert_eq!(t["album"]["id"], SAMPLER);
    // The track is by Odessa Grey even though the album is Various Artists.
    assert_eq!(names(&t["artists"]), vec!["Odessa Grey"]);
    assert_eq!(t["artists"][0]["id"], ODESSA_GREY);
}

#[actix_web::test]
async fn several_tracks_resolve_in_one_request() {
    let body = get_ok(&format!(
        "/v1/tracks?ids={TRACK_NEON_TIDE},{TRACK_SLOW_SIGNAL}"
    ))
    .await;
    assert_eq!(
        names(&body["tracks"]),
        vec!["Neon Tide", "Slow Signal (feat. Marisol Vega)"]
    );
}

// ---------------------------------------------------------- audio features

#[actix_web::test]
async fn audio_features_are_numbers_not_the_strings_stored_in_parquet() {
    let f = get_ok(&format!("/v1/audio-features/{TRACK_NEON_TIDE}")).await;
    assert_eq!(f["id"], TRACK_NEON_TIDE);
    assert_eq!(f["type"], "audio_features");
    assert_eq!(f["uri"], format!("spotify:track:{TRACK_NEON_TIDE}"));

    // Every column is VARCHAR in the source; riff must hand back real JSON
    // numbers or clients doing arithmetic on them break.
    for field in [
        "danceability",
        "energy",
        "valence",
        "tempo",
        "acousticness",
        "instrumentalness",
        "liveness",
        "speechiness",
        "loudness",
    ] {
        assert!(
            f[field].is_number(),
            "{field} should be a number, got {}",
            f[field]
        );
    }
    for field in ["key", "mode", "time_signature", "duration_ms"] {
        assert!(
            f[field].is_i64(),
            "{field} should be an integer, got {}",
            f[field]
        );
    }

    let d = f["danceability"].as_f64().unwrap();
    assert!((0.0..=1.0).contains(&d), "danceability out of range: {d}");
    assert!(f["loudness"].as_f64().unwrap() < 0.0);
}

#[actix_web::test]
async fn a_track_with_null_response_has_no_features() {
    // null_response = '1' means Spotify itself had no analysis. Answering 404
    // is honest; answering a row of zeroes would not be.
    let (status, _) = get(&format!("/v1/audio-features/{TRACK_NO_FEATURES}")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn batch_audio_features_keep_nulls_in_place() {
    let body = get_ok(&format!(
        "/v1/audio-features?ids={TRACK_NEON_TIDE},{TRACK_NO_FEATURES},{TRACK_SLOW_SIGNAL}"
    ))
    .await;
    let f = body["audio_features"].as_array().unwrap();
    assert_eq!(f.len(), 3);
    assert_eq!(f[0]["id"], TRACK_NEON_TIDE);
    assert!(f[1].is_null(), "null_response track must serialize as null");
    assert_eq!(f[2]["id"], TRACK_SLOW_SIGNAL);
}

// ------------------------------------------------------------------ search

#[actix_web::test]
async fn search_understands_the_field_filters_match_song_sends() {
    // Verbatim the shape apps/api builds: track:"..." artist:"..."
    let body =
        get_ok("/v1/search?type=track&q=track:%22Neon%20Tide%22%20artist:%22Kova%20Lune%22").await;
    let items = body["tracks"]["items"].as_array().unwrap();
    assert!(!items.is_empty(), "field-filter search found nothing");
    assert_eq!(items[0]["name"], "Neon Tide");
    assert_eq!(names(&items[0]["artists"]), vec!["Kova Lune"]);
}

#[actix_web::test]
async fn search_artist_filter_excludes_other_artists() {
    // "Vega" is a track on Salt & Static and on the sampler; constraining the
    // artist must not return Ash Meridian material.
    let body =
        get_ok("/v1/search?type=track&q=track:%22Vega%22%20artist:%22Marisol%20Vega%22").await;
    let items = body["tracks"]["items"].as_array().unwrap();
    assert!(!items.is_empty());
    for t in items {
        assert!(
            names(&t["artists"]).contains(&"Marisol Vega".to_string()),
            "unexpected artist in {t}"
        );
    }
}

#[actix_web::test]
async fn search_ranks_an_exact_title_first() {
    // "Low Country" is both an album title and a track on it; the exact title
    // match must outrank the other tracks of that album.
    let body = get_ok("/v1/search?type=track&q=track:%22Low%20Country%22").await;
    assert_eq!(body["tracks"]["items"][0]["name"], "Low Country");
}

#[actix_web::test]
async fn free_text_matches_title_artist_or_album() {
    // Free text matches exactly (case-insensitive): a full artist name finds
    // that artist's tracks.
    let by_artist = get_ok("/v1/search?type=track&q=%22nightbus%20choir%22").await;
    let items = by_artist["tracks"]["items"].as_array().unwrap();
    assert!(
        !items.is_empty(),
        "a full artist name should match that artist's tracks"
    );
    for t in items {
        assert_eq!(names(&t["artists"]), vec!["Nightbus Choir"]);
    }
}

/// Search is exact-match by design: substring matching over the production
/// tracks relation is a 23G scan per query, which is the outage this replaced.
/// A fuzzy query returns nothing here — and the Spotify proxy treats an empty
/// riff result as "fall back to Spotify", whose fuzzy search is better anyway.
#[actix_web::test]
async fn partial_names_do_not_match() {
    let body = get_ok("/v1/search?type=track,artist,album&q=Nightbus").await;
    assert_eq!(body["tracks"]["items"].as_array().unwrap().len(), 0);
    assert_eq!(body["artists"]["items"].as_array().unwrap().len(), 0);
    assert_eq!(body["albums"]["items"].as_array().unwrap().len(), 0);
}

#[actix_web::test]
async fn search_returns_only_the_requested_types() {
    let body = get_ok("/v1/search?type=artist&q=%22kova%20lune%22").await;
    assert!(body.get("artists").is_some());
    assert!(body.get("tracks").is_none());
    assert!(body.get("albums").is_none());
    assert_eq!(body["artists"]["items"][0]["name"], "Kova Lune");
}

#[actix_web::test]
async fn search_can_return_several_types_at_once() {
    let body = get_ok("/v1/search?type=artist,album&q=%22Neon%20Tide%22").await;
    assert!(body.get("artists").is_some());
    assert!(body.get("albums").is_some());
    assert!(body.get("tracks").is_none());
    // Exact match: the album named exactly "Neon Tide", not the remix EP.
    assert_eq!(names(&body["albums"]["items"]), vec!["Neon Tide"]);
}

#[actix_web::test]
async fn search_supports_the_isrc_filter() {
    let track = get_ok(&format!("/v1/tracks/{TRACK_NEON_TIDE}")).await;
    let isrc = track["external_ids"]["isrc"].as_str().unwrap().to_string();
    let body = get_ok(&format!("/v1/search?type=track&q=isrc:{isrc}")).await;
    assert_eq!(body["tracks"]["items"][0]["id"], TRACK_NEON_TIDE);
}

#[actix_web::test]
async fn search_supports_year_filters() {
    let single = get_ok("/v1/search?type=album&q=year:2019").await;
    assert_eq!(names(&single["albums"]["items"]), vec!["Low Country"]);

    let range = get_ok("/v1/search?type=album&q=year:2017-2019").await;
    let found = names(&range["albums"]["items"]);
    assert!(found.contains(&"Low Country".to_string()));
    assert!(found.contains(&"Paper Tigers".to_string()));
    assert!(found.contains(&"Grey Matter".to_string()));
    assert!(!found.contains(&"Salt & Static".to_string()), "2023 album");
}

#[actix_web::test]
async fn search_supports_the_genre_filter() {
    let body = get_ok("/v1/search?type=artist&q=genre:synthwave").await;
    assert_eq!(names(&body["artists"]["items"]), vec!["Kova Lune"]);
}

#[actix_web::test]
async fn search_without_a_query_is_rejected() {
    let (status, body) = get("/v1/search?type=track").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["status"], 400);

    let (status, _) = get("/v1/search?type=track&q=%20%20").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[actix_web::test]
async fn search_rejects_an_unknown_type() {
    let (status, _) = get("/v1/search?type=podcast&q=anything").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[actix_web::test]
async fn search_refuses_to_page_past_the_window() {
    let (status, _) = get("/v1/search?type=track&q=a&limit=50&offset=1000").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[actix_web::test]
async fn search_terms_with_like_wildcards_are_literal() {
    // '%' compares as the literal character under exact matching.
    let body = get_ok("/v1/search?type=track&q=track:%22%25%22").await;
    assert_eq!(body["tracks"]["items"].as_array().unwrap().len(), 0);
    assert_eq!(body["tracks"]["total"], 0);
}

#[actix_web::test]
async fn search_paging_reports_a_next_link() {
    // "Vega" is an exact track title on Salt & Static and on the sampler.
    let body = get_ok("/v1/search?type=track&q=track:%22Vega%22&limit=1").await;
    assert!(body["tracks"]["total"].as_i64().unwrap() > 1);
    assert!(body["tracks"]["next"].is_string());
    assert!(body["tracks"]["previous"].is_null());
    assert!(body["tracks"]["href"]
        .as_str()
        .unwrap()
        .contains("/search?q="));
}

// ------------------------------------------------- degraded / partial dumps

/// Copies the fixture catalog minus the named files, to stand in for a dump
/// that does not carry every optional relation.
fn catalog_without(skip: &[&str]) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    for entry in std::fs::read_dir(data_dir()).unwrap() {
        let entry = entry.unwrap();
        let name = entry.file_name().to_string_lossy().to_string();
        if skip.iter().any(|s| name == format!("{s}.parquet")) {
            continue;
        }
        std::fs::copy(entry.path(), dir.path().join(&name)).unwrap();
    }
    dir
}

#[actix_web::test]
async fn track_artists_fall_back_to_album_artists_when_the_file_is_absent() {
    // Production may not ship track_artists.parquet; a track must still name its
    // artist, derived from the album's own artists.
    let dir = catalog_without(&["track_artists"]);
    let (status, t) = get_in(dir.path(), &format!("/v1/tracks/{TRACK_NEON_TIDE}")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(names(&t["artists"]), vec!["Kova Lune"]);

    // What the fallback cannot recover is the per-track feature credit.
    let (_, feat) = get_in(dir.path(), &format!("/v1/tracks/{TRACK_SLOW_SIGNAL}")).await;
    assert_eq!(names(&feat["artists"]), vec!["Kova Lune"]);
}

#[actix_web::test]
async fn a_missing_optional_relation_degrades_to_empty() {
    let dir = catalog_without(&["artist_genres", "artist_images"]);
    let (status, a) = get_in(dir.path(), &format!("/v1/artists/{ASH_MERIDIAN}")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(a["genres"], serde_json::json!([]));
    assert_eq!(a["images"], serde_json::json!([]));
    // The artist itself is still fully served.
    assert_eq!(a["name"], "Ash Meridian");
}

#[actix_web::test]
async fn a_missing_available_markets_file_yields_an_empty_list() {
    let dir = catalog_without(&["available_markets"]);
    let (status, a) = get_in(dir.path(), &format!("/v1/albums/{LOW_COUNTRY}")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(a["available_markets"], serde_json::json!([]));
}

#[actix_web::test]
async fn a_missing_required_relation_fails_at_startup_with_the_file_named() {
    let dir = catalog_without(&["tracks"]);
    let err = db::open(&settings(dir.path().to_path_buf()))
        .err()
        .expect("expected startup to fail");
    assert!(err.contains("tracks.parquet"), "unhelpful error: {err}");
}

#[actix_web::test]
async fn a_schema_drift_is_reported_against_the_offending_table() {
    let dir = catalog_without(&["artists"]);
    // Stand in a file with the right name and the wrong columns.
    let conn = duckdb::Connection::open_in_memory().unwrap();
    conn.execute_batch(&format!(
        "COPY (SELECT 1 AS unexpected) TO '{}' (FORMAT PARQUET)",
        dir.path().join("artists.parquet").display()
    ))
    .unwrap();

    let err = db::open(&settings(dir.path().to_path_buf()))
        .err()
        .expect("expected startup to fail");
    assert!(
        err.contains("artists.parquet") && err.contains("schema"),
        "unhelpful error: {err}"
    );
}

// ------------------------------------------------------------ rate limiting

/// Builds the app with the limiter in front, trusting `X-Forwarded-For` so a
/// test can present an arbitrary client IP.
async fn limited_get(uri: &str, forwarded_for: &str, times: usize) -> Vec<StatusCode> {
    let (catalog, _) = db::open(&settings(data_dir().to_path_buf())).unwrap();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(catalog))
            .wrap(ratelimit::RateLimit::new(ratelimit::Config {
                rps: 1.0,
                burst: 3.0,
                trust_proxy: true,
            }))
            .configure(routes::configure),
    )
    .await;

    let mut out = Vec::with_capacity(times);
    for _ in 0..times {
        let req = test::TestRequest::get()
            .uri(uri)
            .insert_header(("x-forwarded-for", forwarded_for.to_string()))
            .to_request();
        out.push(test::call_service(&app, req).await.status());
    }
    out
}

#[actix_web::test]
async fn localhost_is_never_rate_limited() {
    for ip in ["127.0.0.1", "::1", "::ffff:127.0.0.1"] {
        let statuses = limited_get("/health", ip, 50).await;
        assert!(
            statuses.iter().all(|s| *s == StatusCode::OK),
            "{ip} was rate limited: {statuses:?}"
        );
    }
}

#[actix_web::test]
async fn a_remote_ip_is_limited_once_it_burns_its_burst() {
    let statuses = limited_get("/health", "203.0.113.7", 10).await;
    assert_eq!(
        statuses[..3].to_vec(),
        vec![StatusCode::OK; 3],
        "burst of 3 allowed"
    );
    assert!(
        statuses.contains(&StatusCode::TOO_MANY_REQUESTS),
        "expected a 429 after the burst: {statuses:?}"
    );
}

#[actix_web::test]
async fn a_rate_limited_response_is_spotify_shaped() {
    let (catalog, _) = db::open(&settings(data_dir().to_path_buf())).unwrap();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(catalog))
            .wrap(ratelimit::RateLimit::new(ratelimit::Config {
                rps: 1.0,
                burst: 1.0,
                trust_proxy: true,
            }))
            .configure(routes::configure),
    )
    .await;

    let req = || {
        test::TestRequest::get()
            .uri("/health")
            .insert_header(("x-forwarded-for", "203.0.113.9"))
            .to_request()
    };
    assert_eq!(
        test::call_service(&app, req()).await.status(),
        StatusCode::OK
    );

    let res = test::call_service(&app, req()).await;
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(
        res.headers().contains_key("retry-after"),
        "a 429 must tell the caller when to come back"
    );
    let body: Value = serde_json::from_slice(&test::read_body(res).await).unwrap();
    assert_eq!(body["error"]["status"], 429);
}

// --------------------------------------------------------- materialized mode

/// The production path: lookup tables materialized into a DuckDB file, base
/// relations still parquet. Every answer must be identical to parquet mode.
#[actix_web::test]
async fn a_materialized_db_serves_the_same_answers() {
    let db_dir = tempfile::tempdir().unwrap();
    let db_path = db_dir.path().join("riff.duckdb");
    db::materialize(data_dir(), &db_path, |_| {}).expect("materialize");

    let mut cfg = settings(data_dir().to_path_buf());
    cfg.db_path = Some(db_path);
    let (catalog, report) = db::open(&cfg).expect("open materialized");
    assert!(
        report.iter().any(|l| l.contains("materialized")),
        "startup report should say lookups are materialized: {report:?}"
    );

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(catalog))
            .configure(routes::configure),
    )
    .await;
    let get = |uri: &'static str| {
        let app = &app;
        async move {
            let res = test::call_service(app, test::TestRequest::get().uri(uri).to_request()).await;
            let status = res.status();
            let body: Value = serde_json::from_slice(&test::read_body(res).await).unwrap();
            (status, body)
        }
    };

    // Search through the materialized name map.
    let (status, body) =
        get("/v1/search?type=track&q=track:%22Neon%20Tide%22%20artist:%22Kova%20Lune%22").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["tracks"]["items"][0]["name"], "Neon Tide");

    // Id lookup through the materialized id map.
    let (status, t) = get("/v1/tracks/rifftrk000000000000014").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(names(&t["artists"]), vec!["Kova Lune", "Marisol Vega"]);

    // Audio features through the sorted copy, numbers restored.
    let (status, f) = get("/v1/audio-features/rifftrk000000000000010").await;
    assert_eq!(status, StatusCode::OK);
    assert!(f["danceability"].is_number());

    // Artist albums through artist_albums_expanded.
    let (status, page) = get("/v1/artists/riffart000000000000001/albums").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(page["total"], 3);

    // Top tracks through track_artists_by_artist.
    let (status, top) = get("/v1/artists/riffart000000000000004/top-tracks").await;
    assert_eq!(status, StatusCode::OK);
    assert!(!top["tracks"].as_array().unwrap().is_empty());
}

/// Rerunning the materializer must swap tables in place, not fail on the
/// leftovers of the previous run.
#[actix_web::test]
async fn materializing_twice_is_idempotent() {
    let db_dir = tempfile::tempdir().unwrap();
    let db_path = db_dir.path().join("riff.duckdb");
    db::materialize(data_dir(), &db_path, |_| {}).expect("first run");
    db::materialize(data_dir(), &db_path, |_| {}).expect("second run");

    let mut cfg = settings(data_dir().to_path_buf());
    cfg.db_path = Some(db_path);
    db::open(&cfg).expect("open after rebuild");
}
