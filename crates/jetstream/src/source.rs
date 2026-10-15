//! Version-specific wire handling, with one normalized durable inbox format.
use crate::{
    subscriber::EXTRA_COLLECTIONS,
    types::{Commit, Root},
};
use anyhow::{bail, ensure, Context, Result};
use serde::Deserialize;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::Request};
use url::Url;

const V2_PATH: &str = "/xrpc/network.bsky.jetstream.subscribeEvents";
const V2_TYPE: &str = "network.bsky.jetstream.subscribeEvents#";
const DEFAULT_V2: &str =
    "wss://jetstream.us-west.bsky.network,wss://jetstream.us-east.bsky.network";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Version {
    V1,
    V2,
}

impl Version {
    pub fn label(self) -> &'static str {
        match self {
            Self::V1 => "v1",
            Self::V2 => "v2",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Source {
    pub version: Version,
    pub server: String,
    initial_cursor: i64,
}

pub enum Frame {
    Commit { event: Root, cursor: i64 },
    Ignore,
    Info(String),
    Error(String),
}

impl Source {
    pub fn new(version: Version, server: &str, initial_cursor: i64) -> Result<Self> {
        let mut url = Url::parse(server.trim()).context("invalid Jetstream URL")?;
        ensure!(
            matches!(url.scheme(), "ws" | "wss"),
            "Jetstream URL must use ws:// or wss://"
        );
        ensure!(
            url.host_str().is_some() && url.username().is_empty() && url.password().is_none(),
            "Jetstream URL must have a host and no credentials"
        );
        ensure!(
            url.query().is_none() && url.fragment().is_none(),
            "configure Jetstream base URLs without query parameters or fragments"
        );
        let path = url.path().trim_end_matches('/');
        let endpoint = match version {
            Version::V1 => "/subscribe",
            Version::V2 => V2_PATH,
        };
        ensure!(
            path.is_empty() || path == endpoint,
            "unexpected Jetstream URL path"
        );
        url.set_path("");
        ensure!(
            initial_cursor >= 0,
            "Jetstream initial cursor must be nonnegative"
        );
        if version == Version::V2 {
            ensure!(
                initial_cursor < 1_000_000_000_000_000,
                "JETSTREAM_V2_CURSOR must be a sequence number, not a timestamp"
            );
        }
        Ok(Self {
            version,
            server: url.to_string().trim_end_matches('/').to_owned(),
            initial_cursor,
        })
    }

    pub fn cursor_key(&self) -> String {
        format!(
            "jetstream:{}:{}",
            match self.version {
                Version::V1 => "v1",
                Version::V2 => "v2",
            },
            self.server
        )
    }

    pub fn request(&self, durable_cursor: i64) -> Result<Request<()>> {
        let mut url = Url::parse(&self.server)?;
        url.set_path(match self.version {
            Version::V1 => "/subscribe",
            Version::V2 => V2_PATH,
        });
        let field = match self.version {
            Version::V1 => "wantedCollections",
            Version::V2 => "collections",
        };
        let mut query = url.query_pairs_mut();
        query.append_pair(field, "app.rocksky.*");
        for collection in EXTRA_COLLECTIONS {
            query.append_pair(field, collection);
        }
        if self.version == Version::V2 {
            query.append_pair("kinds", "commit");
        }
        let cursor = if durable_cursor > 0 {
            durable_cursor
        } else {
            self.initial_cursor
        };
        if cursor > 0 {
            // V2 sequences are inclusive, local to each source, and are not timestamps.
            let cursor = match self.version {
                Version::V1 => cursor.saturating_sub(5_000_000).max(0),
                Version::V2 => cursor,
            };
            query.append_pair("cursor", &cursor.to_string());
        }
        drop(query);
        let mut request = url.as_str().into_client_request()?;
        if self.version == Version::V2 {
            request
                .headers_mut()
                .insert("Sec-WebSocket-Protocol", "xrpc.v1.json".parse()?);
        }
        Ok(request)
    }

    pub fn decode(&self, text: &str) -> Result<Frame> {
        if self.version == Version::V1 {
            let event: Root = serde_json::from_str(text)?;
            if event.kind != "commit" {
                return Ok(Frame::Ignore);
            }
            ensure!(
                event.commit.is_some() && event.time_us > 0,
                "invalid v1 commit"
            );
            return Ok(Frame::Commit {
                cursor: event.time_us,
                event,
            });
        }
        let envelope: serde_json::Value = serde_json::from_str(text)?;
        match envelope["$type"].as_str() {
            Some("error") => {
                return Ok(Frame::Error(
                    envelope["error"]
                        .as_str()
                        .unwrap_or("unknown stream error")
                        .to_owned(),
                ))
            }
            Some("message") => {}
            _ => bail!("invalid v2 envelope"),
        }
        let payload = &envelope["payload"];
        let kind = payload["$type"]
            .as_str()
            .and_then(|s| s.strip_prefix(V2_TYPE))
            .context("invalid v2 message type")?;
        match kind {
            "info" => {
                let name = payload["name"].as_str().context("missing v2 info name")?;
                // Never silently skip a gap or reuse a cursor from a different archive.
                if matches!(name, "OutdatedCursor" | "FutureCursor") {
                    return Ok(Frame::Error(name.to_owned()));
                }
                return Ok(Frame::Info(name.to_owned()));
            }
            "identity" | "account" | "sync" => return Ok(Frame::Ignore),
            "commit" => {}
            _ => bail!("unknown v2 event kind"),
        }
        #[derive(Deserialize)]
        struct V2Commit {
            seq: i64,
            did: String,
            time: String,
            #[serde(flatten)]
            commit: Commit,
        }
        let value: V2Commit = serde_json::from_value(payload.clone())?;
        ensure!(
            value.seq > 0 && value.seq < 1_000_000_000_000_000,
            "invalid v2 sequence"
        );
        let time_us = chrono::DateTime::parse_from_rfc3339(&value.time)?.timestamp_micros();
        Ok(Frame::Commit {
            cursor: value.seq,
            event: Root {
                did: value.did,
                time_us,
                kind: "commit".into(),
                commit: Some(value.commit),
            },
        })
    }
}

pub fn configured_sources() -> Result<Vec<Source>> {
    resolve_sources(|key| std::env::var(key).ok())
}

fn resolve_sources(get: impl Fn(&str) -> Option<String>) -> Result<Vec<Source>> {
    let value = |key| get(key).filter(|s| !s.trim().is_empty());
    let mode = value("JETSTREAM_VERSION").unwrap_or_else(|| "v1".into());
    ensure!(
        matches!(mode.trim(), "v1" | "v2" | "both"),
        "JETSTREAM_VERSION must be v1, v2, or both"
    );
    let mut sources = Vec::new();
    for version in [Version::V1, Version::V2] {
        if (mode.trim() == "v1" && version == Version::V2)
            || (mode.trim() == "v2" && version == Version::V1)
        {
            continue;
        }
        let (list, cursor_key) = match version {
            Version::V1 => (
                value("JETSTREAM_SERVERS")
                    .or_else(|| value("JETSTREAM_SERVER"))
                    .unwrap_or_else(|| "wss://jetstream2.us-west.bsky.network".into()),
                "JETSTREAM_CURSOR",
            ),
            Version::V2 => (
                value("JETSTREAM_V2_URLS")
                    .or_else(|| value("JETSTREAM_V2_URL"))
                    .unwrap_or_else(|| DEFAULT_V2.into()),
                "JETSTREAM_V2_CURSOR",
            ),
        };
        let cursor = value(cursor_key)
            .map(|s| s.trim().parse::<i64>())
            .transpose()
            .with_context(|| format!("invalid {cursor_key}"))?
            .unwrap_or(0);
        let before = sources.len();
        let mut count = 0;
        for url in list.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            let source = Source::new(version, url, cursor)?;
            count += 1;
            if !sources
                .iter()
                .any(|s: &Source| s.cursor_key() == source.cursor_key())
            {
                sources.push(source);
            }
        }
        ensure!(count > 0, "no URLs configured for {version:?}");
        ensure!(version != Version::V2 || cursor == 0 || sources.len() - before == 1,
            "JETSTREAM_V2_CURSOR is instance-specific; configure exactly one v2 URL when seeding a cursor");
    }
    Ok(sources)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::json;

    fn config(pairs: &[(&str, &str)]) -> Result<Vec<Source>> {
        resolve_sources(|key| {
            pairs
                .iter()
                .find(|(k, _)| *k == key)
                .map(|(_, v)| (*v).into())
        })
    }
    pub(crate) fn commit_v2(operation: &str) -> String {
        json!({"$type":"message","payload": {
            "$type":"network.bsky.jetstream.subscribeEvents#commit", "seq":42,
            "time":"2026-08-13T06:47:43.959305Z", "did":"did:plc:test",
            "rev":"3msx2efqjtc27", "operation":operation, "collection":"app.rocksky.scrobble",
            "rkey":"3msx2efqdxs27", "record": if operation == "delete" { serde_json::Value::Null } else { json!({"title":"Test"}) }
        }}).to_string()
    }
    #[test]
    fn configuration_preserves_v1_and_defaults_v2_to_two_regions() {
        let old = config(&[]).unwrap();
        assert_eq!(old.len(), 1);
        assert_eq!(old[0].version, Version::V1);
        let v2 = config(&[("JETSTREAM_VERSION", "v2")]).unwrap();
        assert_eq!(
            v2.iter().map(|s| s.server.as_str()).collect::<Vec<_>>(),
            DEFAULT_V2.split(',').collect::<Vec<_>>()
        );
        assert_eq!(config(&[("JETSTREAM_VERSION", "both")]).unwrap().len(), 3);
    }
    #[test]
    fn lists_override_single_urls_and_normalize_duplicates() {
        let sources = config(&[
            ("JETSTREAM_VERSION", "both"),
            (
                "JETSTREAM_SERVERS",
                " wss://old.example/, ,wss://old.example",
            ),
            (
                "JETSTREAM_V2_URLS",
                "wss://a.example/,wss://b.example,wss://a.example",
            ),
            ("JETSTREAM_V2_URL", "wss://ignored.example"),
        ])
        .unwrap();
        assert_eq!(sources.len(), 3);
        assert_eq!(sources[0].server, "wss://old.example");
        assert_eq!(sources[1].server, "wss://a.example");
        let single = config(&[
            ("JETSTREAM_VERSION", "v2"),
            ("JETSTREAM_V2_URL", "wss://single.example"),
        ])
        .unwrap();
        assert_eq!(single.len(), 1);
    }
    #[test]
    fn invalid_configuration_fails_instead_of_starting_live() {
        for pairs in [
            vec![("JETSTREAM_VERSION", "v3")],
            vec![("JETSTREAM_CURSOR", "oops")],
            vec![("JETSTREAM_VERSION", "v2"), ("JETSTREAM_V2_URLS", ",")],
            vec![("JETSTREAM_VERSION", "v2"), ("JETSTREAM_V2_CURSOR", "42")],
        ] {
            assert!(config(&pairs).is_err());
        }
        for url in [
            "https://a.example",
            "wss://a.example?cursor=1",
            "wss://secret@a.example",
            "wss://a.example/wrong",
        ] {
            assert!(Source::new(Version::V2, url, 0).is_err());
        }
        assert!(Source::new(Version::V2, "wss://a.example", 1_700_000_000_000_000).is_err());
    }
    #[test]
    fn requests_use_correct_filters_subprotocol_and_cursor_units() {
        for version in [Version::V1, Version::V2] {
            let source = Source::new(version, "wss://a.example/", 123).unwrap();
            let req = source.request(10_000_000).unwrap();
            let url = Url::parse(&req.uri().to_string()).unwrap();
            let key = if version == Version::V1 {
                "wantedCollections"
            } else {
                "collections"
            };
            assert_eq!(
                url.query_pairs()
                    .filter(|(k, _)| k == key)
                    .map(|(_, v)| v.into_owned())
                    .collect::<Vec<_>>(),
                vec!["app.rocksky.*", EXTRA_COLLECTIONS[0], EXTRA_COLLECTIONS[1]]
            );
            let cursor = url
                .query_pairs()
                .find(|(k, _)| k == "cursor")
                .unwrap()
                .1
                .into_owned();
            assert_eq!(
                cursor,
                if version == Version::V1 {
                    "5000000"
                } else {
                    "10000000"
                }
            );
            assert_eq!(
                req.headers().get("Sec-WebSocket-Protocol").is_some(),
                version == Version::V2
            );
            assert_eq!(
                url.path(),
                if version == Version::V1 {
                    "/subscribe"
                } else {
                    V2_PATH
                }
            );
        }
        let s = Source::new(Version::V2, "wss://a.example", 42).unwrap();
        assert!(s
            .request(0)
            .unwrap()
            .uri()
            .to_string()
            .contains("cursor=42"));
        assert!(s
            .request(99)
            .unwrap()
            .uri()
            .to_string()
            .contains("cursor=99"));
        let s = Source::new(Version::V2, "wss://a.example", 0).unwrap();
        assert!(!s.request(0).unwrap().uri().to_string().contains("cursor="));
        assert!(s
            .request(0)
            .unwrap()
            .uri()
            .to_string()
            .contains("kinds=commit"));
    }
    #[test]
    fn v2_normalizes_create_update_delete_to_the_existing_inbox_format() {
        let source = Source::new(Version::V2, "wss://a.example", 0).unwrap();
        for op in ["create", "update", "delete"] {
            let Frame::Commit { event, cursor } = source.decode(&commit_v2(op)).unwrap() else {
                panic!("commit expected")
            };
            assert_eq!(cursor, 42);
            assert_eq!(event.time_us, 1_786_603_663_959_305);
            let stored = serde_json::to_string(&event).unwrap();
            let legacy: Root = serde_json::from_str(&stored).unwrap();
            let commit = legacy.commit.unwrap();
            assert_eq!(commit.operation, op);
            assert_eq!(commit.record.is_none(), op == "delete");
        }
    }
    #[test]
    fn notices_and_errors_do_not_become_commit_jobs() {
        let s = Source::new(Version::V2, "wss://a.example", 0).unwrap();
        for name in ["FutureCursor", "OutdatedCursor"] {
            let text =
                json!({"$type":"message","payload":{"$type":format!("{V2_TYPE}info"),"name":name}})
                    .to_string();
            assert!(matches!(s.decode(&text).unwrap(), Frame::Error(_)));
        }
        assert!(matches!(
            s.decode(r#"{"$type":"error","error":"ConsumerTooSlow"}"#)
                .unwrap(),
            Frame::Error(_)
        ));
        for kind in ["identity", "account", "sync"] {
            let text = json!({"$type":"message","payload":{"$type":format!("{V2_TYPE}{kind}")}})
                .to_string();
            assert!(matches!(s.decode(&text).unwrap(), Frame::Ignore));
        }
        for text in ["broken", r#"{"$type":"message","payload":{}}"#] {
            assert!(s.decode(text).is_err());
        }
    }
    #[tokio::test]
    async fn websocket_negotiates_v2_and_decodes_a_real_text_frame() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::{accept_hdr_async, connect_async, tungstenite::Message};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let source = Source::new(
            Version::V2,
            &format!("ws://{}", listener.local_addr().unwrap()),
            0,
        )
        .unwrap();
        let server = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            let mut ws=accept_hdr_async(socket,|request: &Request<()>,mut response: tokio_tungstenite::tungstenite::handshake::server::Response| {
                assert_eq!(request.headers()["Sec-WebSocket-Protocol"],"xrpc.v1.json");
                assert_eq!(request.uri().path(),V2_PATH);
                response.headers_mut().insert("Sec-WebSocket-Protocol","xrpc.v1.json".parse().unwrap());
                Ok(response)
            }).await.unwrap();
            ws.send(Message::Text(commit_v2("create").into()))
                .await
                .unwrap();
        });
        let (mut ws, _) = connect_async(source.request(0).unwrap()).await.unwrap();
        let frame = tokio::time::timeout(std::time::Duration::from_secs(5), ws.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(matches!(
            source.decode(frame.to_text().unwrap()).unwrap(),
            Frame::Commit { cursor: 42, .. }
        ));
        server.await.unwrap();
    }
}
