//! The Rocksky account, and the platform around it.
//!
//! Everything here is the AppView's XRPC surface rather than a player: who
//! someone is, what they have played, what they are playing right now, what
//! the whole platform is playing. These are the tools that answer questions —
//! the only one that writes anything is `create_api_key`.
//!
//! Every read takes an optional `actor` (handle or DID) and falls back to the
//! logged-in account, so "what am I listening to" and "what is alice.bsky.social
//! listening to" are the same tool.

use anyhow::Result;
use serde_json::{json, Value};

use super::{actor_prop, tool, Args, Ctx};
use crate::protocol::strip_nulls;
use crate::rocksky::{
    album_view_json, artist_view_json, parse_interval, profile_json, scrobble_detail_json,
    song_view_json, web_link,
};

pub fn definitions() -> Vec<Value> {
    vec![
        tool(
            "whoami",
            "The Rocksky account this server is authenticated as. Call it once when you need the listener's own handle or DID.",
            json!({}),
            &[],
        ),
        tool(
            "get_profile",
            "A Rocksky user's public profile: handle, display name, avatar and their profile page.",
            json!({ "actor": actor_prop() }),
            &[],
        ),
        tool(
            "get_stats",
            "How much a user has listened: total scrobbles, and how many distinct tracks, albums, artists and loved tracks that adds up to.",
            json!({ "actor": actor_prop() }),
            &[],
        ),
        tool(
            "get_scrobbles",
            "A user's scrobbles, newest first — what they actually played, when. This is history, not the library: entries are names, so pass them through enqueue to play one again.",
            json!({
                "actor": actor_prop(),
                "limit": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Default 20." },
                "offset": { "type": "integer", "minimum": 0, "description": "Skip this many, for paging further back." },
            }),
            &[],
        ),
        tool(
            "get_top",
            "A user's most-played music, or their loved tracks. Use this to learn someone's taste before recommending or queueing anything.",
            json!({
                "actor": actor_prop(),
                "kind": {
                    "type": "string",
                    "enum": ["songs", "albums", "artists", "loved"],
                    "description": "Default \"songs\".",
                },
                "limit": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Default 20." },
            }),
            &[],
        ),
        tool(
            "get_now_playing",
            "What a user is scrobbling right this moment (from Rocksky, or their connected Spotify when Rocksky has nothing). For the state of a player you control, use get_player_state instead.",
            json!({ "actor": actor_prop() }),
            &[],
        ),
        tool(
            "search",
            "Search everything Rocksky has indexed — tracks, albums, artists, playlists and user accounts — across the whole platform, not just this listener's library. For something to play, prefer search_library, whose results carry playable ids.",
            json!({
                "query": { "type": "string", "description": "Free text: a title, an artist, an album, a handle." },
                "kind": {
                    "type": "string",
                    "enum": ["tracks", "albums", "artists", "playlists", "users", "all"],
                    "description": "Narrow the results (default \"all\").",
                },
                "limit": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Max results (default 20)." },
            }),
            &["query"],
        ),
        tool(
            "get_charts",
            "What the whole Rocksky community is playing: the top artists or tracks over a period.",
            json!({
                "kind": { "type": "string", "enum": ["artists", "tracks"], "description": "Default \"tracks\"." },
                "interval": {
                    "type": "string",
                    "description": "\"all\" (default), or a rolling window: 7d, 4w, 6m, 1y.",
                },
                "limit": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Default 20." },
            }),
            &[],
        ),
        tool(
            "create_api_key",
            "Mint an API key for the logged-in account — the credential a third-party scrobbler (or the Last.fm-compatible endpoint) authenticates with. The key itself is shown once, in Rocksky's settings.",
            json!({
                "name": { "type": "string", "description": "What the key is for, e.g. \"my-raspberry-pi\"." },
                "description": { "type": "string", "description": "Optional longer note." },
            }),
            &["name"],
        ),
    ]
}

pub async fn call(ctx: &Ctx, name: &str, args: &Args<'_>) -> Result<Option<Value>> {
    let result = match name {
        "whoami" => {
            let me = ctx.me().await?;
            json!({
                "did": me.did,
                "handle": me.handle,
                "displayName": me.display_name,
                "profile": format!("https://rocksky.app/profile/{}", me.handle),
            })
        }

        "get_profile" => {
            let actor = ctx.actor(args).await?;
            profile_json(&ctx.rocksky.profile(&actor).await?)
        }

        "get_stats" => {
            let actor = ctx.actor(args).await?;
            json!({
                "actor": actor,
                "stats": strip_nulls(ctx.rocksky.stats(&actor).await?),
            })
        }

        "get_scrobbles" => {
            let actor = ctx.actor(args).await?;
            let limit = args.count("limit", 20, 100);
            let offset = args.u32("offset").unwrap_or(0);
            let scrobbles = ctx.rocksky.scrobbles(&actor, limit, offset).await?;
            json!({
                "actor": actor,
                "scrobbles": scrobbles.iter().map(scrobble_detail_json).collect::<Vec<_>>(),
            })
        }

        "get_top" => {
            let actor = ctx.actor(args).await?;
            let kind = args.str("kind").unwrap_or("songs");
            let limit = args.count("limit", 20, 100);
            match kind {
                "albums" => json!({
                    "actor": actor,
                    "kind": "albums",
                    "albums": ctx
                        .rocksky
                        .top_albums(&actor, limit)
                        .await?
                        .iter()
                        .map(album_view_json)
                        .collect::<Vec<_>>(),
                }),
                "artists" => json!({
                    "actor": actor,
                    "kind": "artists",
                    "artists": ctx
                        .rocksky
                        .top_artists(&actor, limit)
                        .await?
                        .iter()
                        .map(artist_view_json)
                        .collect::<Vec<_>>(),
                }),
                "loved" => json!({
                    "actor": actor,
                    "kind": "loved",
                    "tracks": ctx
                        .rocksky
                        .loved_songs(&actor, limit)
                        .await?
                        .iter()
                        .map(song_view_json)
                        .collect::<Vec<_>>(),
                }),
                _ => json!({
                    "actor": actor,
                    "kind": "songs",
                    "tracks": ctx
                        .rocksky
                        .top_songs(&actor, limit)
                        .await?
                        .iter()
                        .map(song_view_json)
                        .collect::<Vec<_>>(),
                }),
            }
        }

        "get_now_playing" => {
            let actor = ctx.actor(args).await?;
            match ctx.rocksky.now_playing(&actor).await? {
                Some((track, source)) => json!({
                    "actor": actor,
                    "source": source,
                    "nowPlaying": strip_nulls(track),
                }),
                None => json!({
                    "actor": actor,
                    "nowPlaying": Value::Null,
                    "note": "Nothing is scrobbling right now.",
                }),
            }
        }

        "search" => {
            let query = args.req_str("query")?;
            let kind = args.str("kind").unwrap_or("all");
            let limit = args.count("limit", 20, 100) as usize;
            let hits = ctx.rocksky.search(query).await?.hits;
            let mut results: Vec<Value> = hits
                .iter()
                .filter_map(search_hit_json)
                .filter(|hit| {
                    kind == "all" || hit.get("type").and_then(Value::as_str) == Some(singular(kind))
                })
                .take(limit)
                .collect();
            // Accounts and playlists are rarer than tracks; a query that found
            // one should not lose it to a page full of songs.
            results.sort_by_key(|hit| {
                matches!(
                    hit.get("type").and_then(Value::as_str),
                    Some("track") | Some("album")
                )
            });
            json!({ "query": query, "results": results })
        }

        "get_charts" => {
            let kind = args.str("kind").unwrap_or("tracks");
            let limit = args.count("limit", 20, 100);
            let interval = parse_interval(args.str("interval"))?;
            let label = args.str("interval").unwrap_or("all").to_string();
            match kind {
                "artists" => json!({
                    "kind": "artists",
                    "interval": label,
                    "artists": ctx
                        .rocksky
                        .chart_artists(limit, interval)
                        .await?
                        .iter()
                        .map(artist_view_json)
                        .collect::<Vec<_>>(),
                }),
                _ => json!({
                    "kind": "tracks",
                    "interval": label,
                    "tracks": ctx
                        .rocksky
                        .chart_tracks(limit, interval)
                        .await?
                        .iter()
                        .map(song_view_json)
                        .collect::<Vec<_>>(),
                }),
            }
        }

        "create_api_key" => {
            let name = args.req_str("name")?;
            let created = ctx
                .rocksky
                .create_api_key(name, args.str("description"))
                .await?;
            json!({
                "ok": true,
                "id": created.id,
                "name": created.name.unwrap_or_else(|| name.to_string()),
                "description": created.description,
                "note": "The key and its shared secret are not returned here — read them at https://rocksky.app/settings.",
            })
        }

        _ => return Ok(None),
    };
    Ok(Some(result))
}

/// Fold one federated search hit into a flat, typed row. The AppView returns
/// the raw indexed document plus `_federation.indexUid`, and the documents are
/// database rows — far more fields than the model needs to pick a result.
fn search_hit_json(hit: &Value) -> Option<Value> {
    let index = hit
        .get("_federation")
        .and_then(|f| f.get("indexUid"))
        .and_then(Value::as_str)?;
    let str_of = |key: &str| hit.get(key).and_then(Value::as_str).unwrap_or_default();
    let link = || {
        let uri = str_of("uri");
        (!uri.is_empty()).then(|| web_link(uri))
    };
    let mut v = match index {
        "tracks" => json!({
            "type": "track",
            "title": str_of("title"),
            "artist": str_of("artist"),
            "album": str_of("album"),
        }),
        "albums" => json!({
            "type": "album",
            "title": str_of("title"),
            "artist": str_of("artist"),
        }),
        "artists" => json!({ "type": "artist", "name": str_of("name") }),
        "playlists" => json!({
            "type": "playlist",
            "name": str_of("name"),
            "description": str_of("description"),
        }),
        "users" => {
            let handle = str_of("handle");
            return Some(json!({
                "type": "user",
                "handle": handle,
                "displayName": str_of("displayName"),
                "did": str_of("did"),
                "link": format!("https://rocksky.app/profile/{handle}"),
            }));
        }
        _ => return None,
    };
    if let Some(link) = link() {
        v["link"] = json!(link);
    }
    Some(strip_nulls(v))
}

/// The `kind` filter names a collection; hits are typed one at a time.
fn singular(kind: &str) -> &str {
    match kind {
        "tracks" => "track",
        "albums" => "album",
        "artists" => "artist",
        "playlists" => "playlist",
        "users" => "user",
        other => other,
    }
}
