use super::*;
fn sub_url(c: &Config, endpoint: &str, params: &[(&str, &str)]) -> Result<Url> {
    let mut u = url(&c.base_url, &format!("rest/{endpoint}.view"))?;
    let salt = format!(
        "{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let token = format!("{:x}", md5::compute(format!("{}{salt}", c.password)));
    u.query_pairs_mut()
        .extend_pairs([
            ("u", c.username.as_str()),
            ("t", &token),
            ("s", &salt),
            ("v", "1.16.1"),
            ("c", "Rocksky"),
            ("f", "json"),
        ])
        .extend_pairs(params.iter().copied());
    Ok(u)
}
fn sub(c: &Config, endpoint: &str, params: &[(&str, &str)]) -> Result<Value> {
    let data = json_response(client()?.get(sub_url(c, endpoint, params)?))?;
    let body = &data["subsonic-response"];
    if body["status"] != "ok" {
        return Err("Subsonic request failed. Check your login and server compatibility.".into());
    }
    Ok(body.clone())
}
fn jf(c: &Config, path: &str, params: &[(&str, &str)]) -> Result<Value> {
    let mut u = url(&c.base_url, path)?;
    u.query_pairs_mut().extend_pairs(params.iter().copied());
    json_response(client()?.get(u).header("X-Emby-Token", &c.token))
}
fn kodi(c: &Config, method: &str, params: Value) -> Result<Value> {
    let r = json_response(
        client()?
            .post(url(&c.base_url, "jsonrpc")?)
            .basic_auth(&c.username, Some(&c.password))
            .json(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params})),
    )?;
    if !r["error"].is_null() {
        return Err("Kodi could not complete this request. Check its web-server settings.".into());
    }
    Ok(r["result"].clone())
}
pub fn connect(c: &mut Config) -> Result<()> {
    url(&c.base_url, "")?;
    match c.kind.as_str() {
        "navidrome" => {
            sub(c, "ping", &[])?;
        }
        "jellyfin" => {
            if !c.token.is_empty() && c.password.is_empty() {
                jf(c, "Users/Me", &[])?;
                return Ok(());
            }
            let auth = json_response(client()?.post(url(&c.base_url,"Users/AuthenticateByName")?)
                .header("X-Emby-Authorization", format!("MediaBrowser Client=\"Rocksky\", Device=\"Android\", DeviceId=\"{}\", Version=\"1\"",c.id))
                .json(&json!({"Username":c.username,"Pw":c.password})))?;
            c.token = text(&auth, "AccessToken");
            c.user_id = text(&auth["User"], "Id");
            if c.token.is_empty() || c.user_id.is_empty() {
                return Err("Jellyfin did not return a valid session".into());
            }
            c.password.clear();
        }
        "kodi" => {
            kodi(c, "JSONRPC.Ping", json!({}))?;
        }
        "plex" => {
            if c.token.is_empty() {
                return Err("Enter your Plex token".into());
            }
            plex(c, "library/sections", &[])?;
        }
        _ => unreachable!(),
    }
    Ok(())
}
fn sub_entry(c: &Config, v: &Value, kind: &str) -> Entry {
    let id = text(v, "id");
    Entry {
        id: if kind == "track" {
            id
        } else {
            format!("{kind}:{id}")
        },
        kind: kind.into(),
        title: if kind == "track" {
            text(v, "title")
        } else {
            text(v, "name")
        },
        artist: text(v, "artist"),
        album: text(v, "album"),
        duration_ms: v["duration"].as_u64().unwrap_or(0) * 1000,
        art: (if kind == "artist" {
            v["artistImageUrl"]
                .as_str()
                .filter(|u| u.starts_with("https://") || u.starts_with("http://"))
                .map(str::to_owned)
        } else {
            None
        })
        .or_else(|| {
            v["coverArt"]
                .as_str()
                .and_then(|id| sub_url(c, "getCoverArt", &[("id", id), ("size", "300")]).ok())
                .map(|u| u.to_string())
        }),
    }
}
pub fn browse(c: &Config, id: &str, query: &str, offset: usize, limit: usize) -> Result<Page> {
    if c.kind == "navidrome" {
        return sub_browse(c, id, query, offset, limit);
    }
    if c.kind == "jellyfin" {
        return jf_browse(c, id, query, offset, limit);
    }
    if c.kind == "plex" {
        return plex_browse(c, id, query, offset, limit);
    }
    kodi_browse(c, id, query, offset, limit)
}
fn sub_browse(c: &Config, id: &str, query: &str, offset: usize, limit: usize) -> Result<Page> {
    if id.is_empty() && query.is_empty() {
        return Ok(Page {
            entries: vec![
                Entry::folder("tracks", "Tracks", "folder"),
                Entry::folder("albums", "Albums", "folder"),
                Entry::folder("artists", "Artists", "folder"),
                Entry::folder("playlists", "Playlists", "folder"),
            ],
            next_offset: None,
        });
    }
    let o = offset.to_string();
    let l = limit.to_string();
    let (values, kind, paged) = if id == "favorites" {
        let r = sub(c, "getStarred2", &[])?;
        let values = array(&r["starred2"], "song")
            .into_iter()
            .filter(|v| {
                query.is_empty()
                    || format!(
                        "{} {} {}",
                        text(v, "title"),
                        text(v, "artist"),
                        text(v, "album")
                    )
                    .to_lowercase()
                    .contains(&query.to_lowercase())
            })
            .collect();
        (values, "track", false)
    } else if (!query.is_empty() && id != "playlists") || id == "tracks" {
        let result_kind = if id == "albums" {
            "album"
        } else if id == "artists" {
            "artist"
        } else {
            "track"
        };
        let r = sub(
            c,
            "search3",
            &[
                ("query", query),
                ("songCount", if result_kind == "track" { &l } else { "0" }),
                ("songOffset", &o),
                ("albumCount", if result_kind == "album" { &l } else { "0" }),
                ("albumOffset", &o),
                (
                    "artistCount",
                    if result_kind == "artist" { &l } else { "0" },
                ),
                ("artistOffset", &o),
            ],
        )?;
        (
            array(
                &r["searchResult3"],
                if result_kind == "track" {
                    "song"
                } else {
                    result_kind
                },
            ),
            result_kind,
            true,
        )
    } else if id == "albums" {
        let r = sub(
            c,
            "getAlbumList2",
            &[("type", "alphabeticalByName"), ("size", &l), ("offset", &o)],
        )?;
        (array(&r["albumList2"], "album"), "album", true)
    } else if id == "artists" {
        let r = sub(c, "getArtists", &[])?;
        (
            array(&r["artists"], "index")
                .iter()
                .flat_map(|v| array(v, "artist"))
                .collect(),
            "artist",
            false,
        )
    } else if id == "playlists" {
        let r = sub(c, "getPlaylists", &[])?;
        (
            array(&r["playlists"], "playlist")
                .into_iter()
                .filter(|v| {
                    query.is_empty()
                        || text(v, "name")
                            .to_lowercase()
                            .contains(&query.to_lowercase())
                })
                .collect(),
            "playlist",
            false,
        )
    } else if let Some(id) = id.strip_prefix("album:") {
        let r = sub(c, "getAlbum", &[("id", id)])?;
        (array(&r["album"], "song"), "track", false)
    } else if let Some(id) = id.strip_prefix("artist:") {
        let r = sub(c, "getArtist", &[("id", id)])?;
        (array(&r["artist"], "album"), "album", false)
    } else if let Some(id) = id.strip_prefix("playlist:") {
        let r = sub(c, "getPlaylist", &[("id", id)])?;
        (array(&r["playlist"], "entry"), "track", false)
    } else {
        return Err("Unknown library folder".into());
    };
    let entries: Vec<_> = values.iter().map(|v| sub_entry(c, v, kind)).collect();
    Ok(if paged {
        page(entries, offset, limit)
    } else {
        let total = entries.len();
        Page {
            entries: entries.into_iter().skip(offset).take(limit).collect(),
            next_offset: (offset + limit < total).then_some(offset + limit),
        }
    })
}
fn jf_browse(c: &Config, id: &str, query: &str, offset: usize, limit: usize) -> Result<Page> {
    if id.is_empty() && query.is_empty() {
        return Ok(Page {
            entries: vec![
                Entry::folder("tracks", "Tracks", "folder"),
                Entry::folder("albums", "Albums", "folder"),
                Entry::folder("artists", "Artists", "folder"),
            ],
            next_offset: None,
        });
    }
    let o = offset.to_string();
    let l = limit.to_string();
    let mut params = vec![
        ("StartIndex", o.as_str()),
        ("Limit", l.as_str()),
        ("Fields", "AudioInfo"),
        ("SortBy", "SortName"),
        ("SortOrder", "Ascending"),
    ];
    if id == "favorites" {
        params.extend([
            ("Filters", "IsFavorite"),
            ("IncludeItemTypes", "Audio"),
            ("Recursive", "true"),
        ]);
        if !query.is_empty() {
            params.push(("SearchTerm", query));
        }
    } else if id == "playlists" {
        params.extend([
            ("IncludeItemTypes", "Playlist"),
            ("Recursive", "true"),
            ("MediaTypes", "Audio"),
        ]);
        if !query.is_empty() {
            params.push(("SearchTerm", query));
        }
    } else if id == "artists" {
        params.push(("Recursive", "true"));
        if !query.is_empty() {
            params.push(("SearchTerm", query));
        }
    } else if !query.is_empty() {
        params.extend([
            ("SearchTerm", query),
            (
                "IncludeItemTypes",
                if id == "albums" {
                    "MusicAlbum"
                } else {
                    "Audio"
                },
            ),
            ("Recursive", "true"),
        ]);
    } else if id == "albums" || id == "tracks" {
        params.extend([
            (
                "IncludeItemTypes",
                if id == "tracks" {
                    "Audio"
                } else {
                    "MusicAlbum"
                },
            ),
            ("Recursive", "true"),
        ]);
    } else if let Some(artist) = id.strip_prefix("artist:") {
        params.extend([
            ("ArtistIds", artist),
            ("IncludeItemTypes", "MusicAlbum"),
            ("Recursive", "true"),
        ]);
    } else if id.starts_with("playlist:") {
        params.push(("UserId", &c.user_id));
    } else if !id.is_empty() {
        params.push(("ParentId", id));
    } else {
        params.extend([("IncludeItemTypes", "MusicAlbum"), ("Recursive", "true")]);
    }
    let endpoint = if let Some(playlist) = id.strip_prefix("playlist:") {
        format!("Playlists/{playlist}/Items")
    } else if id == "artists" {
        params.push(("UserId", &c.user_id));
        "Artists".to_owned()
    } else {
        format!("Users/{}/Items", c.user_id)
    };
    let r = jf(c, &endpoint, &params)?;
    let raw = array(&r, "Items");
    let entries = raw
        .iter()
        .filter(|v| v["IsFolder"] == true || v["Type"] == "Audio" || v["Type"] == "MusicArtist")
        .map(|v| {
            let id = text(v, "Id");
            let kind = match v["Type"].as_str() {
                Some("MusicArtist") => "artist",
                Some("MusicAlbum") => "album",
                Some("Playlist") => "playlist",
                _ if v["IsFolder"] == true => "folder",
                _ => "track",
            };
            let image_id = if v["ImageTags"]["Primary"].is_string() {
                id.clone()
            } else {
                text(v, "AlbumId")
            };
            let art = if image_id.is_empty() {
                None
            } else {
                url(&c.base_url, &format!("Items/{image_id}/Images/Primary"))
                    .ok()
                    .map(|mut u| {
                        u.query_pairs_mut()
                            .extend_pairs([("api_key", c.token.as_str()), ("maxWidth", "300")]);
                        u.to_string()
                    })
            };
            Entry {
                id: if kind == "artist" || kind == "playlist" {
                    format!("{kind}:{id}")
                } else {
                    id
                },
                title: text(v, "Name"),
                kind: kind.into(),
                artist: array(v, "Artists")
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(", "),
                album: text(v, "Album"),
                duration_ms: v["RunTimeTicks"].as_u64().unwrap_or(0) / 10_000,
                art,
            }
        })
        .collect();
    Ok(Page {
        entries,
        next_offset: next_offset(offset, raw.len(), limit, r["TotalRecordCount"].as_u64()),
    })
}
fn kodi_browse(c: &Config, id: &str, query: &str, offset: usize, limit: usize) -> Result<Page> {
    if id == "playlists" {
        return Ok(Page {
            entries: if offset == 0 {
                vec![Entry::folder(
                    "playlist:0",
                    "Current music playlist (not saved)",
                    "playlist",
                )]
            } else {
                vec![]
            },
            next_offset: None,
        });
    }
    if id == "playlist:0" {
        let r = kodi(
            c,
            "Playlist.GetItems",
            json!({"playlistid":0,"properties":["title","artist","album","duration","file","thumbnail"],"limits":{"start":offset,"end":offset+limit}}),
        )?;
        let raw = array(&r, "items");
        return Ok(Page {
            entries: raw
                .iter()
                .map(|v| Entry {
                    id: text(v, "file"),
                    title: text(v, "label"),
                    kind: "track".into(),
                    artist: array(v, "artist")
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", "),
                    album: text(v, "album"),
                    duration_ms: v["duration"].as_u64().unwrap_or(0) * 1000,
                    art: if text(v, "thumbnail").is_empty() {
                        None
                    } else {
                        kodi_media(c, "image", &text(v, "thumbnail")).ok()
                    },
                })
                .collect(),
            next_offset: next_offset(offset, raw.len(), limit, r["limits"]["total"].as_u64()),
        });
    }
    if id.is_empty() && query.is_empty() {
        return Ok(Page {
            entries: vec![
                Entry::folder("tracks", "Tracks", "folder"),
                Entry::folder("albums", "Albums", "folder"),
                Entry::folder("artists", "Artists", "folder"),
            ],
            next_offset: None,
        });
    }
    let albums = id == "albums";
    let artists = id == "artists";
    let (method, key, properties) = if albums {
        (
            "AudioLibrary.GetAlbums",
            "albums",
            json!(["artist", "thumbnail"]),
        )
    } else if artists {
        ("AudioLibrary.GetArtists", "artists", json!(["thumbnail"]))
    } else {
        (
            "AudioLibrary.GetSongs",
            "songs",
            json!(["artist", "album", "duration", "file", "thumbnail"]),
        )
    };
    let mut params = json!({"limits":{"start":offset,"end":offset+limit},"sort":{"method":"label","order":"ascending"},"properties":properties});
    if let Some(album) = id.strip_prefix("album:") {
        params["filter"] = json!({"albumid":album.parse::<u64>().map_err(|_|"Invalid album")?});
    } else if let Some(artist) = id.strip_prefix("artist:") {
        params["filter"] = json!({"artistid":artist.parse::<u64>().map_err(|_|"Invalid artist")?});
    }
    if !query.is_empty() {
        params["filter"] = json!({"field":if artists { "artist" } else if albums { "album" } else { "title" },"operator":"contains","value":query});
    }
    let r = kodi(c, method, params)?;
    let raw = array(&r, key);
    let entries = raw
        .iter()
        .map(|v| Entry {
            id: if albums {
                format!("album:{}", v["albumid"])
            } else if artists {
                format!("artist:{}", v["artistid"])
            } else {
                text(v, "file")
            },
            title: text(v, "label"),
            kind: if artists {
                "artist"
            } else if albums {
                "album"
            } else {
                "track"
            }
            .into(),
            artist: array(v, "artist")
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(", "),
            album: text(v, "album"),
            duration_ms: v["duration"].as_u64().unwrap_or(0) * 1000,
            art: if text(v, "thumbnail").is_empty() {
                None
            } else {
                kodi_media(c, "image", &text(v, "thumbnail")).ok()
            },
        })
        .collect();
    Ok(Page {
        entries,
        next_offset: next_offset(offset, raw.len(), limit, r["limits"]["total"].as_u64()),
    })
}
fn kodi_media(c: &Config, prefix: &str, path: &str) -> Result<String> {
    let mut u = url(&c.base_url, prefix)?;
    u.path_segments_mut()
        .map_err(|_| "Invalid Kodi URL")?
        .push(path);
    u.set_username(&c.username)
        .map_err(|_| "Invalid Kodi username")?;
    u.set_password(Some(&c.password))
        .map_err(|_| "Invalid Kodi password")?;
    Ok(u.into())
}
pub fn stream(c: &Config, id: &str) -> Result<String> {
    match c.kind.as_str() {
        "navidrome" => Ok(sub_url(c, "stream", &[("id", id)])?.into()),
        "jellyfin" => {
            let mut u = url(&c.base_url, &format!("Audio/{id}/universal"))?;
            u.query_pairs_mut().extend_pairs([
                ("userId", c.user_id.as_str()),
                ("api_key", c.token.as_str()),
                ("container", "mp3,aac,m4a,flac,ogg,opus,wav"),
                ("transcodingContainer", "mp3"),
                ("audioCodec", "mp3"),
            ]);
            Ok(u.into())
        }
        "plex" => {
            let r = plex(c, &format!("library/metadata/{id}"), &[])?;
            let path = r["Metadata"][0]["Media"][0]["Part"][0]["key"]
                .as_str()
                .ok_or("Plex track has no playable file")?;
            plex_signed(c, path)
        }
        "kodi" => kodi_media(c, "vfs", id),
        _ => Err("Unsupported stream".into()),
    }
}

fn plex(c: &Config, path: &str, params: &[(&str, &str)]) -> Result<Value> {
    let mut u = url(&c.base_url, path)?;
    u.query_pairs_mut().extend_pairs(params.iter().copied());
    let r = json_response(
        client()?
            .get(u)
            .header("X-Plex-Token", &c.token)
            .header("Accept", "application/json"),
    )?;
    Ok(r["MediaContainer"].clone())
}
fn plex_signed(c: &Config, path: &str) -> Result<String> {
    if !path.starts_with('/') || path.starts_with("//") {
        return Err("Plex returned an invalid media path".into());
    }
    let mut u = url(&c.base_url, path)?;
    u.query_pairs_mut().append_pair("X-Plex-Token", &c.token);
    Ok(u.into())
}
fn plex_browse(c: &Config, id: &str, query: &str, offset: usize, limit: usize) -> Result<Page> {
    if id.is_empty() {
        let r = plex(c, "library/sections", &[])?;
        let entries = array(&r, "Directory")
            .iter()
            .filter(|v| v["type"] == "artist")
            .map(|v| {
                Entry::folder(
                    &format!("section:{}", text(v, "key")),
                    &text(v, "title"),
                    "folder",
                )
            })
            .collect();
        return Ok(Page {
            entries,
            next_offset: None,
        });
    }
    let o = offset.to_string();
    let l = limit.to_string();
    let mut params = vec![
        ("X-Plex-Container-Start", o.as_str()),
        ("X-Plex-Container-Size", l.as_str()),
    ];
    let path = if id.starts_with("playlists:") {
        params.push(("playlistType", "audio"));
        if !query.is_empty() {
            params.push(("title", query));
        }
        "playlists".to_owned()
    } else if let Some(playlist) = id.strip_prefix("playlist:") {
        format!("playlists/{playlist}/items")
    } else if let Some(section) = id.strip_prefix("tracks:") {
        params.push(("type", "10"));
        if !query.is_empty() {
            params.push(("title", query));
        }
        format!("library/sections/{section}/all")
    } else if let Some(section) = id.strip_prefix("artists:") {
        params.push(("type", "8"));
        if !query.is_empty() {
            params.push(("title", query));
        }
        format!("library/sections/{section}/all")
    } else if let Some(section) = id.strip_prefix("section:") {
        params.push(("type", "9"));
        if !query.is_empty() {
            params.push(("title", query));
        }
        format!("library/sections/{section}/all")
    } else {
        format!("library/metadata/{id}/children")
    };
    let r = plex(c, &path, &params)?;
    let raw = array(&r, "Metadata");
    let entries: Vec<Entry> = raw
        .iter()
        .filter(|v| {
            ["track", "album", "artist", "playlist"]
                .contains(&v["type"].as_str().unwrap_or_default())
        })
        .map(|v| {
            let track = v["type"] == "track";
            let thumb = v["thumb"].as_str().or(v["parentThumb"].as_str());
            Entry {
                id: if v["type"] == "playlist" {
                    format!("playlist:{}", text(v, "ratingKey"))
                } else {
                    text(v, "ratingKey")
                },
                title: text(v, "title"),
                kind: text(v, "type"),
                artist: text(
                    v,
                    if track {
                        "grandparentTitle"
                    } else {
                        "parentTitle"
                    },
                ),
                album: if track {
                    text(v, "parentTitle")
                } else {
                    String::new()
                },
                duration_ms: v["duration"].as_u64().unwrap_or(0),
                art: thumb.and_then(|p| plex_signed(c, p).ok()),
            }
        })
        .collect();
    Ok(Page {
        entries,
        next_offset: next_offset(offset, raw.len(), limit, r["totalSize"].as_u64()),
    })
}

/// Prefer artwork from the connected server. Public search is a separate fallback.
pub fn artist_artwork(c: &Config, track: &str, artist: &str) -> Result<Option<String>> {
    match c.kind.as_str() {
        "navidrome" => {
            let song = sub(c, "getSong", &[("id", track)])?;
            let id = text(&song["song"], "artistId");
            if id.is_empty() {
                return Ok(None);
            }
            let info = sub(c, "getArtist", &[("id", &id)])?;
            if let Some(url) = info["artist"]["artistImageUrl"]
                .as_str()
                .filter(|s| !s.is_empty())
            {
                return Ok(Some(url.into()));
            }
            let info = sub(c, "getArtistInfo2", &[("id", &id)])?;
            Ok(info["artistInfo2"]["largeImageUrl"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(str::to_owned))
        }
        "jellyfin" => {
            let item = jf(c, &format!("Users/{}/Items/{track}", c.user_id), &[])?;
            let id = item["ArtistItems"][0]["Id"].as_str().unwrap_or("");
            if id.is_empty() {
                return Ok(None);
            }
            let mut image = url(&c.base_url, &format!("Items/{id}/Images/Primary"))?;
            image
                .query_pairs_mut()
                .extend_pairs([("api_key", c.token.as_str()), ("maxWidth", "400")]);
            Ok(Some(image.into()))
        }
        "kodi" => {
            let result = kodi(
                c,
                "AudioLibrary.GetArtists",
                json!({"properties":["thumbnail"],"filter":{"field":"artist","operator":"is","value":artist},"limits":{"start":0,"end":10}}),
            )?;
            Ok(array(&result, "artists")
                .iter()
                .find(|v| text(v, "label").trim().eq_ignore_ascii_case(artist.trim()))
                .and_then(|v| v["thumbnail"].as_str())
                .filter(|s| !s.is_empty())
                .and_then(|s| kodi_media(c, "image", s).ok()))
        }
        "plex" => {
            let result = plex(c, &format!("library/metadata/{track}"), &[])?;
            Ok(result["Metadata"][0]["grandparentThumb"]
                .as_str()
                .and_then(|p| plex_signed(c, p).ok()))
        }
        _ => Ok(None),
    }
}

// List destinations on this server, never Rocksky or the phone's playlists.
pub fn writable_playlists(c: &Config, offset: usize) -> Result<Page> {
    match c.kind.as_str() {
        "navidrome" => {
            let r = sub(c, "getPlaylists", &[])?;
            let all: Vec<Entry> = array(&r["playlists"], "playlist")
                .iter()
                .filter(|v| {
                    v["readonly"] != true
                        && (text(v, "owner").is_empty() || text(v, "owner") == c.username)
                })
                .map(|v| sub_entry(c, v, "playlist"))
                .collect();
            let total = all.len();
            let entries: Vec<_> = all.into_iter().skip(offset).take(100).collect();
            Ok(Page {
                next_offset: next_offset(offset, entries.len(), 100, Some(total as u64)),
                entries,
            })
        }
        "jellyfin" => jf_browse(c, "playlists", "", offset, 100),
        "plex" => {
            let r = plex(
                c,
                "playlists",
                &[
                    ("playlistType", "audio"),
                    ("smart", "0"),
                    ("X-Plex-Container-Start", &offset.to_string()),
                    ("X-Plex-Container-Size", "100"),
                ],
            )?;
            let raw = array(&r, "Metadata");
            let entries = raw
                .iter()
                .filter(|v| v["smart"] != true && v["smart"] != 1)
                .map(|v| {
                    Entry::folder(
                        &format!("playlist:{}", text(v, "ratingKey")),
                        &text(v, "title"),
                        "playlist",
                    )
                })
                .collect();
            Ok(Page {
                next_offset: next_offset(offset, raw.len(), 100, r["totalSize"].as_u64()),
                entries,
            })
        }
        "kodi" => Ok(Page {
            entries: if offset == 0 {
                vec![Entry::folder(
                    "0",
                    "Current music playlist (not saved)",
                    "playlist",
                )]
            } else {
                vec![]
            },
            next_offset: None,
        }),
        _ => Err("This server does not support playlist editing".into()),
    }
}
fn playlist_id(id: &str) -> Result<&str> {
    let id = id.strip_prefix("playlist:").unwrap_or(id);
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid playlist ID".into());
    }
    Ok(id)
}
pub fn add_to_playlist(c: &Config, playlist: &str, track: &str) -> Result<()> {
    let id = playlist_id(playlist)?;
    match c.kind.as_str() {
        "navidrome" => {
            sub(
                c,
                "updatePlaylist",
                &[("playlistId", id), ("songIdToAdd", track)],
            )?;
        }
        "jellyfin" => {
            let mut u = url(&c.base_url, &format!("Playlists/{id}/Items"))?;
            u.query_pairs_mut()
                .extend_pairs([("Ids", track), ("UserId", &c.user_id)]);
            response(client()?.post(u).header("X-Emby-Token", &c.token))?;
        }
        "plex" => {
            let track = playlist_id(track)?;
            let info = plex(c, "identity", &[])?;
            let machine = text(&info, "machineIdentifier");
            if machine.is_empty() {
                return Err("Plex did not identify this server".into());
            }
            let mut u = url(&c.base_url, &format!("playlists/{id}/items"))?;
            u.query_pairs_mut().append_pair(
                "uri",
                &format!("server://{machine}/com.plexapp.plugins.library/library/metadata/{track}"),
            );
            response(client()?.put(u).header("X-Plex-Token", &c.token))?;
        }
        "kodi" => {
            if id != "0" {
                return Err("Kodi only supports its current music playlist".into());
            }
            kodi(
                c,
                "Playlist.Add",
                json!({"playlistid":0,"item":{"file":track}}),
            )?;
        }
        _ => return Err("This server does not support playlist editing".into()),
    }
    Ok(())
}

/// Playlist item IDs identify occurrences, so duplicate songs can be edited independently.
pub fn playlist_operation(c: &Config, input: &Value) -> Result<Value> {
    let op = text(input, "operation");
    let playlist = text(input, "playlistId");
    let name = text(input, "name").trim().to_string();
    if matches!(op.as_str(), "create" | "rename") && (name.is_empty() || name.chars().count() > 200)
    {
        return Err("Enter a playlist name (1–200 characters)".into());
    }
    if c.kind == "upnp" {
        return super::upnp::playlist_operation(c, input);
    }
    if op == "capabilities" {
        return Ok(
            json!({"create":c.kind!="kodi","rename":c.kind!="kodi","delete":true,"items":true,"move":true,"add":true}),
        );
    }
    if op == "create" {
        let id = match c.kind.as_str() {
            "navidrome" => text(&sub(c, "createPlaylist", &[("name", &name)])?["playlist"], "id"),
            "jellyfin" => text(&json_response(client()?.post(url(&c.base_url, "Playlists")?).header("X-Emby-Token", &c.token)
                .json(&json!({"Name":name,"UserId":c.user_id,"MediaType":"Audio","IsPublic":false})))?, "Id"),
            "plex" => {
                let mut u = url(&c.base_url, "playlists")?;
                u.query_pairs_mut().extend_pairs([("title", name.as_str()), ("type", "audio"), ("smart", "0")]);
                let r = json_response(client()?.post(u).header("X-Plex-Token", &c.token).header("Accept", "application/json"))?;
                text(&r["MediaContainer"]["Metadata"][0], "ratingKey")
            }
            _ => return Err("Kodi cannot create saved playlists through its remote API".into()),
        };
        return Ok(json!({"playlistId":format!("playlist:{id}")}));
    }
    let id = playlist_id(&playlist)?;
    if c.kind == "kodi" && id != "0" {
        return Err("Unknown Kodi playlist".into());
    }
    if op == "rename" {
        match c.kind.as_str() {
            "navidrome" => {
                sub(c, "updatePlaylist", &[("playlistId", id), ("name", &name)])?;
            }
            "jellyfin" => {
                response(
                    client()?
                        .post(url(&c.base_url, &format!("Playlists/{id}"))?)
                        .header("X-Emby-Token", &c.token)
                        .json(&json!({"Name":name})),
                )?;
            }
            "plex" => {
                let mut u = url(&c.base_url, &format!("playlists/{id}"))?;
                u.query_pairs_mut().append_pair("title", &name);
                response(client()?.put(u).header("X-Plex-Token", &c.token))?;
            }
            _ => return Err("This playlist cannot be renamed".into()),
        }
        return Ok(json!({}));
    }
    if op == "delete" {
        match c.kind.as_str() {
            "navidrome" => {
                sub(c, "deletePlaylist", &[("id", id)])?;
            }
            "jellyfin" => {
                response(
                    client()?
                        .delete(url(&c.base_url, &format!("Items/{id}"))?)
                        .header("X-Emby-Token", &c.token),
                )?;
            }
            "plex" => {
                response(
                    client()?
                        .delete(url(&c.base_url, &format!("playlists/{id}"))?)
                        .header("X-Plex-Token", &c.token),
                )?;
            }
            "kodi" => {
                kodi(c, "Playlist.Clear", json!({"playlistid":0}))?;
            }
            _ => return Err("This playlist cannot be deleted".into()),
        }
        return Ok(json!({}));
    }
    let offset = input["offset"].as_u64().unwrap_or(0) as usize;
    if op == "items" {
        let (raw, total) = match c.kind.as_str() {
            "navidrome" => {
                let raw = array(&sub(c, "getPlaylist", &[("id", id)])?["playlist"], "entry");
                let total = raw.len();
                (
                    raw.into_iter().skip(offset).take(100).collect::<Vec<_>>(),
                    Some(total as u64),
                )
            }
            "jellyfin" => {
                let r = jf(
                    c,
                    &format!("Playlists/{id}/Items"),
                    &[
                        ("UserId", &c.user_id),
                        ("StartIndex", &offset.to_string()),
                        ("Limit", "100"),
                    ],
                )?;
                (array(&r, "Items"), r["TotalRecordCount"].as_u64())
            }
            "plex" => {
                let r = plex(
                    c,
                    &format!("playlists/{id}/items"),
                    &[
                        ("X-Plex-Container-Start", &offset.to_string()),
                        ("X-Plex-Container-Size", "100"),
                    ],
                )?;
                (array(&r, "Metadata"), r["totalSize"].as_u64())
            }
            "kodi" => {
                let r = kodi(
                    c,
                    "Playlist.GetItems",
                    json!({"playlistid":0,"properties":["title","artist","file"],"limits":{"start":offset,"end":offset+100}}),
                )?;
                (array(&r, "items"), r["limits"]["total"].as_u64())
            }
            _ => return Err("Unsupported playlist".into()),
        };
        let entries:Vec<_>=raw.iter().enumerate().map(|(i,v)| {
            let (track, entry, title, artist)=match c.kind.as_str() {
                "navidrome" => (text(v,"id"),(offset+i).to_string(),text(v,"title"),text(v,"artist")),
                "jellyfin" => (text(v,"Id"),text(v,"PlaylistItemId"),text(v,"Name"),array(v,"Artists").iter().filter_map(Value::as_str).collect::<Vec<_>>().join(", ")),
                "plex" => (text(v,"ratingKey"),v["playlistItemID"].as_str().map(str::to_owned).unwrap_or_else(||v["playlistItemID"].to_string()),text(v,"title"),text(v,"grandparentTitle")),
                _ => (text(v,"file"),(offset+i).to_string(),text(v,"label"),array(v,"artist").iter().filter_map(Value::as_str).collect::<Vec<_>>().join(", ")),
            };
            json!({"id":track,"entryId":entry,"title":title,"artist":artist,"position":offset+i})
        }).collect();
        return Ok(json!({"entries":entries,"nextOffset":next_offset(offset,raw.len(),100,total)}));
    }
    let entry = text(input, "entryId");
    if op != "remove" && op != "move" {
        return Err("Unknown playlist operation".into());
    }
    let position = input["position"]
        .as_u64()
        .ok_or("Missing playlist position")? as usize;
    let target = input["target"].as_u64().unwrap_or(0) as usize;
    match c.kind.as_str() {
        "navidrome" => {
            let r = sub(c, "getPlaylist", &[("id", id)])?;
            let mut songs = array(&r["playlist"], "entry");
            if songs.get(position).map(|v| text(v, "id")) != Some(text(input, "id")) {
                return Err("Playlist changed. Refresh it and try again.".into());
            }
            if op == "remove" {
                sub(
                    c,
                    "updatePlaylist",
                    &[
                        ("playlistId", id),
                        ("songIndexToRemove", &position.to_string()),
                    ],
                )?;
            } else {
                if target >= songs.len() {
                    return Err("Invalid playlist position".into());
                }
                let moved = songs.remove(position);
                songs.insert(target, moved);
                let ids: Vec<_> = songs.iter().map(|v| text(v, "id")).collect();
                let mut params = vec![("playlistId", id)];
                params.extend(ids.iter().map(|id| ("songId", id.as_str())));
                let result = json_response(
                    client()?
                        .post(sub_url(c, "createPlaylist", &[])?)
                        .form(&params),
                )?;
                if result["subsonic-response"]["status"] != "ok" {
                    return Err("Could not reorder this playlist".into());
                }
            }
        }
        "jellyfin" => {
            let entry = playlist_id(&entry)?;
            let mut u = url(&c.base_url, &format!("Playlists/{id}/Items"))?;
            if op == "remove" {
                u.query_pairs_mut().append_pair("EntryIds", entry);
                response(client()?.delete(u).header("X-Emby-Token", &c.token))?;
            } else {
                response(
                    client()?
                        .post(url(
                            &c.base_url,
                            &format!("Playlists/{id}/Items/{entry}/Move/{target}"),
                        )?)
                        .header("X-Emby-Token", &c.token),
                )?;
            }
        }
        "plex" => {
            let entry = playlist_id(&entry)?;
            if op == "remove" {
                response(
                    client()?
                        .delete(url(&c.base_url, &format!("playlists/{id}/items/{entry}"))?)
                        .header("X-Plex-Token", &c.token),
                )?;
            } else {
                let after = text(input, "afterEntryId");
                let after = if target == 0 {
                    "0"
                } else {
                    playlist_id(&after)?
                };
                let mut u = url(&c.base_url, &format!("playlists/{id}/items/{entry}/move"))?;
                u.query_pairs_mut().append_pair("after", after);
                response(client()?.put(u).header("X-Plex-Token", &c.token))?;
            }
        }
        "kodi" => {
            let r = kodi(
                c,
                "Playlist.GetItems",
                json!({"playlistid":0,"properties":["file"],"limits":{"start":position,"end":position+1}}),
            )?;
            if text(&r["items"][0], "file") != text(input, "id") {
                return Err("Playlist changed. Refresh it and try again.".into());
            }
            if op == "remove" {
                kodi(
                    c,
                    "Playlist.Remove",
                    json!({"playlistid":0,"position":position}),
                )?;
            } else {
                kodi(
                    c,
                    "Playlist.Swap",
                    json!({"playlistid":0,"position1":position,"position2":target}),
                )?;
            }
        }
        _ => return Err("Unsupported playlist operation".into()),
    }
    Ok(json!({}))
}

pub fn indexed_cover(c: &Config, id: &str) -> Result<String> {
    Ok(sub_url(c, "getCoverArt", &[("id", id), ("size", "300")])?.into())
}
