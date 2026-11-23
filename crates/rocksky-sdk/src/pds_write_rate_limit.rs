//! Server-reported PDS record-write budgets (points), separate from HTTP quotas.
use jacquard_common::http_client::HttpClient;
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdsWriteRateLimit {
    pub limit: u64,
    pub remaining: u64,
    /// Unix epoch seconds.
    pub reset_at: u64,
    pub policy: String,
}

impl PdsWriteRateLimit {
    /// Recognize the standard PDS point policies, never a generic request quota.
    /// Unknown/custom policies are unavailable rather than guessed.
    pub fn from_headers(headers: &http::HeaderMap) -> Option<Self> {
        let policy = headers.get("ratelimit-policy")?.to_str().ok()?.trim();
        let expected = match policy {
            "5000;w=3600" => 5000,
            "35000;w=86400" => 35000,
            _ => return None,
        };
        let number = |name: &str| -> Option<u64> {
            let s = headers.get(name)?.to_str().ok()?.trim();
            if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            let n: u64 = s.parse().ok()?;
            (n <= 9_007_199_254_740_991).then_some(n)
        };
        let limit = number("ratelimit-limit")?;
        let remaining = number("ratelimit-remaining")?;
        let reset_at = number("ratelimit-reset")?;
        if limit != expected || remaining > limit {
            return None;
        }
        Some(Self {
            limit,
            remaining,
            reset_at,
            policy: policy.to_string(),
        })
    }
}

#[derive(Clone, Default)]
pub(crate) struct WriteQuota(Arc<RwLock<Option<PdsWriteRateLimit>>>);
impl WriteQuota {
    pub(crate) fn get(&self) -> Option<PdsWriteRateLimit> {
        self.0.read().unwrap_or_else(|e| e.into_inner()).clone()
    }
    fn set(&self, value: Option<PdsWriteRateLimit>) {
        *self.0.write().unwrap_or_else(|e| e.into_inner()) = value;
    }
}

pub(crate) struct ObservedHttp {
    pub(crate) inner: reqwest::Client,
    pub(crate) quota: WriteQuota,
}

impl HttpClient for ObservedHttp {
    type Error = reqwest::Error;
    async fn send_http(
        &self,
        request: http::Request<Vec<u8>>,
    ) -> std::result::Result<http::Response<Vec<u8>>, Self::Error> {
        let is_write = request.method() == http::Method::POST
            && matches!(
                request.uri().path(),
                "/xrpc/com.atproto.repo.createRecord"
                    | "/xrpc/com.atproto.repo.putRecord"
                    | "/xrpc/com.atproto.repo.deleteRecord"
                    | "/xrpc/com.atproto.repo.applyWrites"
            );
        let result = self.inner.send_http(request).await;
        if is_write {
            self.quota.set(
                result
                    .as_ref()
                    .ok()
                    .and_then(|r| PdsWriteRateLimit::from_headers(r.headers())),
            );
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn headers(policy: &str, remaining: &str) -> http::HeaderMap {
        let mut h = http::HeaderMap::new();
        h.insert("ratelimit-policy", policy.parse().unwrap());
        h.insert(
            "ratelimit-limit",
            policy.split(';').next().unwrap().parse().unwrap(),
        );
        h.insert("ratelimit-remaining", remaining.parse().unwrap());
        h.insert("ratelimit-reset", "1800000000".parse().unwrap());
        h
    }
    #[test]
    fn only_valid_write_point_policies() {
        assert_eq!(
            PdsWriteRateLimit::from_headers(&headers("5000;w=3600", "4997"))
                .unwrap()
                .remaining,
            4997
        );
        assert_eq!(
            PdsWriteRateLimit::from_headers(&headers("35000;w=86400", "0"))
                .unwrap()
                .remaining,
            0
        );
        for policy in ["3000;w=300", "10000;w=3600", ""] {
            assert!(PdsWriteRateLimit::from_headers(&headers(policy, "0")).is_none());
        }
        for value in ["", "NaN", "-1", "1.5", "5001", "9007199254740992"] {
            assert!(PdsWriteRateLimit::from_headers(&headers("5000;w=3600", value)).is_none());
        }
        let mut h = headers("5000;w=3600", "4997");
        h.remove("ratelimit-reset");
        assert!(PdsWriteRateLimit::from_headers(&h).is_none());
    }

    #[tokio::test]
    async fn observe_success_failure_and_missing_headers_but_ignore_reads() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            for (status, extra) in [
                (200, "ratelimit-policy: 5000;w=3600\r\nratelimit-limit: 5000\r\nratelimit-remaining: 4997\r\nratelimit-reset: 1800000000\r\n"),
                (200, ""), // A read must leave the write snapshot alone.
                (429, "ratelimit-policy: 35000;w=86400\r\nratelimit-limit: 35000\r\nratelimit-remaining: 0\r\nratelimit-reset: 1800000000\r\n"),
                (200, ""),
            ] {
                let (mut socket, _) = listener.accept().unwrap();
                socket.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
                let mut request = [0; 4096];
                socket.read(&mut request).unwrap();
                write!(socket, "HTTP/1.1 {status} Test\r\n{extra}Content-Length: 2\r\nConnection: close\r\n\r\n{{}}").unwrap();
            }
        });
        let quota = WriteQuota::default();
        let client = ObservedHttp {
            inner: reqwest::Client::new(),
            quota: quota.clone(),
        };
        for (method, nsid, expected) in [
            ("POST", "createRecord", Some(4997)),
            ("GET", "listRecords", Some(4997)),
            ("POST", "putRecord", Some(0)),
            ("POST", "deleteRecord", None),
        ] {
            let req = http::Request::builder()
                .method(method)
                .uri(format!("http://{address}/xrpc/com.atproto.repo.{nsid}"))
                .body(Vec::new())
                .unwrap();
            let response = client.send_http(req).await.unwrap();
            assert_eq!(response.body(), b"{}");
            assert_eq!(quota.get().map(|q| q.remaining), expected);
        }
        server.join().unwrap();
    }
}

#[cfg(test)]
mod response_tests {
    #[test]
    fn write_response_serializes_the_optional_quota_definition() {
        let quota = crate::PdsWriteRateLimit {
            limit: 5000,
            remaining: 4997,
            reset_at: 1800000000,
            policy: "5000;w=3600".into(),
        };
        let result = crate::RecordWriteResult {
            uri: "at://did:plc:test/record/key".into(),
            pds_write_rate_limit: Some(quota),
            written: true,
        };
        let json = serde_json::to_value(result).unwrap();
        assert_eq!(json["pdsWriteRateLimit"]["remaining"], 4997);
        assert_eq!(json["pdsWriteRateLimit"]["resetAt"], 1800000000);
        assert_eq!(json["written"], true);
        let skipped = crate::ScrobbleResult {
            artist_uri: "a".into(),
            album_uri: "b".into(),
            song_uri: "c".into(),
            scrobble_uri: "d".into(),
            pds_write_rate_limit: None,
            written: false,
        };
        let json = serde_json::to_value(skipped).unwrap();
        assert!(json["pdsWriteRateLimit"].is_null());
        assert_eq!(json["scrobbleUri"], "d");
        assert_eq!(json["written"], false);
    }
}
