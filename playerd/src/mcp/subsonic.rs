//! The user's music library, over Rocksky's Subsonic-compatible API.
//!
//! This is the half of the MCP server that answers "what could I play?".
//! Enqueue descriptors need a library id, and Navidrome's `id` *is* the
//! Rocksky track id the remote protocol calls `trackId` — so search results
//! from here drop straight into an `enqueue` command, uploads included.
//!
//! Credentials (handle + a dedicated API key) are the same ones playerd's
//! resolver provisions and caches in `~/.rocksky/navidrome.json`.

use anyhow::{bail, Context, Result};
use rocksky_sdk::RemoteQueueItem;
use serde_json::{json, Value};

use crate::resolver::{navidrome_creds, NavidromeCreds};

pub struct Subsonic {
    http: reqwest::Client,
    base: String,
    creds: NavidromeCreds,
}

/// One library track, in the shape the tools hand back to the model: enough to
/// talk about it, plus the `id` that makes it playable.
#[derive(Clone, Default)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art: String,
    pub duration_ms: u64,
    pub track_number: i32,
    pub genre: Option<String>,
    pub year: Option<i64>,
    pub album_id: Option<String>,
    pub artist_id: Option<String>,
}

impl Song {
    fn from_value(v: &Value) -> Song {
        Song {
            id: str_of(v, "id"),
            title: str_of(v, "title"),
            artist: str_of(v, "artist"),
            album: str_of(v, "album"),
            album_art: str_of(v, "coverArtUrl"),
            // Subsonic reports whole seconds; the remote protocol wants ms.
            duration_ms: v.get("duration").and_then(Value::as_u64).unwrap_or(0) * 1000,
            track_number: v.get("track").and_then(Value::as_i64).unwrap_or(0) as i32,
            genre: v.get("genre").and_then(Value::as_str).map(str::to_string),
            year: v.get("year").and_then(Value::as_i64),
            album_id: v.get("albumId").and_then(Value::as_str).map(str::to_string),
            artist_id: v
                .get("artistId")
                .and_then(Value::as_str)
                .map(str::to_string),
        }
    }

    pub fn to_json(&self) -> Value {
        let mut v = json!({
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "durationMs": self.duration_ms,
        });
        if self.track_number > 0 {
            v["trackNumber"] = json!(self.track_number);
        }
        if let Some(genre) = &self.genre {
            v["genre"] = json!(genre);
        }
        if let Some(year) = self.year {
            v["year"] = json!(year);
        }
        if let Some(album_id) = &self.album_id {
            v["albumId"] = json!(album_id);
        }
        if let Some(artist_id) = &self.artist_id {
            v["artistId"] = json!(artist_id);
        }
        v
    }

    /// The descriptor an `enqueue` command carries. `track_id` (not
    /// `upload_id`) is right for everything the library serves: the player
    /// streams it back from Navidrome with its own credentials.
    pub fn to_queue_item(&self) -> RemoteQueueItem {
        RemoteQueueItem {
            track_id: self.id.clone(),
            title: self.title.clone(),
            artist: self.artist.clone(),
            album: self.album.clone(),
            album_artist: self.artist.clone(),
            album_art: self.album_art.clone(),
            duration_ms: self.duration_ms,
            track_number: self.track_number,
            ..Default::default()
        }
    }
}

#[derive(Clone, Default)]
pub struct Album {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub artist_id: Option<String>,
    pub song_count: i64,
    pub duration_ms: u64,
    pub year: Option<i64>,
    pub genre: Option<String>,
}

impl Album {
    fn from_value(v: &Value) -> Album {
        Album {
            id: str_of(v, "id"),
            name: if v.get("name").is_some() {
                str_of(v, "name")
            } else {
                str_of(v, "title")
            },
            artist: str_of(v, "artist"),
            artist_id: v
                .get("artistId")
                .and_then(Value::as_str)
                .map(str::to_string),
            song_count: v.get("songCount").and_then(Value::as_i64).unwrap_or(0),
            duration_ms: v.get("duration").and_then(Value::as_u64).unwrap_or(0) * 1000,
            year: v.get("year").and_then(Value::as_i64),
            genre: v.get("genre").and_then(Value::as_str).map(str::to_string),
        }
    }

    pub fn to_json(&self) -> Value {
        let mut v = json!({
            "albumId": self.id,
            "title": self.name,
            "artist": self.artist,
            "songCount": self.song_count,
            "durationMs": self.duration_ms,
        });
        if let Some(year) = self.year {
            v["year"] = json!(year);
        }
        if let Some(genre) = &self.genre {
            v["genre"] = json!(genre);
        }
        if let Some(artist_id) = &self.artist_id {
            v["artistId"] = json!(artist_id);
        }
        v
    }
}

#[derive(Clone, Default)]
pub struct Artist {
    pub id: String,
    pub name: String,
    pub album_count: i64,
}

impl Artist {
    fn from_value(v: &Value) -> Artist {
        Artist {
            id: str_of(v, "id"),
            name: str_of(v, "name"),
            album_count: v.get("albumCount").and_then(Value::as_i64).unwrap_or(0),
        }
    }

    pub fn to_json(&self) -> Value {
        json!({ "artistId": self.id, "name": self.name, "albumCount": self.album_count })
    }
}

#[derive(Clone, Default)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub song_count: i64,
    pub duration_ms: u64,
    pub comment: Option<String>,
}

impl Playlist {
    fn from_value(v: &Value) -> Playlist {
        Playlist {
            id: str_of(v, "id"),
            name: str_of(v, "name"),
            song_count: v.get("songCount").and_then(Value::as_i64).unwrap_or(0),
            duration_ms: v.get("duration").and_then(Value::as_u64).unwrap_or(0) * 1000,
            comment: v.get("comment").and_then(Value::as_str).map(str::to_string),
        }
    }

    pub fn to_json(&self) -> Value {
        let mut v = json!({
            "playlistId": self.id,
            "name": self.name,
            "songCount": self.song_count,
            "durationMs": self.duration_ms,
        });
        if let Some(comment) = &self.comment {
            v["description"] = json!(comment);
        }
        v
    }
}

#[derive(Default)]
pub struct SearchResults {
    pub songs: Vec<Song>,
    pub albums: Vec<Album>,
    pub artists: Vec<Artist>,
}

impl Subsonic {
    /// Provisioning hits the API, so this is built lazily on the first library
    /// tool call rather than at server start.
    pub async fn connect(api_url: &str, navidrome_url: &str, token: &str) -> Result<Subsonic> {
        let http = reqwest::Client::new();
        let creds = navidrome_creds(&http, api_url.trim_end_matches('/'), token)
            .await
            .context("provisioning Navidrome credentials")?;
        Ok(Subsonic {
            http,
            base: navidrome_url.trim_end_matches('/').to_string(),
            creds,
        })
    }

    /// One Subsonic call, returning the unwrapped `subsonic-response` body.
    async fn call(&self, method: &str, params: &[(&str, String)]) -> Result<Value> {
        let mut query: Vec<(&str, String)> = vec![
            ("u", self.creds.handle.clone()),
            ("p", self.creds.api_key.clone()),
            ("c", "playerd-mcp".to_string()),
            ("v", "1.16.1".to_string()),
            ("f", "json".to_string()),
        ];
        query.extend(
            params
                .iter()
                .filter(|(_, v)| !v.is_empty())
                .map(|(k, v)| (*k, v.clone())),
        );

        let res = self
            .http
            .get(format!("{}/rest/{method}", self.base))
            .query(&query)
            .send()
            .await
            .with_context(|| format!("calling {method}"))?;
        if !res.status().is_success() {
            bail!("{method} returned HTTP {}", res.status());
        }
        let body: Value = res
            .json()
            .await
            .with_context(|| format!("parsing {method} response"))?;
        let response = body
            .get("subsonic-response")
            .cloned()
            .unwrap_or(Value::Null);
        if response.get("status").and_then(Value::as_str) == Some("failed") {
            let message = response
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(Value::as_str)
                .unwrap_or("unknown error");
            bail!("{method}: {message}");
        }
        Ok(response)
    }

    pub async fn search(
        &self,
        query: &str,
        song_count: u32,
        album_count: u32,
        artist_count: u32,
        offset: u32,
    ) -> Result<SearchResults> {
        let res = self
            .call(
                "search3",
                &[
                    ("query", query.to_string()),
                    ("songCount", song_count.to_string()),
                    ("albumCount", album_count.to_string()),
                    ("artistCount", artist_count.to_string()),
                    ("songOffset", offset.to_string()),
                    ("albumOffset", offset.to_string()),
                    ("artistOffset", offset.to_string()),
                ],
            )
            .await?;
        let result = res.get("searchResult3").cloned().unwrap_or(Value::Null);
        Ok(SearchResults {
            songs: list(&result, "song").iter().map(Song::from_value).collect(),
            albums: list(&result, "album")
                .iter()
                .map(Album::from_value)
                .collect(),
            artists: list(&result, "artist")
                .iter()
                .map(Artist::from_value)
                .collect(),
        })
    }

    pub async fn song(&self, id: &str) -> Result<Song> {
        let res = self.call("getSong", &[("id", id.to_string())]).await?;
        let song = res.get("song").cloned().unwrap_or(Value::Null);
        if !song.is_object() {
            bail!("no track with id {id}");
        }
        Ok(Song::from_value(&song))
    }

    /// An album with its tracks, in disc/track order.
    pub async fn album(&self, id: &str) -> Result<(Album, Vec<Song>)> {
        let res = self.call("getAlbum", &[("id", id.to_string())]).await?;
        let album = res.get("album").cloned().unwrap_or(Value::Null);
        if !album.is_object() {
            bail!("no album with id {id}");
        }
        let songs = list(&album, "song").iter().map(Song::from_value).collect();
        Ok((Album::from_value(&album), songs))
    }

    pub async fn artist(&self, id: &str) -> Result<(Artist, Vec<Album>)> {
        let res = self.call("getArtist", &[("id", id.to_string())]).await?;
        let artist = res.get("artist").cloned().unwrap_or(Value::Null);
        if !artist.is_object() {
            bail!("no artist with id {id}");
        }
        let albums = list(&artist, "album")
            .iter()
            .map(Album::from_value)
            .collect();
        Ok((Artist::from_value(&artist), albums))
    }

    pub async fn album_list(
        &self,
        kind: &str,
        size: u32,
        offset: u32,
        genre: Option<&str>,
        from_year: Option<i64>,
        to_year: Option<i64>,
    ) -> Result<Vec<Album>> {
        let res = self
            .call(
                "getAlbumList2",
                &[
                    ("type", kind.to_string()),
                    ("size", size.to_string()),
                    ("offset", offset.to_string()),
                    ("genre", genre.unwrap_or_default().to_string()),
                    (
                        "fromYear",
                        from_year.map(|y| y.to_string()).unwrap_or_default(),
                    ),
                    ("toYear", to_year.map(|y| y.to_string()).unwrap_or_default()),
                ],
            )
            .await?;
        let list_obj = res.get("albumList2").cloned().unwrap_or(Value::Null);
        Ok(list(&list_obj, "album")
            .iter()
            .map(Album::from_value)
            .collect())
    }

    pub async fn random_songs(
        &self,
        count: u32,
        genre: Option<&str>,
        from_year: Option<i64>,
        to_year: Option<i64>,
    ) -> Result<Vec<Song>> {
        let res = self
            .call(
                "getRandomSongs",
                &[
                    ("size", count.to_string()),
                    ("genre", genre.unwrap_or_default().to_string()),
                    (
                        "fromYear",
                        from_year.map(|y| y.to_string()).unwrap_or_default(),
                    ),
                    ("toYear", to_year.map(|y| y.to_string()).unwrap_or_default()),
                ],
            )
            .await?;
        Ok(songs_under(&res, "randomSongs"))
    }

    pub async fn songs_by_genre(&self, genre: &str, count: u32, offset: u32) -> Result<Vec<Song>> {
        let res = self
            .call(
                "getSongsByGenre",
                &[
                    ("genre", genre.to_string()),
                    ("count", count.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(songs_under(&res, "songsByGenre"))
    }

    pub async fn starred_songs(&self) -> Result<Vec<Song>> {
        let res = self.call("getStarred2", &[]).await?;
        Ok(songs_under(&res, "starred2"))
    }

    pub async fn genres(&self) -> Result<Vec<Value>> {
        let res = self.call("getGenres", &[]).await?;
        let genres = res.get("genres").cloned().unwrap_or(Value::Null);
        Ok(list(&genres, "genre")
            .iter()
            .map(|g| {
                json!({
                    "name": g.get("value").and_then(Value::as_str)
                        .or_else(|| g.get("name").and_then(Value::as_str))
                        .unwrap_or_default(),
                    "songCount": g.get("songCount").and_then(Value::as_i64).unwrap_or(0),
                    "albumCount": g.get("albumCount").and_then(Value::as_i64).unwrap_or(0),
                })
            })
            .collect())
    }

    pub async fn playlists(&self) -> Result<Vec<Playlist>> {
        let res = self.call("getPlaylists", &[]).await?;
        let playlists = res.get("playlists").cloned().unwrap_or(Value::Null);
        Ok(list(&playlists, "playlist")
            .iter()
            .map(Playlist::from_value)
            .collect())
    }

    pub async fn playlist(&self, id: &str) -> Result<(Playlist, Vec<Song>)> {
        let res = self.call("getPlaylist", &[("id", id.to_string())]).await?;
        let playlist = res.get("playlist").cloned().unwrap_or(Value::Null);
        if !playlist.is_object() {
            bail!("no playlist with id {id}");
        }
        let songs = list(&playlist, "entry")
            .iter()
            .map(Song::from_value)
            .collect();
        Ok((Playlist::from_value(&playlist), songs))
    }

    /// Best library match for a loosely described track — what turns a
    /// recommendation ("Chaser by Calibro 35") into something playable.
    /// Prefers an exact title hit whose artist also matches.
    pub async fn best_match(
        &self,
        title: &str,
        artist: Option<&str>,
        album: Option<&str>,
    ) -> Result<Option<Song>> {
        let query = match artist {
            Some(artist) if !artist.trim().is_empty() => format!("{title} {artist}"),
            _ => title.to_string(),
        };
        let mut candidates = self.search(&query, 25, 0, 0, 0).await?.songs;
        // A combined query can miss when the tags spell the artist differently;
        // the title alone is the wider net.
        if candidates.is_empty() {
            candidates = self.search(title, 25, 0, 0, 0).await?.songs;
        }
        if candidates.is_empty() {
            return Ok(None);
        }

        let title_l = title.trim().to_lowercase();
        let artist_l = artist.unwrap_or_default().trim().to_lowercase();
        let album_l = album.unwrap_or_default().trim().to_lowercase();
        let score = |s: &Song| -> i32 {
            let (st, sa, sb) = (
                s.title.to_lowercase(),
                s.artist.to_lowercase(),
                s.album.to_lowercase(),
            );
            let mut score = 0;
            if st == title_l {
                score += 8;
            } else if st.contains(&title_l) || title_l.contains(&st) {
                score += 4;
            }
            if !artist_l.is_empty() {
                if sa == artist_l {
                    score += 6;
                } else if sa.contains(&artist_l) || artist_l.contains(&sa) {
                    score += 3;
                }
            }
            if !album_l.is_empty() && (sb == album_l || sb.contains(&album_l)) {
                score += 2;
            }
            score
        };
        let best = candidates
            .into_iter()
            .max_by_key(|s| score(s))
            .filter(|s| score(s) > 0);
        Ok(best)
    }
}

fn list(value: &Value, key: &str) -> Vec<Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn songs_under(response: &Value, key: &str) -> Vec<Song> {
    let container = response.get(key).cloned().unwrap_or(Value::Null);
    list(&container, "song")
        .iter()
        .map(Song::from_value)
        .collect()
}

fn str_of(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
