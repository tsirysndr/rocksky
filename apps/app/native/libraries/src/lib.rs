//! Device-side library clients. Protocol patterns follow music-player/provider
//! and rockbox-zig/upnp. No server requests or credentials pass through Rocksky.
mod http;
mod index;
mod kodi_discovery;
mod upnp;
use reqwest::{blocking::Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub username: String,
    pub password: String,
    pub token: String,
    pub user_id: String,
    pub control_url: String,
    pub service_type: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub title: String,
    pub kind: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub duration_ms: u64,
    #[serde(default)]
    pub art: Option<String>,
}
impl Entry {
    fn folder(id: &str, title: &str, kind: &str) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            kind: kind.into(),
            ..Self::default()
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub entries: Vec<Entry>,
    pub next_offset: Option<usize>,
}
fn next_offset(offset: usize, returned: usize, limit: usize, total: Option<u64>) -> Option<usize> {
    if returned == 0 {
        return None;
    }
    let next = offset.checked_add(returned)?;
    if total.map_or(returned >= limit, |total| (next as u64) < total) {
        Some(next)
    } else {
        None
    }
}
fn page(entries: Vec<Entry>, offset: usize, limit: usize) -> Page {
    let next_offset = (entries.len() == limit).then_some(offset + entries.len());
    Page {
        entries,
        next_offset,
    }
}
fn text(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or_default().to_string()
}
fn array(v: &Value, key: &str) -> Vec<Value> {
    v[key].as_array().cloned().unwrap_or_default()
}
fn client() -> Result<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not start network client".into())
}
fn url(base: &str, path: &str) -> Result<Url> {
    let parsed = Url::parse(base.trim()).map_err(|_| "Enter a valid server URL")?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(
            "Use an http:// or https:// server URL without credentials or query parameters".into(),
        );
    }
    Url::parse(&format!(
        "{}/{}",
        base.trim().trim_end_matches('/'),
        path.trim_start_matches('/')
    ))
    .map_err(|_| "Invalid server URL".into())
}
fn response(request: reqwest::blocking::RequestBuilder) -> Result<reqwest::blocking::Response> {
    let res = request.send().map_err(|e| {
        if e.is_timeout() {
            "Server timed out"
        } else {
            "Could not reach server. Check its address and your network."
        }
        .to_string()
    })?;
    match res.status().as_u16() {
        200..=299 => Ok(res),
        401 | 403 => Err("Server refused access. Check your username and password.".into()),
        n => Err(format!("Server returned HTTP {n}")),
    }
}
fn json_response(request: reqwest::blocking::RequestBuilder) -> Result<Value> {
    response(request)?
        .json()
        .map_err(|_| "Server returned an invalid response".into())
}
fn run(input: Value) -> Result<Value> {
    let cmd = text(&input, "cmd");
    if cmd == "searchIndex" || cmd == "indexStatus" {
        let configs: Vec<Config> = serde_json::from_value(input["configs"].clone())
            .map_err(|_| "Invalid search libraries")?;
        let path = text(&input, "indexPath");
        return if cmd == "indexStatus" {
            index::status(&path, &configs)
        } else {
            index::search(
                &path,
                &configs,
                &text(&input, "query"),
                &text(&input, "kind"),
                input["offset"].as_u64().unwrap_or(0).min(10_000_000) as usize,
            )
        };
    }
    if cmd == "removeIndex" {
        return index::remove(&text(&input, "indexPath"), &text(&input, "sourceId"));
    }
    if cmd == "discover" {
        let devices = match input["kind"].as_str().unwrap_or("upnp") {
            "upnp" => upnp::discover()?,
            "kodi" => kodi_discovery::discover()?,
            _ => return Err("Discovery is not supported for this library type".into()),
        };
        return Ok(json!({"devices":devices}));
    }
    let mut c: Config =
        serde_json::from_value(input["config"].clone()).map_err(|_| "Invalid library settings")?;
    if !["navidrome", "jellyfin", "upnp", "kodi", "plex"].contains(&c.kind.as_str()) {
        return Err("Unsupported library type".into());
    }
    if cmd == "indexStart" {
        return index::start(
            &text(&input, "indexPath"),
            c,
            input["force"].as_bool().unwrap_or(false),
            input["reset"].as_bool().unwrap_or(false),
        );
    }
    if cmd == "artistArtwork" {
        return Ok(
            json!({"url": http::artist_artwork(&c, &text(&input, "id"), &text(&input, "artist")).ok().flatten()}),
        );
    }
    if cmd == "connect" {
        c.base_url = c.base_url.trim().trim_end_matches('/').to_owned();
        match c.kind.as_str() {
            "upnp" => upnp::connect(&mut c)?,
            _ => http::connect(&mut c)?,
        }
        return Ok(json!({"config":c}));
    }
    if cmd == "playlistOperation" {
        return http::playlist_operation(&c, &input);
    }
    if cmd == "addToPlaylist" {
        let playlist = text(&input, "playlistId");
        let track = text(&input, "id");
        if playlist.is_empty() || track.is_empty() {
            return Err("Choose a playlist and track".into());
        }
        match c.kind.as_str() {
            "upnp" => upnp::add_to_playlist(&c, &playlist, &track)?,
            _ => http::add_to_playlist(&c, &playlist, &track)?,
        }
        return Ok(json!({}));
    }
    if cmd == "writablePlaylists" {
        let offset = input["offset"].as_u64().unwrap_or(0).min(1_000_000) as usize;
        let result = match c.kind.as_str() {
            "upnp" => upnp::playlist_destinations(&c, &text(&input, "id"), offset)?,
            _ => http::writable_playlists(&c, offset)?,
        };
        return serde_json::to_value(result).map_err(|_| "Could not read playlists".into());
    }
    if cmd == "stream" {
        let id = text(&input, "id");
        let stream = match c.kind.as_str() {
            "upnp" => upnp::stream(&c, &id)?,
            _ => http::stream(&c, &id)?,
        };
        return Ok(json!({"url":stream}));
    }
    if cmd != "browse" {
        return Err("Unknown library operation".into());
    }
    let id = text(&input, "id");
    let query = text(&input, "query");
    let offset = input["offset"].as_u64().unwrap_or(0).min(1_000_000) as usize;
    let limit = input["limit"].as_u64().unwrap_or(100).clamp(1, 200) as usize;
    let result = match c.kind.as_str() {
        "upnp" => upnp::browse(&c, &id, offset, limit)?,
        _ => http::browse(&c, &id, &query, offset, limit)?,
    };
    serde_json::to_value(result).map_err(|_| "Could not read library".into())
}
pub fn handle(input: &str) -> String {
    let result = serde_json::from_str(input)
        .map_err(|_| "Invalid library request".to_string())
        .and_then(run);
    match result {
        Ok(mut v) => {
            v["ok"] = json!(true);
            v.to_string()
        }
        Err(error) => json!({"ok":false,"error":error}).to_string(),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pagination_uses_returned_count_and_stops_without_progress() {
        assert_eq!(next_offset(0, 20, 100, Some(250)), Some(20));
        assert_eq!(next_offset(200, 50, 100, Some(250)), None);
        assert_eq!(next_offset(20, 0, 100, Some(250)), None);
        assert_eq!(next_offset(0, 100, 100, None), Some(100));
        assert_eq!(next_offset(100, 3, 100, None), None);
    }
    #[test]
    fn rejects_embedded_secrets_and_non_http() {
        for base in [
            "file:///etc",
            "https://user:secret@server",
            "https://server?token=x",
        ] {
            assert!(url(base, "path").is_err());
        }
        assert_eq!(
            url("https://host/subsonic/", "rest/ping").unwrap().path(),
            "/subsonic/rest/ping"
        );
    }
    #[test]
    fn malformed_request_does_not_panic() {
        assert_eq!(
            serde_json::from_str::<Value>(&handle("no")).unwrap()["ok"],
            false
        );
    }
}

#[cfg(test)]
mod protocol_tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    pub(super) fn server(bodies: Vec<&str>) -> (String, std::thread::JoinHandle<Vec<String>>) {
        let socket = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", socket.local_addr().unwrap());
        let origin = base.clone();
        let bodies: Vec<String> = bodies.into_iter().map(str::to_owned).collect();
        let worker = std::thread::spawn(move || {
            let mut requests = vec![];
            for body in bodies {
                let (mut stream, _) = socket.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut request = String::new();
                let mut length = 0;
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    if line == "\r\n" {
                        break;
                    }
                    if let Some((name, value)) = line.split_once(':') {
                        if name.eq_ignore_ascii_case("content-length") {
                            length = value.trim().parse().unwrap();
                        }
                    }
                    request.push_str(&line);
                }
                let mut payload = vec![0; length];
                reader.read_exact(&mut payload).unwrap();
                request.push_str(&String::from_utf8_lossy(&payload));
                requests.push(request);
                let body = body.replace("%BASE%", &origin);
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
            }
            requests
        });
        (base, worker)
    }
    #[test]
    fn upnp_removal_refuses_original_media() {
        let (base, worker) = server(vec![
            r#"<root><service><serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType><SCPDURL>/scpd</SCPDURL></service></root>"#,
            r#"<scpd><actionList><action><name>DestroyObject</name></action></actionList></scpd>"#,
            r#"<BrowseResponse><Result>&lt;DIDL-Lite&gt;&lt;item id="song" parentID="mix" restricted="0" /&gt;&lt;/DIDL-Lite&gt;</Result></BrowseResponse>"#,
        ]);
        let c = Config {
            kind: "upnp".into(),
            base_url: base.clone(),
            control_url: format!("{base}/control"),
            service_type: "urn:schemas-upnp-org:service:ContentDirectory:1".into(),
            ..Config::default()
        };
        let error = upnp::playlist_operation(
            &c,
            &json!({"operation":"remove","playlistId":"mix","entryId":"song"}),
        )
        .unwrap_err();
        assert!(error.contains("source media"));
        let requests = worker.join().unwrap();
        assert_eq!(requests.len(), 3);
        assert!(!requests.iter().any(|r| r.contains("#DestroyObject")));
    }
    #[test]
    fn upnp_playlist_capabilities_and_reference_addition() {
        let (base, worker) = server(vec![
            r#"<root><service><serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType><SCPDURL>/scpd</SCPDURL></service></root>"#,
            r#"<scpd><actionList><action><name>CreateReference</name></action><action><name>CreateObject</name></action></actionList></scpd>"#,
            r#"<BrowseResponse><Result>&lt;DIDL-Lite xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;&lt;container id="mix" restricted="0"&gt;&lt;upnp:class&gt;object.container.playlistContainer&lt;/upnp:class&gt;&lt;/container&gt;&lt;/DIDL-Lite&gt;</Result><NumberReturned>1</NumberReturned><TotalMatches>1</TotalMatches></BrowseResponse>"#,
            r#"<CreateReferenceResponse><NewID>ref1</NewID></CreateReferenceResponse>"#,
        ]);
        let c = Config {
            kind: "upnp".into(),
            base_url: base.clone(),
            control_url: format!("{base}/control"),
            service_type: "urn:schemas-upnp-org:service:ContentDirectory:1".into(),
            ..Config::default()
        };
        let caps = upnp::playlist_operation(&c, &json!({"operation":"capabilities"})).unwrap();
        assert_eq!(caps["add"], true);
        assert_eq!(caps["create"], true);
        assert_eq!(caps["delete"], false);
        assert_eq!(caps["move"], false);
        upnp::add_to_playlist(&c, "mix", "song&1").unwrap();
        let requests = worker.join().unwrap();
        assert!(requests[3].contains("#CreateReference"));
        assert!(requests[3].contains("<ObjectID>song&amp;1</ObjectID>"));
    }
    #[test]
    fn subsonic_reorder_posts_complete_sequence_including_duplicates() {
        let (base, worker) = server(vec![
            r#"{"subsonic-response":{"status":"ok","playlist":{"entry":[{"id":"a"},{"id":"b"},{"id":"a"}]}}}"#,
            r#"{"subsonic-response":{"status":"ok"}}"#,
        ]);
        let c = Config {
            kind: "navidrome".into(),
            base_url: base,
            ..Config::default()
        };
        http::playlist_operation(
            &c,
            &json!({"operation":"move","playlistId":"mix","id":"b","position":1,"target":0}),
        )
        .unwrap();
        let requests = worker.join().unwrap();
        assert!(requests[1].starts_with("POST /rest/createPlaylist.view?"));
        assert!(requests[1].contains("playlistId=mix&songId=b&songId=a&songId=a"));
    }
    #[test]
    fn playlist_mutations_use_provider_ids_and_keep_duplicate_entries() {
        let (base, worker) = server(vec![
            r#"{"subsonic-response":{"status":"ok","playlist":{"id":"mix"}}}"#,
            r#"{"subsonic-response":{"status":"ok"}}"#,
            r#"{"subsonic-response":{"status":"ok","playlist":{"entry":[{"id":"s","title":"Same"},{"id":"s","title":"Same"}]}}}"#,
            r#"{"subsonic-response":{"status":"ok","playlist":{"entry":[{"id":"s"},{"id":"s"}]}}}"#,
            r#"{"subsonic-response":{"status":"ok"}}"#,
            r#"{"subsonic-response":{"status":"ok"}}"#,
            r#"{"subsonic-response":{"status":"ok"}}"#,
        ]);
        let c = Config {
            kind: "navidrome".into(),
            base_url: base,
            username: "me".into(),
            ..Config::default()
        };
        assert_eq!(
            http::playlist_operation(&c, &json!({"operation":"create","name":"My mix"})).unwrap()
                ["playlistId"],
            "playlist:mix"
        );
        http::add_to_playlist(&c, "playlist:mix", "s").unwrap();
        let items = http::playlist_operation(
            &c,
            &json!({"operation":"items","playlistId":"playlist:mix"}),
        )
        .unwrap();
        assert_eq!(items["entries"][0]["entryId"], "0");
        assert_eq!(items["entries"][1]["entryId"], "1");
        http::playlist_operation(
            &c,
            &json!({"operation":"remove","playlistId":"playlist:mix","id":"s","position":1}),
        )
        .unwrap();
        http::playlist_operation(
            &c,
            &json!({"operation":"rename","playlistId":"playlist:mix","name":"New mix"}),
        )
        .unwrap();
        http::playlist_operation(
            &c,
            &json!({"operation":"delete","playlistId":"playlist:mix"}),
        )
        .unwrap();
        let requests = worker.join().unwrap();
        assert!(requests[0].contains("createPlaylist.view"));
        assert!(requests[1].contains("songIdToAdd=s"));
        assert!(requests[4].contains("songIndexToRemove=1"));
        assert!(requests[5].contains("name=New+mix"));
        assert!(requests[6].contains("deletePlaylist.view"));
    }
    #[test]
    fn jellyfin_and_plex_playlist_writes_use_occurrence_ids() {
        let (base, worker) = server(vec![
            r#"{"Id":"mix"}"#,
            "",
            "",
            "",
            "",
            "",
            r#"{"MediaContainer":{"machineIdentifier":"machine"}}"#,
            "",
            "",
            "",
            "",
        ]);
        let mut c = Config {
            kind: "jellyfin".into(),
            base_url: base,
            user_id: "user".into(),
            token: "secret".into(),
            ..Config::default()
        };
        http::playlist_operation(&c, &json!({"operation":"create","name":"Mix"})).unwrap();
        http::add_to_playlist(&c, "playlist:mix", "song").unwrap();
        http::playlist_operation(
            &c,
            &json!({"operation":"rename","playlistId":"mix","name":"New"}),
        )
        .unwrap();
        http::playlist_operation(
            &c,
            &json!({"operation":"remove","playlistId":"mix","entryId":"occurrence","position":0}),
        )
        .unwrap();
        http::playlist_operation(&c,&json!({"operation":"move","playlistId":"mix","entryId":"occurrence","position":1,"target":0})).unwrap();
        http::playlist_operation(&c, &json!({"operation":"delete","playlistId":"mix"})).unwrap();
        c.kind = "plex".into();
        http::add_to_playlist(&c, "playlist:12", "34").unwrap();
        http::playlist_operation(
            &c,
            &json!({"operation":"remove","playlistId":"12","entryId":"77","position":0}),
        )
        .unwrap();
        http::playlist_operation(
            &c,
            &json!({"operation":"move","playlistId":"12","entryId":"88","position":1,"target":0}),
        )
        .unwrap();
        http::playlist_operation(&c, &json!({"operation":"delete","playlistId":"12"})).unwrap();
        let requests = worker.join().unwrap();
        assert!(requests[0].contains("POST /Playlists "));
        assert!(requests[1].contains("POST /Playlists/mix/Items?Ids=song&UserId=user"));
        assert!(requests[2].contains(r#"{"Name":"New"}"#));
        assert!(requests[3].contains("DELETE /Playlists/mix/Items?EntryIds=occurrence"));
        assert!(requests[4].contains("/Items/occurrence/Move/0"));
        assert!(requests[5].contains("DELETE /Items/mix"));
        assert!(requests[7].contains("PUT /playlists/12/items?uri=server%3A%2F%2Fmachine"));
        assert!(requests[8].contains("DELETE /playlists/12/items/77"));
        assert!(requests[9].contains("/items/88/move?after=0"));
        assert!(requests[10].contains("DELETE /playlists/12"));
    }
    #[test]
    fn playlist_edit_rejects_changed_position_and_unsupported_kodi_creation() {
        let (base, worker) = server(vec![
            r#"{"subsonic-response":{"status":"ok","playlist":{"entry":[{"id":"changed"}]}}}"#,
        ]);
        let mut c = Config {
            kind: "navidrome".into(),
            base_url: base,
            ..Config::default()
        };
        assert!(http::playlist_operation(
            &c,
            &json!({"operation":"remove","playlistId":"mix","id":"old","position":0})
        )
        .unwrap_err()
        .contains("Playlist changed"));
        assert_eq!(worker.join().unwrap().len(), 1);
        c.kind = "kodi".into();
        assert!(http::playlist_operation(&c, &json!({"operation":"create","name":"Mix"})).is_err());
        assert!(http::add_to_playlist(&c, "../bad", "s").is_err());
    }
    #[test]
    fn subsonic_auth_paging_and_stream() {
        let (base, worker) = server(vec![
            r#"{"subsonic-response":{"status":"ok"}}"#,
            r#"{"subsonic-response":{"status":"ok","searchResult3":{"song":[{"id":"one","title":"One","artist":"Artist","duration":62,"coverArt":"cover"}]}}}"#,
        ]);
        let mut c = Config {
            kind: "navidrome".into(),
            base_url: base,
            username: "user".into(),
            password: "a&b".into(),
            ..Config::default()
        };
        http::connect(&mut c).unwrap();
        let page = http::browse(&c, "tracks", "", 20, 1).unwrap();
        assert_eq!(page.next_offset, Some(21));
        assert_eq!(page.entries[0].duration_ms, 62000);
        let u = Url::parse(&http::stream(&c, "one & two").unwrap()).unwrap();
        assert!(u.query_pairs().any(|(k, v)| k == "id" && v == "one & two"));
        let requests = worker.join().unwrap();
        assert!(requests[1].contains("songOffset=20"));
        assert!(!requests.join("").contains("a%26b"));
    }
    #[test]
    fn jellyfin_connect_and_audio_listing() {
        let (base, worker) = server(vec![
            r#"{"AccessToken":"secret","User":{"Id":"user1"}}"#,
            r#"{"Items":[{"Id":"song","Name":"Song","Type":"Audio","Artists":["Singer"],"RunTimeTicks":30000000,"AlbumId":"cover-album"}],"TotalRecordCount":1}"#,
        ]);
        let mut c = Config {
            kind: "jellyfin".into(),
            id: "device".into(),
            base_url: base,
            username: "user".into(),
            password: "password".into(),
            ..Config::default()
        };
        http::connect(&mut c).unwrap();
        assert_eq!(c.token, "secret");
        assert!(c.password.is_empty());
        let page = http::browse(&c, "album", "", 0, 100).unwrap();
        assert_eq!(page.entries[0].duration_ms, 3000);
        assert!(page.entries[0]
            .art
            .as_ref()
            .unwrap()
            .contains("Items/cover-album/Images/Primary"));
        assert_eq!(page.next_offset, None);
        let requests = worker.join().unwrap();
        assert!(requests[0].contains("AuthenticateByName"));
        assert!(requests[1].contains("ParentId=album"));
        assert!(requests[1].contains("x-emby-token: secret"));
    }
    #[test]
    fn provider_artist_artwork_and_album_covers() {
        let (base, worker) = server(vec![
            r#"{"subsonic-response":{"status":"ok","artists":{"index":[{"artist":[{"id":"a","name":"Singer","artistImageUrl":"https://images.example/artist.jpg"}]}]}}}"#,
            r#"{"Items":[{"Id":"a","Name":"Singer","Type":"MusicArtist","ImageTags":{"Primary":"tag"}}],"TotalRecordCount":1}"#,
            r#"{"Items":[{"Id":"album","Name":"Album","Type":"MusicAlbum","IsFolder":true,"ImageTags":{"Primary":"tag"}}],"TotalRecordCount":1}"#,
            r#"{"result":{"artists":[{"artistid":1,"label":"Singer","thumbnail":"image://artist.jpg/"}],"limits":{"total":1}}}"#,
            r#"{"MediaContainer":{"Metadata":[{"ratingKey":"a","title":"Singer","type":"artist","thumb":"/library/metadata/a/thumb"}],"totalSize":1}}"#,
        ]);
        let mut c = Config {
            base_url: base,
            kind: "navidrome".into(),
            token: "secret".into(),
            user_id: "u".into(),
            ..Config::default()
        };
        let artist = &http::browse(&c, "artists", "", 0, 100).unwrap().entries[0];
        assert_eq!(artist.kind, "artist");
        assert_eq!(
            artist.art.as_deref(),
            Some("https://images.example/artist.jpg")
        );
        c.kind = "jellyfin".into();
        let artist = &http::browse(&c, "artists", "", 0, 100).unwrap().entries[0];
        assert_eq!(artist.id, "artist:a");
        assert_eq!(artist.kind, "artist");
        assert!(artist
            .art
            .as_ref()
            .unwrap()
            .contains("Items/a/Images/Primary"));
        let album = &http::browse(&c, "artist:a", "", 0, 100).unwrap().entries[0];
        assert_eq!(album.kind, "album");
        assert!(album
            .art
            .as_ref()
            .unwrap()
            .contains("Items/album/Images/Primary"));
        c.kind = "kodi".into();
        let artist = &http::browse(&c, "artists", "", 0, 100).unwrap().entries[0];
        assert_eq!(artist.kind, "artist");
        assert!(artist.art.as_ref().unwrap().contains("/image/"));
        c.kind = "plex".into();
        let artist = &http::browse(&c, "artists:1", "", 0, 100).unwrap().entries[0];
        assert_eq!(artist.kind, "artist");
        assert!(artist.art.as_ref().unwrap().contains("X-Plex-Token=secret"));
        let requests = worker.join().unwrap();
        assert!(requests[1].starts_with("GET /Artists?"));
        assert!(requests[2].contains("ArtistIds=a"));
        assert!(requests[4].contains("type=8"));
    }
    #[test]
    fn favorites_and_playlist_tabs_use_provider_endpoints() {
        let (base, worker) = server(vec![
            r#"{"subsonic-response":{"status":"ok","starred2":{"song":[{"id":"s","title":"Favorite"}]}}}"#,
            r#"{"Items":[{"Id":"p","Name":"Mix","Type":"Playlist","IsFolder":true}],"TotalRecordCount":1}"#,
            r#"{"Items":[{"Id":"s","Name":"Song","Type":"Audio"}],"TotalRecordCount":1}"#,
            r#"{"MediaContainer":{"Metadata":[{"ratingKey":"p","title":"Mix","type":"playlist"}],"totalSize":1}}"#,
            r#"{"MediaContainer":{"Metadata":[{"ratingKey":"s","title":"Song","type":"track"}],"totalSize":1}}"#,
        ]);
        let mut c = Config {
            base_url: base,
            kind: "navidrome".into(),
            user_id: "u".into(),
            ..Config::default()
        };
        assert_eq!(
            http::browse(&c, "favorites", "", 0, 100).unwrap().entries[0].title,
            "Favorite"
        );
        c.kind = "jellyfin".into();
        assert_eq!(
            http::browse(&c, "playlists", "", 0, 100).unwrap().entries[0].id,
            "playlist:p"
        );
        assert_eq!(
            http::browse(&c, "playlist:p", "", 0, 100).unwrap().entries[0].kind,
            "track"
        );
        c.kind = "plex".into();
        assert_eq!(
            http::browse(&c, "playlists:1", "", 0, 100).unwrap().entries[0].id,
            "playlist:p"
        );
        assert_eq!(
            http::browse(&c, "playlist:p", "", 0, 100).unwrap().entries[0].kind,
            "track"
        );
        let requests = worker.join().unwrap();
        assert!(requests[0].contains("getStarred2"));
        assert!(requests[1].contains("IncludeItemTypes=Playlist"));
        assert!(requests[2].contains("/Playlists/p/Items"));
        assert!(requests[3].contains("playlistType=audio"));
        assert!(requests[4].contains("/playlists/p/items"));
    }
    #[test]
    fn kodi_tracks_and_encoded_file_stream() {
        let (base, worker) = server(vec![
            r#"{"result":{"songs":[{"file":"smb://nas/My Music/track.flac","label":"Song","artist":["Band"],"duration":120}],"limits":{"total":1}}}"#,
        ]);
        let c = Config {
            kind: "kodi".into(),
            base_url: base,
            username: "kodi".into(),
            password: "secret".into(),
            ..Config::default()
        };
        let page = http::browse(&c, "tracks", "", 0, 100).unwrap();
        let stream = http::stream(&c, &page.entries[0].id).unwrap();
        assert!(stream.contains("/vfs/smb:%2F%2Fnas%2FMy%20Music%2Ftrack.flac"));
        assert!(worker.join().unwrap()[0].contains("AudioLibrary.GetSongs"));
    }
    #[test]
    fn plex_multiple_music_sections_and_stream_resolution() {
        let (base, worker) = server(vec![
            r#"{"MediaContainer":{"Directory":[{"key":"1","title":"Music","type":"artist"},{"key":"2","title":"Films","type":"movie"},{"key":"3","title":"More music","type":"artist"}]}}"#,
            r#"{"MediaContainer":{"Metadata":[{"Media":[{"Part":[{"key":"/library/parts/1/file.flac"}]}]}]}}"#,
        ]);
        let c = Config {
            kind: "plex".into(),
            base_url: base,
            token: "plex-secret".into(),
            ..Config::default()
        };
        let page = http::browse(&c, "", "", 0, 100).unwrap();
        assert_eq!(page.entries.len(), 2);
        assert_eq!(page.entries[1].id, "section:3");
        let stream = http::stream(&c, "song").unwrap();
        assert!(stream.contains("/library/parts/1/file.flac?X-Plex-Token=plex-secret"));
        let requests = worker.join().unwrap();
        assert!(requests[0].contains("accept: application/json"));
        assert!(requests[1].contains("/library/metadata/song"));
    }
    #[test]
    fn upnp_relative_control_url_and_mixed_media_pagination() {
        let (base, worker) = server(vec![
            r#"<root><device><friendlyName>Living room</friendlyName><serviceList><service><serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType><controlURL>/control</controlURL></service></serviceList></device></root>"#,
            r#"<Envelope><BrowseResponse><Result>&lt;DIDL-Lite&gt;&lt;item id="song"&gt;&lt;title&gt;A &amp;amp; B&lt;/title&gt;&lt;res protocolInfo="http-get:*:audio/flac:*" duration="00:03:00"&gt;%BASE%/music.flac&lt;/res&gt;&lt;/item&gt;&lt;item id="video"&gt;&lt;res protocolInfo="http-get:*:video/mp4:*"&gt;%BASE%/movie.mp4&lt;/res&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</Result><NumberReturned>2</NumberReturned><TotalMatches>5</TotalMatches></BrowseResponse></Envelope>"#,
        ]);
        let mut c = Config {
            kind: "upnp".into(),
            base_url: format!("{base}/device/description.xml"),
            ..Config::default()
        };
        upnp::connect(&mut c).unwrap();
        assert_eq!(c.control_url, format!("{base}/control"));
        assert_eq!(c.name, "Living room");
        let page = upnp::browse(&c, "0", 0, 2).unwrap();
        assert_eq!(page.entries.len(), 1);
        assert_eq!(page.entries[0].title, "A & B");
        assert_eq!(page.next_offset, Some(2));
        assert!(worker.join().unwrap()[1].contains("<RequestedCount>2</RequestedCount>"));
    }
}
