//! Finding music: the listener's library, and what Rocksky knows about their
//! taste.
//!
//! Library lookups return an `id` on every track — that id is what `enqueue`
//! takes, so anything found here is directly playable. The taste tools
//! (recommendations, top tracks, scrobbles) describe music by name instead, so
//! feed those names back through `enqueue`, which matches them to the library.

use anyhow::{bail, Result};
use serde_json::{json, Value};

use super::{tool, Args, Ctx};
use crate::rocksky::{
    album_recommendation_json, artist_recommendation_json, scrobble_view_json, song_view_json,
    track_recommendation_json,
};
use crate::subsonic::{Album, Artist, Song};

pub fn definitions() -> Vec<Value> {
    vec![
        tool(
            "search_library",
            "Search the listener's music library (their uploads and everything Rocksky has indexed for them) for tracks, albums and artists. Results carry the ids that enqueue, get_album and get_artist take. An at:// record URI works as a query too.",
            json!({
                "query": { "type": "string", "description": "Free text: title, artist, album — or an at:// URI." },
                "kind": {
                    "type": "string",
                    "enum": ["tracks", "albums", "artists", "all"],
                    "description": "What to look for (default \"tracks\").",
                },
                "limit": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Max results per kind (default 20)." },
                "offset": { "type": "integer", "minimum": 0, "description": "Skip this many results, for paging." },
            }),
            &["query"],
        ),
        tool(
            "get_album",
            "An album and its tracks, in order. Accepts an album id or an album title (optionally narrowed with artist).",
            json!({
                "album": { "type": "string", "description": "Album id (from search_library) or album title." },
                "artist": { "type": "string", "description": "Narrows a title lookup to one artist." },
            }),
            &["album"],
        ),
        tool(
            "get_artist",
            "An artist and their albums in the library. Accepts an artist id or a name.",
            json!({
                "artist": { "type": "string", "description": "Artist id (from search_library) or artist name." },
            }),
            &["artist"],
        ),
        tool(
            "browse_songs",
            "Pull a batch of tracks from the library without searching for anything in particular — the fastest way to source a set. \"random\" honours the genre/year filters, \"starred\" returns loved tracks, \"genre\" lists a genre in full.",
            json!({
                "kind": { "type": "string", "enum": ["random", "starred", "genre"], "description": "Default \"random\"." },
                "genre": { "type": "string", "description": "Required for kind \"genre\"; optional filter for \"random\"." },
                "count": { "type": "integer", "minimum": 1, "maximum": 200, "description": "How many tracks (default 25)." },
                "offset": { "type": "integer", "minimum": 0, "description": "Paging, for kind \"genre\"." },
                "from_year": { "type": "integer", "description": "Earliest release year, for kind \"random\"." },
                "to_year": { "type": "integer", "description": "Latest release year, for kind \"random\"." },
            }),
            &[],
        ),
        tool(
            "browse_albums",
            "Browse albums in the library by a listing rather than a search: what is new, what gets played, what is starred, or a slice of a genre or a year range.",
            json!({
                "kind": {
                    "type": "string",
                    "enum": ["newest", "frequent", "recent", "random", "starred", "alphabeticalByName", "byYear", "byGenre"],
                    "description": "Default \"newest\".",
                },
                "genre": { "type": "string", "description": "Required for kind \"byGenre\"." },
                "from_year": { "type": "integer", "description": "For kind \"byYear\"." },
                "to_year": { "type": "integer", "description": "For kind \"byYear\"." },
                "count": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Default 20." },
                "offset": { "type": "integer", "minimum": 0 },
            }),
            &[],
        ),
        tool(
            "list_genres",
            "Genres present in the library, with how many tracks and albums each has. Use these exact names when filtering.",
            json!({}),
            &[],
        ),
        tool(
            "list_playlists",
            "The listener's saved playlists.",
            json!({}),
            &[],
        ),
        tool(
            "get_playlist",
            "A playlist and its tracks, in order. Accepts a playlist id or its name.",
            json!({ "playlist": { "type": "string", "description": "Playlist id (from list_playlists) or name." } }),
            &["playlist"],
        ),
        tool(
            "get_recommendations",
            "What Rocksky thinks this listener would like next, from their listening history and their neighbours'. Returns names, not library ids — pass them straight to enqueue, which matches them against the library.",
            json!({
                "kind": { "type": "string", "enum": ["tracks", "artists", "albums"], "description": "Default \"tracks\"." },
                "limit": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Default 20." },
            }),
            &[],
        ),
        tool(
            "get_listening_history",
            "What this listener actually plays: their most-played tracks, their loved tracks, or their recent scrobbles. Read this before building a set for them.",
            json!({
                "kind": { "type": "string", "enum": ["top", "loved", "recent"], "description": "\"top\" = most played (default), \"loved\" = favourites, \"recent\" = last scrobbles." },
                "limit": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Default 20." },
            }),
            &[],
        ),
    ]
}

pub async fn call(ctx: &Ctx, name: &str, args: &Args<'_>) -> Result<Option<Value>> {
    let result = match name {
        "search_library" => {
            let query = args.req_str("query")?;
            let kind = args.str("kind").unwrap_or("tracks");
            let limit = args.count("limit", 20, 100);
            let offset = args.u32("offset").unwrap_or(0);
            let (songs, albums, artists) = match kind {
                "albums" => (0, limit, 0),
                "artists" => (0, 0, limit),
                "all" => (limit, limit, limit),
                _ => (limit, 0, 0),
            };
            let results = ctx
                .subsonic()
                .await?
                .search(query, songs, albums, artists, offset)
                .await?;
            let mut v = json!({ "query": query });
            if songs > 0 {
                v["tracks"] = json!(results.songs.iter().map(Song::to_json).collect::<Vec<_>>());
            }
            if albums > 0 {
                v["albums"] = json!(results
                    .albums
                    .iter()
                    .map(Album::to_json)
                    .collect::<Vec<_>>());
            }
            if artists > 0 {
                v["artists"] = json!(results
                    .artists
                    .iter()
                    .map(Artist::to_json)
                    .collect::<Vec<_>>());
            }
            v
        }

        "get_album" => {
            let subsonic = ctx.subsonic().await?;
            let wanted = args.req_str("album")?;
            let id = match subsonic.album(wanted).await {
                Ok((album, songs)) => {
                    return Ok(Some(json!({
                        "album": album.to_json(),
                        "tracks": songs.iter().map(Song::to_json).collect::<Vec<_>>(),
                    })))
                }
                // Not an id, then — treat it as a title.
                Err(_) => {
                    let query = match args.str("artist") {
                        Some(artist) => format!("{wanted} {artist}"),
                        None => wanted.to_string(),
                    };
                    let found = subsonic.search(&query, 0, 10, 0, 0).await?.albums;
                    let artist_l = args.str("artist").unwrap_or_default().to_lowercase();
                    let best = found
                        .iter()
                        .find(|a| {
                            a.name.eq_ignore_ascii_case(wanted)
                                && (artist_l.is_empty()
                                    || a.artist.to_lowercase().contains(&artist_l))
                        })
                        .or_else(|| found.first());
                    match best {
                        Some(album) => album.id.clone(),
                        None => bail!("no album matches {wanted:?}"),
                    }
                }
            };
            let (album, songs) = subsonic.album(&id).await?;
            json!({
                "album": album.to_json(),
                "tracks": songs.iter().map(Song::to_json).collect::<Vec<_>>(),
            })
        }

        "get_artist" => {
            let subsonic = ctx.subsonic().await?;
            let wanted = args.req_str("artist")?;
            let (artist, albums) = match subsonic.artist(wanted).await {
                Ok(found) => found,
                Err(_) => {
                    let found = subsonic.search(wanted, 0, 0, 10, 0).await?.artists;
                    let best = found
                        .iter()
                        .find(|a| a.name.eq_ignore_ascii_case(wanted))
                        .or_else(|| found.first())
                        .ok_or_else(|| anyhow::anyhow!("no artist matches {wanted:?}"))?;
                    subsonic.artist(&best.id).await?
                }
            };
            json!({
                "artist": artist.to_json(),
                "albums": albums.iter().map(Album::to_json).collect::<Vec<_>>(),
            })
        }

        "browse_songs" => {
            let subsonic = ctx.subsonic().await?;
            let kind = args.str("kind").unwrap_or("random");
            let count = args.count("count", 25, 200);
            let songs = match kind {
                "starred" => subsonic.starred_songs().await?,
                "genre" => {
                    let genre = args.str("genre").ok_or_else(|| {
                        anyhow::anyhow!("kind \"genre\" needs a `genre` (see list_genres)")
                    })?;
                    subsonic
                        .songs_by_genre(genre, count, args.u32("offset").unwrap_or(0))
                        .await?
                }
                _ => {
                    subsonic
                        .random_songs(
                            count,
                            args.str("genre"),
                            args.i64("from_year"),
                            args.i64("to_year"),
                        )
                        .await?
                }
            };
            let songs: Vec<&Song> = songs.iter().take(count as usize).collect();
            json!({
                "kind": kind,
                "count": songs.len(),
                "tracks": songs.iter().map(|s| s.to_json()).collect::<Vec<_>>(),
            })
        }

        "browse_albums" => {
            let kind = args.str("kind").unwrap_or("newest");
            let albums = ctx
                .subsonic()
                .await?
                .album_list(
                    kind,
                    args.count("count", 20, 100),
                    args.u32("offset").unwrap_or(0),
                    args.str("genre"),
                    args.i64("from_year"),
                    args.i64("to_year"),
                )
                .await?;
            json!({
                "kind": kind,
                "albums": albums.iter().map(Album::to_json).collect::<Vec<_>>(),
            })
        }

        "list_genres" => json!({ "genres": ctx.subsonic().await?.genres().await? }),

        "list_playlists" => {
            let playlists = ctx.subsonic().await?.playlists().await?;
            json!({
                "playlists": playlists
                    .iter()
                    .map(|p| p.to_json())
                    .collect::<Vec<_>>(),
            })
        }

        "get_playlist" => {
            let subsonic = ctx.subsonic().await?;
            let wanted = args.req_str("playlist")?;
            let (playlist, songs) = match subsonic.playlist(wanted).await {
                Ok(found) => found,
                Err(_) => {
                    let all = subsonic.playlists().await?;
                    let best = all
                        .iter()
                        .find(|p| p.name.eq_ignore_ascii_case(wanted))
                        .or_else(|| {
                            let lower = wanted.to_lowercase();
                            all.iter().find(|p| p.name.to_lowercase().contains(&lower))
                        })
                        .ok_or_else(|| anyhow::anyhow!("no playlist matches {wanted:?}"))?;
                    subsonic.playlist(&best.id).await?
                }
            };
            json!({
                "playlist": playlist.to_json(),
                "tracks": songs.iter().map(Song::to_json).collect::<Vec<_>>(),
            })
        }

        "get_recommendations" => {
            let me = ctx.me().await?;
            let kind = args.str("kind").unwrap_or("tracks");
            let limit = args.count("limit", 20, 100);
            match kind {
                "artists" => json!({
                    "kind": "artists",
                    "artists": ctx
                        .rocksky
                        .artist_recommendations(&me.did, limit)
                        .await?
                        .iter()
                        .map(artist_recommendation_json)
                        .collect::<Vec<_>>(),
                }),
                "albums" => json!({
                    "kind": "albums",
                    "albums": ctx
                        .rocksky
                        .album_recommendations(&me.did, limit)
                        .await?
                        .iter()
                        .map(album_recommendation_json)
                        .collect::<Vec<_>>(),
                }),
                _ => json!({
                    "kind": "tracks",
                    "tracks": ctx
                        .rocksky
                        .track_recommendations(&me.did, limit)
                        .await?
                        .iter()
                        .map(track_recommendation_json)
                        .collect::<Vec<_>>(),
                    "note": "These are names, not library ids — enqueue matches them against the library for you.",
                }),
            }
        }

        "get_listening_history" => {
            let me = ctx.me().await?;
            let kind = args.str("kind").unwrap_or("top");
            let limit = args.count("limit", 20, 100);
            match kind {
                "loved" => json!({
                    "kind": "loved",
                    "tracks": ctx
                        .rocksky
                        .loved_songs(&me.did, limit)
                        .await?
                        .iter()
                        .map(song_view_json)
                        .collect::<Vec<_>>(),
                }),
                "recent" => json!({
                    "kind": "recent",
                    "scrobbles": ctx
                        .rocksky
                        .recent_scrobbles(&me.did, limit)
                        .await?
                        .iter()
                        .map(scrobble_view_json)
                        .collect::<Vec<_>>(),
                }),
                _ => json!({
                    "kind": "top",
                    "tracks": ctx
                        .rocksky
                        .top_songs(&me.did, limit)
                        .await?
                        .iter()
                        .map(song_view_json)
                        .collect::<Vec<_>>(),
                }),
            }
        }

        _ => return Ok(None),
    };
    Ok(Some(result))
}
