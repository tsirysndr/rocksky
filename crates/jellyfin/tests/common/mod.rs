//! Test fixture: a real Postgres, a throwaway schema, and a seeded library.
//!
//! The Jellyfin surface is a thin shell over SQL that the Subsonic crate owns —
//! lateral joins, dedup windows, junction guards. Faking the database would
//! test the shell and nothing underneath it, so these run against a live
//! Postgres and skip when there isn't one.
//!
//! Point `JELLYFIN_TEST_POSTGRES_URL` (or `TEST_POSTGRES_URL`) at a database
//! you don't mind being written to. Each test gets its own schema, seeded from
//! scratch and dropped at the end; a test that panics leaves its schema behind
//! for inspection.

use std::sync::Arc;

use actix_web::web;
use rand::Rng;
use rocksky_jellyfin::state::AppState;
use sqlx::{postgres::PgConnectOptions, ConnectOptions, Pool, Postgres};
use std::str::FromStr;

pub struct Fixture {
    pub pool: Arc<Pool<Postgres>>,
    pub state: web::Data<AppState>,
    /// Suffix mixed into every seeded id.
    ///
    /// The guid mapping is memoised per process and keyed by (kind, native id),
    /// so two tests seeding `tr-1` into different schemas would share one cache
    /// entry and the second one's rows would never be written. Unique ids keep
    /// the tests independent.
    pub tag: String,
    schema: String,
}

pub const HANDLE: &str = "alice.rocksky.app";
pub const API_KEY: &str = "test-api-key";

fn database_url() -> Option<String> {
    for key in [
        "JELLYFIN_TEST_POSTGRES_URL",
        "TEST_POSTGRES_URL",
        "XATA_POSTGRES_URL",
    ] {
        if let Ok(url) = std::env::var(key) {
            if !url.is_empty() {
                return Some(url);
            }
        }
    }
    None
}

/// Set up a fixture, or return `None` when no test database is configured.
///
/// Every test starts with `let Some(fx) = common::setup().await else { return }`
/// so the suite is a no-op offline rather than a wall of failures.
pub async fn setup() -> Option<Fixture> {
    let Some(url) = database_url() else {
        eprintln!(
            "skipping: set JELLYFIN_TEST_POSTGRES_URL to run the Jellyfin API integration tests"
        );
        return None;
    };

    let tag: String = {
        let mut rng = rand::thread_rng();
        (0..8)
            .map(|_| char::from(b'a' + rng.gen_range(0..26)))
            .collect()
    };
    let schema = format!("jellyfin_test_{tag}");

    let mut bootstrap = PgConnectOptions::from_str(&url)
        .expect("invalid test database URL")
        .connect()
        .await
        .expect("could not reach the test database");
    sqlx::query(&format!("CREATE SCHEMA \"{schema}\""))
        .execute(&mut bootstrap)
        .await
        .expect("could not create the test schema");
    drop(bootstrap);

    // Everything the crate runs is unqualified, so the schema is selected on the
    // connection rather than written into the SQL.
    let options = PgConnectOptions::from_str(&url)
        .unwrap()
        .options([("search_path", schema.as_str())]);
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .expect("could not connect to the test schema");

    create_tables(&pool).await;
    seed(&pool, &tag).await;

    rocksky_jellyfin::auth::ensure_tables(&pool).await.unwrap();
    rocksky_jellyfin::guid::ensure_table(&pool).await.unwrap();
    rocksky_jellyfin::userdata::ensure_table(&pool)
        .await
        .unwrap();
    let server_id = rocksky_jellyfin::state::ensure_server_id(&pool)
        .await
        .unwrap();

    let pool = Arc::new(pool);
    let state = web::Data::new(AppState {
        pool: pool.clone(),
        nc: None,
        typesense: Arc::new(None),
        server_id,
        server_name: "Rocksky Test".to_string(),
        host: "127.0.0.1".to_string(),
        port: 8096,
    });

    Some(Fixture {
        pool,
        state,
        tag,
        schema,
    })
}

impl Fixture {
    /// An id in this fixture's namespace, e.g. `id("tr", 1)`.
    pub fn id(&self, prefix: &str, n: u32) -> String {
        format!("{prefix}-{}-{n}", self.tag)
    }

    pub async fn cleanup(self) {
        let schema = self.schema.clone();
        let pool = self.pool.clone();
        drop(self.state);
        let _ = sqlx::query(&format!("DROP SCHEMA IF EXISTS \"{schema}\" CASCADE"))
            .execute(pool.as_ref())
            .await;
    }
}

/// The subset of the Rocksky schema these endpoints read. Column types match
/// production; only the constraints the queries rely on are declared.
async fn create_tables(pool: &Pool<Postgres>) {
    let statements = [
        r#"CREATE TABLE users (
            xata_id TEXT PRIMARY KEY,
            handle TEXT NOT NULL,
            display_name TEXT NOT NULL,
            avatar TEXT,
            did TEXT NOT NULL,
            xata_createdat TIMESTAMPTZ NOT NULL DEFAULT now()
        )"#,
        r#"CREATE TABLE api_keys (
            xata_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            api_key TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE
        )"#,
        r#"CREATE TABLE artists (
            xata_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            picture TEXT,
            genres TEXT[],
            xata_createdat TIMESTAMPTZ NOT NULL DEFAULT now()
        )"#,
        r#"CREATE TABLE albums (
            xata_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            year INTEGER,
            album_art TEXT,
            uri TEXT,
            xata_createdat TIMESTAMPTZ NOT NULL DEFAULT now()
        )"#,
        r#"CREATE TABLE tracks (
            xata_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album_artist TEXT NOT NULL,
            album TEXT NOT NULL,
            album_art TEXT,
            track_number INTEGER,
            disc_number INTEGER,
            duration INTEGER NOT NULL,
            mb_id TEXT,
            genre TEXT,
            xata_createdat TIMESTAMPTZ NOT NULL DEFAULT now()
        )"#,
        r#"CREATE TABLE user_storage_providers (
            xata_id TEXT PRIMARY KEY,
            endpoint TEXT,
            region TEXT,
            bucket TEXT,
            access_key TEXT,
            secret_key TEXT,
            public_url TEXT
        )"#,
        r#"CREATE TABLE user_uploads (
            xata_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            track_id TEXT NOT NULL,
            r2_key TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            sample_rate INTEGER,
            storage_provider_id TEXT,
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )"#,
        r#"CREATE TABLE album_tracks (
            xata_id TEXT PRIMARY KEY,
            album_id TEXT NOT NULL,
            track_id TEXT NOT NULL
        )"#,
        r#"CREATE TABLE artist_tracks (
            xata_id TEXT PRIMARY KEY,
            artist_id TEXT NOT NULL,
            track_id TEXT NOT NULL
        )"#,
        r#"CREATE TABLE artist_albums (
            xata_id TEXT PRIMARY KEY,
            artist_id TEXT NOT NULL,
            album_id TEXT NOT NULL
        )"#,
        r#"CREATE TABLE loved_tracks (
            xata_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id TEXT NOT NULL,
            track_id TEXT NOT NULL,
            xata_createdat TIMESTAMPTZ NOT NULL DEFAULT now()
        )"#,
        r#"CREATE TABLE navidrome_playlists (
            xata_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            user_id TEXT NOT NULL,
            uri TEXT,
            xata_createdat TIMESTAMPTZ NOT NULL DEFAULT now(),
            xata_updatedat TIMESTAMPTZ NOT NULL DEFAULT now()
        )"#,
        r#"CREATE TABLE navidrome_playlist_tracks (
            xata_id TEXT PRIMARY KEY,
            playlist_id TEXT NOT NULL,
            track_id TEXT NOT NULL,
            xata_createdat TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
        )"#,
    ];

    for sql in statements {
        sqlx::query(sql)
            .execute(pool)
            .await
            .unwrap_or_else(|e| panic!("fixture DDL failed: {e}\n{sql}"));
    }
}

/// One user with one artist, one album and one song on it — the smallest
/// library that exercises every join. Tests add to it as they need.
async fn seed(pool: &Pool<Postgres>, tag: &str) {
    let user = format!("us-{tag}");
    sqlx::query(
        "INSERT INTO users (xata_id, handle, display_name, did) VALUES ($1, $2, 'Alice', $3)",
    )
    .bind(&user)
    .bind(HANDLE)
    .bind(format!("did:plc:{tag}"))
    .execute(pool)
    .await
    .unwrap();

    sqlx::query("INSERT INTO api_keys (xata_id, user_id, api_key) VALUES ($1, $2, $3)")
        .bind(format!("ak-{tag}"))
        .bind(&user)
        .bind(API_KEY)
        .execute(pool)
        .await
        .unwrap();

    add_artist(pool, &format!("ar-{tag}-1"), "Test Artist", &[]).await;
    add_album(
        pool,
        &format!("al-{tag}-1"),
        "Test Album",
        "Test Artist",
        2020,
    )
    .await;
    link_artist_album(pool, tag, &format!("ar-{tag}-1"), &format!("al-{tag}-1")).await;
    add_song(
        pool,
        tag,
        &Song {
            id: format!("tr-{tag}-1"),
            title: "Test Song".into(),
            artist: "Test Artist".into(),
            album: "Test Album".into(),
            artist_id: format!("ar-{tag}-1"),
            album_id: format!("al-{tag}-1"),
            genre: None,
            track_number: 1,
            duration_ms: 60_000,
        },
    )
    .await;
}

pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artist_id: String,
    pub album_id: String,
    pub genre: Option<String>,
    pub track_number: i32,
    pub duration_ms: i32,
}

pub async fn add_artist(pool: &Pool<Postgres>, id: &str, name: &str, genres: &[&str]) {
    let genres: Vec<String> = genres.iter().map(|g| g.to_string()).collect();
    sqlx::query("INSERT INTO artists (xata_id, name, picture, genres) VALUES ($1, $2, NULL, $3)")
        .bind(id)
        .bind(name)
        .bind(&genres)
        .execute(pool)
        .await
        .unwrap();
}

pub async fn add_album(pool: &Pool<Postgres>, id: &str, title: &str, artist: &str, year: i32) {
    sqlx::query(
        "INSERT INTO albums (xata_id, title, artist, year, album_art) VALUES ($1, $2, $3, $4, NULL)",
    )
    .bind(id)
    .bind(title)
    .bind(artist)
    .bind(year)
    .execute(pool)
    .await
    .unwrap();
}

pub async fn link_artist_album(pool: &Pool<Postgres>, tag: &str, artist_id: &str, album_id: &str) {
    sqlx::query("INSERT INTO artist_albums (xata_id, artist_id, album_id) VALUES ($1, $2, $3)")
        .bind(format!("aa-{tag}-{artist_id}-{album_id}"))
        .bind(artist_id)
        .bind(album_id)
        .execute(pool)
        .await
        .unwrap();
}

/// Insert a track, an upload of it for the fixture user, and the two junction
/// rows the catalogue joins need. Every listing walks outward from
/// `user_uploads`, so a track with no upload row is invisible by design.
pub async fn add_song(pool: &Pool<Postgres>, tag: &str, song: &Song) {
    sqlx::query(
        r#"INSERT INTO tracks
           (xata_id, title, artist, album_artist, album, album_art, track_number, disc_number,
            duration, genre)
           VALUES ($1, $2, $3, $3, $4, NULL, $5, 1, $6, $7)"#,
    )
    .bind(&song.id)
    .bind(&song.title)
    .bind(&song.artist)
    .bind(&song.album)
    .bind(song.track_number)
    .bind(song.duration_ms)
    .bind(song.genre.as_deref())
    .execute(pool)
    .await
    .unwrap();

    sqlx::query(
        r#"INSERT INTO user_uploads
           (xata_id, user_id, track_id, r2_key, mime_type, file_size, sample_rate)
           VALUES ($1, $2, $3, $4, 'audio/mpeg', 4096, 44100)"#,
    )
    .bind(format!("uu-{}", song.id))
    .bind(format!("us-{tag}"))
    .bind(&song.id)
    .bind(format!("uploads/{}.mp3", song.id))
    .execute(pool)
    .await
    .unwrap();

    sqlx::query("INSERT INTO album_tracks (xata_id, album_id, track_id) VALUES ($1, $2, $3)")
        .bind(format!("at-{}", song.id))
        .bind(&song.album_id)
        .bind(&song.id)
        .execute(pool)
        .await
        .unwrap();

    sqlx::query("INSERT INTO artist_tracks (xata_id, artist_id, track_id) VALUES ($1, $2, $3)")
        .bind(format!("art-{}", song.id))
        .bind(&song.artist_id)
        .bind(&song.id)
        .execute(pool)
        .await
        .unwrap();
}
