//! plyr.fm catalogue; numeric page offsets are tokens for the API's opaque cursors.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

pub const API: &str = "https://api.plyr.fm";
const PAGE: usize = 50;

static CURSORS: LazyLock<Mutex<(usize, HashMap<usize, (String, String)>)>> =
    LazyLock::new(|| Mutex::new((0, HashMap::new())));

fn request(path: &str) -> Result<Value, String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|_| "Could not start network client".to_string())?;
    let res = client
        .get(format!("{API}{path}"))
        .header("accept", "application/json")
        .send()
        .map_err(|e| {
            if e.is_timeout() {
                "plyr.fm timed out. Please try again.".to_string()
            } else {
                "Could not reach plyr.fm. Check your network.".to_string()
            }
        })?;
    if !res.status().is_success() {
        return Err(format!(
            "plyr.fm request failed ({}). Please try again.",
            res.status().as_u16()
        ));
    }
    res.json()
        .map_err(|_| "plyr.fm returned an invalid response".to_string())
}

fn str_of<'a>(v: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|k| v[*k].as_str().filter(|s| !s.is_empty()))
}

fn path_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn query_encode(s: &str) -> String {
    let mut u = reqwest::Url::parse("https://x/").unwrap();
    u.query_pairs_mut().append_pair("q", s);
    u.query().unwrap_or("").trim_start_matches("q=").to_string()
}

fn id_of(v: &Value) -> String {
    match &v["id"] {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn track_entry(t: &Value) -> Value {
    let album = &t["album"];
    json!({
        "id": id_of(t),
        "artistHandle": t["artist_handle"].as_str(),
        "kind": "track",
        "title": str_of(t, &["title"]).unwrap_or("Untitled"),
        "artist": str_of(t, &["artist", "artist_display_name", "artist_handle"]).unwrap_or(""),
        "album": str_of(album, &["title"]).unwrap_or(""),
        "durationMs": (t["duration"].as_f64().unwrap_or(0.0).max(0.0) * 1000.0) as u64,
        "art": str_of(t, &["thumbnail_url", "image_url", "artwork_url"])
            .or_else(|| str_of(album, &["thumbnail_url", "image_url"]))
            .or_else(|| str_of(t, &["artist_avatar_url"])),
    })
}

fn artist_entry(a: &Value) -> Value {
    json!({
        "id": format!("artist:{}", str_of(a, &["did", "artist_did"]).unwrap_or("")),
        "artistHandle": str_of(a, &["handle", "artist_handle"]),
        "kind": "artist",
        "title": str_of(a, &["display_name", "artist", "artist_handle", "handle"]).unwrap_or("Unknown artist"),
        "artist": str_of(a, &["handle", "artist_handle"]).unwrap_or(""),
        "album": "",
        "durationMs": 0,
        "art": str_of(a, &["avatar_url", "artist_avatar_url"]),
    })
}

fn filter(entries: Vec<Value>, query: &str) -> Vec<Value> {
    let term = query.to_lowercase();
    if term.is_empty() {
        return entries;
    }
    entries
        .into_iter()
        .filter(|e| {
            format!(
                "{} {} {}",
                str_of(e, &["title"]).unwrap_or(""),
                str_of(e, &["artist"]).unwrap_or(""),
                str_of(e, &["album"]).unwrap_or("")
            )
            .to_lowercase()
            .contains(&term)
        })
        .collect()
}

fn page(entries: Vec<Value>, query: &str, next_offset: Option<usize>) -> Value {
    json!({ "entries": filter(entries, query), "nextOffset": next_offset })
}

fn items(v: &Value, key: &str) -> Vec<Value> {
    let node = if key.is_empty() { v } else { &v[key] };
    node.as_array().cloned().unwrap_or_default()
}

pub fn browse(id: &str, query: &str, offset: usize) -> Result<Value, String> {
    let key = format!("{id}\u{0}{query}");
    let token = if offset > 0 {
        let cursors = CURSORS.lock().map_err(|_| "Library paging unavailable")?;
        match cursors.1.get(&offset) {
            Some((k, cursor)) if *k == key => Some(cursor.clone()),
            _ => return Err("This page expired. Refresh plyr.fm.".into()),
        }
    } else {
        None
    };
    if id == "radio" {
        let data = request("/radio/stations")?;
        let entries = items(&data, "stations")
            .iter()
            .map(|s| {
                json!({
                    "id": format!("station:{}", str_of(s, &["slug"]).unwrap_or("")),
                    "title": str_of(s, &["name", "slug"]).unwrap_or("Radio"),
                    "kind": "station",
                    "artist": str_of(s, &["description"]).unwrap_or(""),
                    "album": "",
                    "art": null,
                    "durationMs": 0,
                })
            })
            .collect();
        return Ok(page(entries, query, None));
    }
    if let Some(slug) = id.strip_prefix("station:") {
        let data = request(&format!(
            "/radio/state?station={}&catalog_only=true&limit=75",
            query_encode(slug)
        ))?;
        let rotation = items(&data, "rotation");
        let current = &data["current"]["id"];
        let index = rotation
            .iter()
            .position(|t| &t["id"] == current)
            .unwrap_or(0);
        let entries = rotation[index..]
            .iter()
            .chain(rotation[..index].iter())
            .map(track_entry)
            .collect();
        return Ok(page(entries, query, None));
    }
    if id == "albums" {
        let data = request("/albums/")?;
        let entries = items(&data, "albums")
            .iter()
            .map(|a| {
                json!({
                    "id": format!(
                        "album:{}/{}",
                        path_encode(str_of(a, &["artist_handle"]).unwrap_or("")),
                        path_encode(str_of(a, &["slug"]).unwrap_or(""))
                    ),
                    "title": str_of(a, &["title"]).unwrap_or("Untitled"),
                    "artistHandle": a["artist_handle"].as_str(),
                    "kind": "album",
                    "artist": str_of(a, &["artist", "artist_handle"]).unwrap_or(""),
                    "album": str_of(a, &["title"]).unwrap_or(""),
                    "art": str_of(a, &["thumbnail_url", "image_url"]),
                    "durationMs": 0,
                })
            })
            .collect();
        return Ok(page(entries, query, None));
    }
    if let Some(rest) = id.strip_prefix("album:") {
        let data = request(&format!("/albums/{rest}"))?;
        return Ok(page(items(&data, "tracks").iter().map(track_entry).collect(), query, None));
    }
    if id == "top tracks" {
        let data = request("/tracks/top?limit=100&period=all_time")?;
        return Ok(page(items(&data, "").iter().map(track_entry).collect(), query, None));
    }
    if query.chars().count() >= 2 && (id == "tracks" || id == "artists") {
        let data = request(&format!(
            "/search/?q={}&type={id}&limit=50",
            query_encode(query)
        ))?;
        let results = items(&data, "results");
        let entries: Vec<Value> = if id == "artists" {
            results.iter().map(artist_entry).collect()
        } else {
            results.iter().map(track_entry).collect()
        };
        return Ok(json!({ "entries": entries, "nextOffset": null }));
    }
    let mut path = format!("/tracks/?limit={PAGE}");
    if let Some(cursor) = &token {
        path.push_str(&format!("&cursor={}", query_encode(cursor)));
    }
    if let Some(did) = id.strip_prefix("artist:") {
        path.push_str(&format!("&artist_did={}", query_encode(did)));
    }
    let data = request(&path)?;
    let tracks = items(&data, "tracks");
    let entries: Vec<Value> = if id == "artists" {
        let mut seen: HashMap<String, usize> = HashMap::new();
        let mut out = vec![];
        for t in tracks.iter().filter(|t| t["artist_did"].as_str().is_some()) {
            let did = t["artist_did"].as_str().unwrap_or("").to_owned();
            match seen.get(&did) {
                Some(&i) => out[i] = artist_entry(t),
                None => {
                    seen.insert(did, out.len());
                    out.push(artist_entry(t));
                }
            }
        }
        out
    } else {
        tracks.iter().map(track_entry).collect()
    };
    let mut next_offset = None;
    if data["has_more"].as_bool().unwrap_or(false) {
        if let Some(next) = data["next_cursor"].as_str().filter(|c| !c.is_empty()) {
            if token.as_deref() != Some(next) {
                let mut cursors = CURSORS.lock().map_err(|_| "Library paging unavailable")?;
                cursors.0 += 1;
                let n = cursors.0;
                cursors.1.insert(n, (key, next.to_owned()));
                if cursors.1.len() > 2000 {
                    if let Some(oldest) = cursors.1.keys().min().copied() {
                        cursors.1.remove(&oldest);
                    }
                }
                next_offset = Some(n);
            }
        }
    }
    Ok(page(entries, query, next_offset))
}

pub fn stream(id: &str) -> Result<String, String> {
    let track = request(&format!("/tracks/{}", path_encode(id)))?;
    if track["gated"].as_bool().unwrap_or(false)
        || track["support_gate"].as_bool().unwrap_or(false)
    {
        return Err("This track requires supporter access on plyr.fm.".into());
    }
    let file = match &track["file_id"] {
        Value::String(s) if !s.is_empty() => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => return Err("plyr.fm did not return a playable track.".into()),
    };
    Ok(format!("{API}/audio/{}", path_encode(&file)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_entry_falls_back_through_artwork_and_artist_fields() {
        let e = track_entry(&json!({
            "id": 7, "title": "Song", "artist_handle": "me.bsky.social", "duration": 61.5,
            "album": {"title": "LP", "image_url": "https://img/lp.png"}
        }));
        assert_eq!(e["id"], "7");
        assert_eq!(e["artist"], "me.bsky.social");
        assert_eq!(e["album"], "LP");
        assert_eq!(e["durationMs"], 61500);
        assert_eq!(e["art"], "https://img/lp.png");
    }

    #[test]
    fn encoders_escape_path_and_query_characters() {
        assert_eq!(path_encode("a b/c"), "a%20b%2Fc");
        assert_eq!(query_encode("a b&c"), "a+b%26c");
    }

    #[test]
    fn local_filter_matches_title_artist_or_album() {
        let p = page(
            vec![
                json!({"title": "Alpha", "artist": "X", "album": ""}),
                json!({"title": "Beta", "artist": "Y", "album": "Gamma"}),
            ],
            "gam",
            None,
        );
        assert_eq!(p["entries"].as_array().unwrap().len(), 1);
        assert_eq!(p["entries"][0]["title"], "Beta");
    }
}
