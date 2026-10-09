use super::*;
use std::{collections::HashSet, net::UdpSocket, time::Instant};
fn tag<'a, 'input>(n: roxmltree::Node<'a, 'input>, name: &str) -> Option<&'a str> {
    n.children()
        .find(|n| n.is_element() && n.tag_name().name() == name)
        .and_then(|n| n.text())
}
fn xml(body: &str) -> Result<roxmltree::Document<'_>> {
    roxmltree::Document::parse(body).map_err(|_| "Server returned invalid XML".into())
}
fn get_text(u: &str) -> Result<String> {
    let parsed = Url::parse(u).map_err(|_| "Invalid device URL")?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Unsupported device URL".into());
    }
    let mut body = String::new();
    use std::io::Read;
    response(client()?.get(parsed))?
        .take(16 * 1024 * 1024)
        .read_to_string(&mut body)
        .map_err(|_| "Could not read device response")?;
    Ok(body)
}
pub fn connect(c: &mut Config) -> Result<()> {
    let body = get_text(&c.base_url)?;
    let doc = xml(&body)?;
    let service = doc
        .descendants()
        .find(|n| {
            n.is_element()
                && n.tag_name().name() == "service"
                && tag(*n, "serviceType").is_some_and(|s| s.contains(":ContentDirectory:"))
        })
        .ok_or("This device has no music ContentDirectory service")?;
    c.service_type = tag(service, "serviceType").unwrap().into();
    let base = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "URLBase")
        .and_then(|n| n.text())
        .filter(|v| !v.is_empty())
        .unwrap_or(&c.base_url);
    c.control_url = Url::parse(base)
        .and_then(|u| u.join(tag(service, "controlURL").unwrap_or_default()))
        .map_err(|_| "Invalid content-directory URL")?
        .into();
    if c.name.is_empty() {
        c.name = doc
            .descendants()
            .find(|n| n.is_element() && n.tag_name().name() == "friendlyName")
            .and_then(|n| n.text())
            .unwrap_or("Media server")
            .into();
    }
    Ok(())
}
pub fn discover() -> Result<Vec<Config>> {
    let socket =
        UdpSocket::bind("0.0.0.0:0").map_err(|_| "Could not start local-network discovery")?;
    socket
        .set_read_timeout(Some(Duration::from_millis(400)))
        .map_err(|_| "Could not configure discovery")?;
    socket
        .set_multicast_ttl_v4(2)
        .map_err(|_| "Could not configure discovery")?;
    let request="M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nST: urn:schemas-upnp-org:device:MediaServer:1\r\nMX: 2\r\n\r\n";
    socket
        .send_to(request.as_bytes(), "239.255.255.250:1900")
        .map_err(|_| "Could not search your network")?;
    let start = Instant::now();
    let mut locations = HashSet::new();
    let mut buf = [0; 8192];
    while start.elapsed() < Duration::from_secs(3) {
        if let Ok((n, _)) = socket.recv_from(&mut buf) {
            for line in String::from_utf8_lossy(&buf[..n]).lines() {
                if let Some((key, value)) = line.split_once(':') {
                    if key.eq_ignore_ascii_case("location") {
                        locations.insert(value.trim().to_string());
                    }
                }
            }
        }
        if locations.len() >= 20 {
            break;
        }
    }
    // Discovery returns description URLs immediately; connection validates the
    // device and reads its friendly name without serial network timeouts here.
    Ok(locations
        .into_iter()
        .map(|location| Config {
            kind: "upnp".into(),
            name: Url::parse(&location)
                .ok()
                .and_then(|u| u.host_str().map(str::to_owned))
                .unwrap_or("Media server".into()),
            base_url: location,
            ..Config::default()
        })
        .collect())
}
fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn didl(
    c: &Config,
    id: &str,
    flag: &str,
    offset: usize,
    limit: usize,
) -> Result<(Vec<Entry>, usize, usize)> {
    let object = if id.is_empty() { "0" } else { id };
    let service = &c.service_type;
    let body = format!(
        r#"<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:Browse xmlns:u="{}"><ObjectID>{}</ObjectID><BrowseFlag>{flag}</BrowseFlag><Filter>*</Filter><StartingIndex>{offset}</StartingIndex><RequestedCount>{limit}</RequestedCount><SortCriteria></SortCriteria></u:Browse></s:Body></s:Envelope>"#,
        escape(service),
        escape(object)
    );
    let res = response(
        client()?
            .post(&c.control_url)
            .header("Content-Type", "text/xml; charset=utf-8")
            .header("SOAPAction", format!("\"{service}#Browse\""))
            .body(body),
    )?
    .text()
    .map_err(|_| "Could not read media server")?;
    let doc = xml(&res)?;
    let browse = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "BrowseResponse")
        .ok_or("Media server could not browse this folder")?;
    let result = tag(browse, "Result").ok_or("Missing media listing")?;
    let parsed = xml(result)?;
    let returned = tag(browse, "NumberReturned")
        .and_then(|n| n.parse().ok())
        .unwrap_or(0);
    let total = tag(browse, "TotalMatches")
        .and_then(|n| n.parse().ok())
        .unwrap_or(0);
    let entries = parsed
        .root_element()
        .children()
        .filter(|n| n.is_element())
        .filter_map(|n| {
            let folder = n.tag_name().name() == "container";
            let resource = n.children().find(|n| {
                n.is_element()
                    && n.tag_name().name() == "res"
                    && n.attribute("protocolInfo").is_some_and(|p| {
                        p.starts_with("http-get:")
                            && (p.contains(":audio/") || p.contains("application/ogg"))
                    })
            });
            if !folder && resource.is_none() {
                return None;
            }
            let duration_ms = resource
                .and_then(|r| r.attribute("duration"))
                .map(duration)
                .unwrap_or(0);
            Some(Entry {
                id: n.attribute("id")?.into(),
                title: tag(n, "title").unwrap_or("Untitled").into(),
                kind: if !folder {
                    "track"
                } else if tag(n, "class").is_some_and(|v| v.contains("playlistContainer"))
                    && matches!(n.attribute("restricted"), Some("0" | "false"))
                {
                    "playlist"
                } else if tag(n, "class").is_some_and(|v| v.contains("musicArtist")) {
                    "artist"
                } else if tag(n, "class").is_some_and(|v| v.contains("musicAlbum")) {
                    "album"
                } else {
                    "folder"
                }
                .into(),
                artist: tag(n, "artist")
                    .or(tag(n, "creator"))
                    .unwrap_or_default()
                    .into(),
                album: tag(n, "album").unwrap_or_default().into(),
                duration_ms,
                art: tag(n, "albumArtURI")
                    .and_then(|v| Url::parse(&c.base_url).ok()?.join(v).ok())
                    .map(|u| u.to_string()),
            })
        })
        .collect();
    Ok((entries, returned, total))
}
pub fn browse(c: &Config, id: &str, offset: usize, limit: usize) -> Result<Page> {
    let (entries, returned, total) = didl(c, id, "BrowseDirectChildren", offset, limit)?;
    Ok(Page {
        entries,
        next_offset: (returned > 0 && offset + returned < total).then_some(offset + returned),
    })
}
pub fn stream(c: &Config, id: &str) -> Result<String> {
    let body = format!(
        r#"<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:Browse xmlns:u="{}"><ObjectID>{}</ObjectID><BrowseFlag>BrowseMetadata</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>1</RequestedCount><SortCriteria></SortCriteria></u:Browse></s:Body></s:Envelope>"#,
        escape(&c.service_type),
        escape(id)
    );
    let res = response(
        client()?
            .post(&c.control_url)
            .header("Content-Type", "text/xml; charset=utf-8")
            .header("SOAPAction", format!("\"{}#Browse\"", c.service_type))
            .body(body),
    )?
    .text()
    .map_err(|_| "Could not read track")?;
    let doc = xml(&res)?;
    let content = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "Result")
        .and_then(|n| n.text())
        .ok_or("Track no longer available")?;
    let metadata = xml(content)?;
    let resource = metadata
        .descendants()
        .find(|n| {
            n.is_element()
                && n.tag_name().name() == "res"
                && n.attribute("protocolInfo").is_some_and(|p| {
                    p.starts_with("http-get:")
                        && (p.contains(":audio/") || p.contains("application/ogg"))
                })
        })
        .and_then(|n| n.text())
        .ok_or("No playable audio resource")?;
    let u = Url::parse(&c.base_url)
        .and_then(|u| u.join(resource))
        .map_err(|_| "Invalid stream URL")?;
    if !matches!(u.scheme(), "http" | "https") {
        return Err("Unsupported stream URL".into());
    }
    Ok(u.into())
}
fn duration(s: &str) -> u64 {
    s.split(':')
        .try_fold(0f64, |acc, n| n.parse::<f64>().map(|v| acc * 60.0 + v))
        .map(|v| (v.max(0.0) * 1000.0) as u64)
        .unwrap_or(0)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn durations_and_xml_escaping() {
        assert_eq!(duration("01:02:03.500"), 3723500);
        assert_eq!(escape("A&B<\""), "A&amp;B&lt;&quot;");
    }
}

fn actions(c: &Config) -> Result<Vec<String>> {
    let body = get_text(&c.base_url)?;
    let doc = xml(&body)?;
    let service = doc
        .descendants()
        .find(|n| {
            n.is_element()
                && n.tag_name().name() == "service"
                && tag(*n, "serviceType") == Some(&c.service_type)
        })
        .ok_or("ContentDirectory service is unavailable")?;
    let base = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "URLBase")
        .and_then(|n| n.text())
        .filter(|v| !v.is_empty())
        .unwrap_or(&c.base_url);
    let scpd = Url::parse(base)
        .and_then(|u| u.join(tag(service, "SCPDURL").unwrap_or_default()))
        .map_err(|_| "Invalid service description URL")?;
    let body = get_text(scpd.as_str())?;
    let doc = xml(&body)?;
    Ok(doc
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "action")
        .filter_map(|n| tag(n, "name").map(str::to_owned))
        .collect())
}
fn supports(c: &Config, action: &str) -> Result<()> {
    if actions(c)?.iter().any(|a| a == action) {
        Ok(())
    } else {
        Err("This UPnP/DLNA server does not support this playlist operation".into())
    }
}

pub fn playlist_destinations(c: &Config, id: &str, offset: usize) -> Result<Page> {
    let mut page = browse(c, id, offset, 100)?;
    page.entries.retain(|e| e.kind != "track");
    Ok(page)
}
pub fn add_to_playlist(c: &Config, playlist: &str, track: &str) -> Result<()> {
    let (entries, _, _) = didl(c, playlist, "BrowseMetadata", 0, 1)?;
    if !entries
        .iter()
        .any(|e| e.id == playlist && e.kind == "playlist")
    {
        return Err("Choose a writable playlist container on this server".into());
    }
    soap(
        c,
        "CreateReference",
        &format!(
            "<ContainerID>{}</ContainerID><ObjectID>{}</ObjectID>",
            escape(playlist),
            escape(track)
        ),
    )?;
    Ok(())
}
fn soap(c: &Config, action: &str, arguments: &str) -> Result<String> {
    let body = format!(
        r#"<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:{action} xmlns:u="{}">{arguments}</u:{action}></s:Body></s:Envelope>"#,
        escape(&c.service_type)
    );
    let body = response(
        client()?
            .post(&c.control_url)
            .header("Content-Type", "text/xml; charset=utf-8")
            .header("SOAPAction", format!("\"{}#{action}\"", c.service_type))
            .body(body),
    )?
    .text()
    .map_err(|_| "Could not read media server")?;
    let doc = xml(&body)?;
    if !doc
        .descendants()
        .any(|n| n.is_element() && n.tag_name().name() == format!("{action}Response"))
    {
        return Err("Server refused this playlist operation".into());
    }
    Ok(body)
}

pub fn playlist_operation(c: &Config, input: &Value) -> Result<Value> {
    let operation = text(input, "operation");
    if operation == "capabilities" {
        let actions = actions(c)?;
        let has = |name: &str| actions.iter().any(|a| a == name);
        return Ok(
            json!({"create":has("CreateObject"),"rename":has("UpdateObject"),"delete":has("DestroyObject"),"items":has("DestroyObject"),"move":false,"add":has("CreateReference")}),
        );
    }
    let id = text(input, "playlistId");
    if operation == "create" {
        supports(c, "CreateObject")?;
        let parent = text(input, "parentId");
        let parent = if parent.is_empty() { "0" } else { &parent };
        let name = text(input, "name");
        if name.trim().is_empty() || name.chars().count() > 200 {
            return Err("Enter a playlist name (1–200 characters)".into());
        }
        let elements = format!(
            r#"<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><container id="" parentID="{}" restricted="0"><dc:title>{}</dc:title><upnp:class>object.container.playlistContainer</upnp:class></container></DIDL-Lite>"#,
            escape(parent),
            escape(name.trim())
        );
        let body = soap(
            c,
            "CreateObject",
            &format!(
                "<ContainerID>{}</ContainerID><Elements>{}</Elements>",
                escape(parent),
                escape(&elements)
            ),
        )?;
        let doc = xml(&body)?;
        let id = doc
            .descendants()
            .find(|n| n.is_element() && n.tag_name().name() == "ObjectID")
            .and_then(|n| n.text())
            .ok_or("Server did not return a playlist ID")?;
        return Ok(json!({"playlistId":id}));
    }
    if operation == "items" {
        return playlist_items(c, &id, input["offset"].as_u64().unwrap_or(0) as usize);
    }
    if operation == "remove" {
        supports(c, "DestroyObject")?;
        let entry = text(input, "entryId");
        // Destroy only a reference inside this playlist, never its source media object.
        let body=soap(c,"Browse",&format!("<ObjectID>{}</ObjectID><BrowseFlag>BrowseMetadata</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>1</RequestedCount><SortCriteria></SortCriteria>",escape(&entry)))?;
        let doc = xml(&body)?;
        let result = doc
            .descendants()
            .find(|n| n.is_element() && n.tag_name().name() == "Result")
            .and_then(|n| n.text())
            .ok_or("Missing playlist entry")?;
        let doc = xml(result)?;
        if !doc.root_element().children().any(|n| {
            n.is_element()
                && n.attribute("id") == Some(&entry)
                && n.attribute("parentID") == Some(&id)
                && n.attribute("refID").is_some()
                && matches!(n.attribute("restricted"), Some("0" | "false"))
        }) {
            return Err("This entry cannot be removed without deleting its source media".into());
        }
        soap(
            c,
            "DestroyObject",
            &format!("<ObjectID>{}</ObjectID>", escape(&entry)),
        )?;
        return Ok(json!({}));
    }
    let (entries, _, _) = didl(c, &id, "BrowseMetadata", 0, 1)?;
    let playlist = entries
        .iter()
        .find(|e| e.id == id && e.kind == "playlist")
        .ok_or("Choose a writable playlist container")?;
    match operation.as_str() {
        "rename" => {
            supports(c, "UpdateObject")?;
            let name = text(input, "name");
            if name.trim().is_empty() || name.chars().count() > 200 {
                return Err("Enter a playlist name (1–200 characters)".into());
            }
            let old = format!("<dc:title>{}</dc:title>", escape(&playlist.title));
            let new = format!("<dc:title>{}</dc:title>", escape(name.trim()));
            soap(c,"UpdateObject",&format!("<ObjectID>{}</ObjectID><CurrentTagValue>{}</CurrentTagValue><NewTagValue>{}</NewTagValue>",escape(&id),escape(&old),escape(&new)))?;
        }
        "delete" => {
            supports(c, "DestroyObject")?;
            let mut offset = 0;
            loop {
                let page = playlist_items(c, &id, offset)?;
                if array(&page, "entries")
                    .iter()
                    .any(|v| v["removable"] != true)
                {
                    return Err("This playlist contains original media. Delete it in the server app instead.".into());
                }
                match page["nextOffset"].as_u64() {
                    Some(next) if next > offset as u64 => offset = next as usize,
                    _ => break,
                }
            }
            soap(
                c,
                "DestroyObject",
                &format!("<ObjectID>{}</ObjectID>", escape(&id)),
            )?;
        }
        _ => return Err("This playlist operation is not available for UPnP/DLNA".into()),
    }
    Ok(json!({}))
}

fn playlist_items(c: &Config, id: &str, offset: usize) -> Result<Value> {
    let body=soap(c,"Browse",&format!("<ObjectID>{}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>{offset}</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria>",escape(id)))?;
    let doc = xml(&body)?;
    let browse = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "BrowseResponse")
        .ok_or("Missing playlist")?;
    let total = tag(browse, "TotalMatches")
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or("Server did not return the playlist size")?;
    let returned = tag(browse, "NumberReturned")
        .and_then(|s| s.parse::<usize>().ok())
        .ok_or("Server did not return the playlist page size")?;
    let doc = xml(tag(browse, "Result").ok_or("Missing playlist entries")?)?;
    let entries:Vec<_>=doc.root_element().children().filter(|n|n.is_element()).enumerate().map(|(i,n)|json!({"id":n.attribute("id").unwrap_or_default(),"entryId":n.attribute("id").unwrap_or_default(),"title":tag(n,"title").unwrap_or("Untitled"),"artist":tag(n,"artist").unwrap_or_default(),"position":offset+i,"removable":n.attribute("refID").is_some()&&matches!(n.attribute("restricted"),Some("0"|"false"))})).collect();
    if entries.len() != returned || (returned == 0 && (offset as u64) < total) {
        return Err("Server returned an incomplete playlist. Refresh and try again.".into());
    }
    Ok(json!({"entries":entries,"nextOffset":next_offset(offset,returned,100,Some(total))}))
}
