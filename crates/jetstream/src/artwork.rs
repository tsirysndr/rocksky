//! Resolve covers against the exact release before indexing an AT record.
use crate::schema::{Albums, Tracks};
use crate::subscriber::{ALBUM_NSID, SCROBBLE_NSID, SONG_NSID};
use rocksky_db::Backend;
use sea_query::{Cond, Expr, Func, Query, UnionType};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    num::NonZeroUsize,
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

const CDN: &str = "https://i.scdn.co/image/";
fn spotify(url: &str) -> bool {
    url.strip_prefix(CDN)
        .is_some_and(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_hexdigit()))
}

pub struct Release {
    album: String,
    artist: String,
    album_hash: String,
    track_hash: Option<String>,
    spotify_path: Option<String>,
}

impl Release {
    pub fn from_record(collection: &str, r: &Value) -> Option<Self> {
        let title = r["title"].as_str()?;
        let performer = r["artist"].as_str()?;
        let (album, artist, track_hash) = match collection {
            ALBUM_NSID => (title, performer, None),
            SONG_NSID | SCROBBLE_NSID => {
                let album = r["album"].as_str()?;
                (
                    album,
                    r["albumArtist"].as_str()?,
                    Some(sha256::digest(
                        format!("{title} - {performer} - {album}").to_lowercase(),
                    )),
                )
            }
            _ => return None,
        };
        if album.trim().is_empty() || artist.trim().is_empty() {
            return None;
        }
        Some(Self {
            album: album.to_owned(),
            artist: artist.to_owned(),
            album_hash: sha256::digest(format!("{album} - {artist}").to_lowercase()),
            track_hash,
            spotify_path: r["spotifyLink"]
                .as_str()
                .and_then(|s| spotify_path(s, collection)),
        })
    }

    pub async fn cover(
        &self,
        db: &Backend,
        incoming: Option<&str>,
    ) -> anyhow::Result<Option<String>> {
        if let Some(url) = incoming.filter(|s| spotify(s)) {
            return Ok(Some(url.to_owned()));
        }
        let mut query = Query::select()
            .column(Albums::AlbumArt)
            .from(Albums::Table)
            .and_where(Expr::col(Albums::Sha256).eq(&self.album_hash))
            .and_where(Expr::col(Albums::AlbumArt).like(format!("{CDN}%")))
            .take();
        if let Some(hash) = &self.track_hash {
            query.union(
                UnionType::All,
                Query::select()
                    .column(Tracks::AlbumArt)
                    .from(Tracks::Table)
                    .and_where(Expr::col(Tracks::Sha256).eq(hash))
                    .and_where(
                        Expr::expr(Func::lower(Expr::col(Tracks::AlbumArtist)))
                            .eq(self.artist.to_lowercase()),
                    )
                    .and_where(Expr::col(Tracks::AlbumArt).like(format!("{CDN}%")))
                    .take(),
            );
        }
        let stored: Option<String> = db.fetch_scalar(&query).await?;
        if let Some(url) = stored.filter(|s| spotify(s)) {
            return Ok(Some(url));
        }
        let siblings: Vec<(String,)> = db
            .fetch_all(
                &Query::select()
                    .distinct()
                    .column(Tracks::AlbumArt)
                    .from(Tracks::Table)
                    .cond_where(self.track_release())
                    .and_where(Expr::col(Tracks::AlbumArt).like(format!("{CDN}%")))
                    .limit(2)
                    .take(),
            )
            .await?;
        if let [(url,)] = siblings.as_slice() {
            if spotify(url) {
                return Ok(Some(url.clone()));
            }
        }
        Ok(self.lookup().await)
    }

    fn track_release(&self) -> Cond {
        Cond::all()
            .add(
                Expr::expr(Func::lower(Expr::col(Tracks::AlbumArtist)))
                    .eq(self.artist.to_lowercase()),
            )
            .add(Expr::expr(Func::lower(Expr::col(Tracks::Album))).eq(self.album.to_lowercase()))
    }

    async fn lookup(&self) -> Option<String> {
        type Cache = lru::LruCache<String, (Instant, Option<String>)>;
        static CACHE: LazyLock<Mutex<Cache>> =
            LazyLock::new(|| Mutex::new(Cache::new(NonZeroUsize::new(8192).unwrap())));
        static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
            reqwest::Client::builder()
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap()
        });
        let key = format!(
            "{}:{}",
            self.album_hash,
            self.spotify_path.as_deref().unwrap_or("")
        );
        if let Some((at, cover)) = CACHE.lock().unwrap().get(&key) {
            if at.elapsed() < Duration::from_secs(3600) {
                return cover.clone();
            }
        }
        let base =
            std::env::var("RIFF_API_URL").unwrap_or_else(|_| "http://127.0.0.1:8092/v1".into());
        let base = base.trim_end_matches('/');
        if let Some(path) = &self.spotify_path {
            if let Ok(response) = CLIENT.get(format!("{base}/{path}")).send().await {
                if let Ok(item) = response.json::<Value>().await {
                    let release = if path.starts_with("tracks/") {
                        &item["album"]
                    } else {
                        &item
                    };
                    if let Some(cover) = unique_cover(
                        &serde_json::json!({"items":[release]}),
                        &self.album,
                        &self.artist,
                    ) {
                        CACHE
                            .lock()
                            .unwrap()
                            .put(key, (Instant::now(), Some(cover.clone())));
                        return Some(cover);
                    }
                }
            }
        }
        if self.album.contains('"') || self.artist.contains('"') {
            return None;
        }
        let q = format!("album:\"{}\" artist:\"{}\"", self.album, self.artist);
        let response = CLIENT
            .get(format!("{base}/search"))
            .query(&[("q", q.as_str()), ("type", "album"), ("limit", "50")])
            .send()
            .await
            .ok()?
            .error_for_status()
            .ok()?;
        let result: Value = response.json().await.ok()?;
        let cover = unique_cover(&result["albums"], &self.album, &self.artist);
        CACHE
            .lock()
            .unwrap()
            .put(key, (Instant::now(), cover.clone()));
        cover
    }
}

pub async fn promote(
    tx: &mut rocksky_db::tx::Tx<'_>,
    artwork: Option<&(Release, String)>,
) -> anyhow::Result<()> {
    let Some((release, cover)) = artwork else {
        return Ok(());
    };
    let cover = cover.as_str();
    tx.execute(
        &Query::update()
            .table(Albums::Table)
            .value(Albums::AlbumArt, cover)
            .and_where(Expr::col(Albums::Sha256).eq(&release.album_hash))
            .cond_where(
                Cond::any()
                    .add(Expr::col(Albums::AlbumArt).is_null())
                    .add(Expr::col(Albums::AlbumArt).not_like(format!("{CDN}%"))),
            )
            .to_owned(),
    )
    .await?;
    let mut update = Query::update();
    update
        .table(Tracks::Table)
        .value(Tracks::AlbumArt, cover)
        .cond_where(release.track_release())
        .cond_where(
            Cond::any()
                .add(Expr::col(Tracks::AlbumArt).is_null())
                .add(Expr::col(Tracks::AlbumArt).not_like(format!("{CDN}%"))),
        );
    if let Some(hash) = &release.track_hash {
        update.and_where(Expr::col(Tracks::Sha256).eq(hash));
    }
    tx.execute(&update).await?;
    Ok(())
}

fn spotify_path(link: &str, collection: &str) -> Option<String> {
    let kind = if collection == ALBUM_NSID {
        "album"
    } else {
        "track"
    };
    let url = url::Url::parse(link).ok()?;
    if url.host_str() != Some("open.spotify.com") {
        return None;
    }
    let mut segments = url.path_segments()?;
    if segments.next()? != kind {
        return None;
    }
    let id = segments.next()?;
    if segments.next().is_some() || id.len() != 22 || !id.bytes().all(|c| c.is_ascii_alphanumeric())
    {
        return None;
    }
    Some(format!("{kind}s/{id}"))
}

fn unique_cover(page: &Value, album: &str, artist: &str) -> Option<String> {
    if !page["next"].is_null() {
        return None;
    }
    let same = |v: &Value, s: &str| {
        v.as_str()
            .is_some_and(|name| name.to_lowercase() == s.to_lowercase())
    };
    let mut covers = BTreeSet::new();
    for item in page["items"].as_array()? {
        if !same(&item["name"], album)
            || !item["artists"]
                .as_array()?
                .iter()
                .any(|a| same(&a["name"], artist))
        {
            continue;
        }
        let image = item["images"]
            .as_array()?
            .iter()
            .filter(|i| i["url"].as_str().is_some_and(spotify))
            .max_by_key(|i| i["width"].as_u64())?;
        covers.insert(image["url"].as_str()?);
    }
    if covers.len() == 1 {
        covers.first().map(|s| s.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[tokio::test]
    async fn song_event_promotes_placeholder_from_album_and_preserves_existing_spotify_art() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        let record = json!({"title":"ANGEL HAIR","artist":"Black Dresses","album":"Peaceful as Hell","albumArtist":"Black Dresses"});
        let release = Release::from_record(SONG_NSID, &record).unwrap();
        let cover = format!("{CDN}1234");
        sqlx::query("CREATE TABLE albums (sha256 TEXT, album_art TEXT); CREATE TABLE tracks (sha256 TEXT, album_artist TEXT, album_art TEXT, album TEXT)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO albums VALUES (?,?)")
            .bind(&release.album_hash)
            .bind(&cover)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO tracks VALUES (?,?,?,'Peaceful as Hell')")
            .bind(&release.track_hash)
            .bind(&release.artist)
            .bind("placeholder")
            .execute(&pool)
            .await
            .unwrap();
        let db = Backend::Sqlite(pool.clone());
        assert_eq!(
            release.cover(&db, Some("placeholder")).await.unwrap(),
            Some(cover.clone())
        );
        let mut tx = db.begin().await.unwrap();
        promote(&mut tx, Some(&(release, cover.clone())))
            .await
            .unwrap();
        let replay = Release::from_record(SCROBBLE_NSID, &record).unwrap();
        promote(&mut tx, Some(&(replay, format!("{CDN}5678"))))
            .await
            .unwrap();
        tx.commit().await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT album_art FROM tracks")
                .fetch_one(&pool)
                .await
                .unwrap(),
            cover
        );
    }
    #[test]
    fn requires_unambiguous_release_and_prefers_largest_spotify_cover() {
        let item = json!({"name":"Release","artists":[{"name":"Artist"}],"images":[{"width":1000,"url":"https://lastfm.example/art"},{"width":64,"url":format!("{CDN}aa")},{"width":640,"url":format!("{CDN}bb")}]});
        let mut page = json!({"items":[item.clone()]});
        assert_eq!(
            unique_cover(&page, "release", "ARTIST"),
            Some(format!("{CDN}bb"))
        );
        assert_eq!(unique_cover(&page, "Release", "Other"), None);
        page["items"].as_array_mut().unwrap().push(item);
        page["items"][1]["images"][2]["url"] = json!(format!("{CDN}cc"));
        assert_eq!(unique_cover(&page, "Release", "Artist"), None);
    }
}
