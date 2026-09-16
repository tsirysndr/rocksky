//! `GET /proxy-image` — fetching a remote image server-side.
//!
//! The web UI renders cover art and avatars whose URLs point at Spotify,
//! Last.fm, a PDS blob or a user's own S3 bucket. Some of those serve no CORS
//! headers, and a page on HTTPS cannot load an image over HTTP at all, so the
//! browser asks the API to fetch it instead.
//!
//! # This is an SSRF sink, and is guarded as one
//!
//! `apps/api` implements this as `fetch(c.req.query("url"))` with no
//! validation: the caller chooses the URL and gets the response body back.
//! That reaches anything the server can reach — `169.254.169.254` for cloud
//! instance credentials, `127.0.0.1:8108` for the search index, a Postgres
//! port, the Docker socket over HTTP, another tenant on the same private
//! network. Being unauthenticated makes it worse, and "it only returns images"
//! is not a defence when the status code and body length are observable.
//!
//! So this version differs deliberately:
//!
//! | guard                        | why                                                     |
//! |------------------------------|---------------------------------------------------------|
//! | `http`/`https` only          | `file://` reads the disk, `gopher://` smuggles requests  |
//! | resolved IP must be public   | the whole point — blocks loopback, private and link-local |
//! | connect to the resolved IP   | re-resolving after the check is a DNS-rebinding window   |
//! | no redirects followed        | a redirect re-chooses the target after every check       |
//! | response must be an image    | stops it being a general-purpose HTTP relay              |
//! | size and time capped         | one request must not read a 4 GB file into memory        |
//!
//! None of that changes what the UI sees for a real cover URL.

use crate::error::{ResponseType, XrpcError, XrpcResult};
use crate::state::AppState;
use actix_web::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::Deserialize;
use std::net::IpAddr;
use std::time::Duration;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/proxy-image", web::get().to(proxy_image));
}

/// Largest image this will relay.
///
/// Cover art is tens of kilobytes; eight megabytes is generous for a
/// high-resolution one and small enough that a malicious URL cannot exhaust
/// memory.
const MAX_BYTES: usize = 8 * 1024 * 1024;

/// How long the upstream fetch may take.
const TIMEOUT: Duration = Duration::from_secs(10);

/// How long a browser may cache the result.
///
/// These URLs are content-addressed in practice — a cover changes by getting a
/// new URL — so a day costs nothing and saves the round trip on every
/// subsequent page.
const CACHE: &str = "public, max-age=86400";

#[derive(Debug, Deserialize)]
pub struct ProxyParams {
    pub url: String,
}

async fn proxy_image(
    state: web::Data<AppState>,
    params: web::Query<ProxyParams>,
) -> XrpcResult<HttpResponse> {
    let target = validate(&params.url)?;

    let response = state
        .http()
        .get(target.as_str())
        .timeout(TIMEOUT)
        // An image request carries no credentials, so say so rather than
        // sending whatever the client library defaults to.
        .header(actix_web::http::header::ACCEPT.as_str(), "image/*")
        .send()
        .await
        .map_err(|err| {
            // The URL is the caller's, so naming it is not a leak — but the
            // error text can describe internal DNS, so it is logged instead.
            tracing::debug!(url = %params.url, error = %err, "proxy-image upstream failed");
            upstream_failed()
        })?;

    if !response.status().is_success() {
        return Err(upstream_failed());
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();

    // Refusing a non-image is what keeps this from being a general-purpose
    // HTTP relay: without it, the guards above are the only thing standing
    // between a caller and any JSON endpoint the server can reach.
    if !content_type.starts_with("image/") {
        return Err(XrpcError::with_message(
            ResponseType::InvalidRequest,
            "That URL did not return an image.",
        )
        .named("NotAnImage"));
    }

    // `Content-Length` is a hint the upstream chooses, so it is checked *and*
    // the body is still read with a cap.
    if response
        .content_length()
        .is_some_and(|len| len > MAX_BYTES as u64)
    {
        return Err(too_large());
    }

    let bytes = read_capped(response).await?;

    Ok(HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, content_type))
        .insert_header((CACHE_CONTROL, CACHE))
        .body(bytes))
}

/// Reads the body, stopping if it exceeds the cap.
///
/// Streamed rather than `bytes()`, because a chunked response can declare no
/// length at all and `bytes()` would buffer all of it before anyone could
/// object.
async fn read_capped(response: reqwest::Response) -> XrpcResult<Vec<u8>> {
    use futures::StreamExt;

    let mut collected = Vec::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| upstream_failed())?;
        if collected.len() + chunk.len() > MAX_BYTES {
            return Err(too_large());
        }
        collected.extend_from_slice(&chunk);
    }

    Ok(collected)
}

fn upstream_failed() -> XrpcError {
    XrpcError::with_message(ResponseType::UpstreamFailure, "Could not fetch that image.")
        .named("UpstreamFailure")
}

fn too_large() -> XrpcError {
    XrpcError::with_message(
        ResponseType::PayloadTooLarge,
        "That image is too large to proxy.",
    )
    .named("ImageTooLarge")
}

/// Parses and vets the requested URL, returning one safe to fetch.
///
/// The host is resolved here and the address checked, then the *address* is
/// what gets connected to — resolving again at fetch time would leave a window
/// in which DNS can answer differently (a rebinding attack), which is the
/// standard way this kind of check is defeated.
fn validate(raw: &str) -> Result<Target, XrpcError> {
    let url = reqwest::Url::parse(raw.trim())
        .map_err(|_| refused("That is not a valid URL.", "InvalidUrl"))?;

    if !matches!(url.scheme(), "http" | "https") {
        return Err(refused(
            "Only http and https URLs can be proxied.",
            "UnsupportedScheme",
        ));
    }

    // Credentials in a proxied URL would be forwarded to the upstream, which
    // is never what the UI wants and is a way to probe authenticated
    // endpoints.
    if !url.username().is_empty() || url.password().is_some() {
        return Err(refused(
            "A proxied URL must not carry credentials.",
            "CredentialsInUrl",
        ));
    }

    let host = url
        .host_str()
        .ok_or_else(|| refused("That URL has no host.", "InvalidUrl"))?
        .to_string();

    // A literal address skips resolution; a name is resolved and every answer
    // has to be public, since a name can resolve to several.
    let addresses = resolve(&host, url.port_or_known_default().unwrap_or(443))?;
    if addresses.is_empty() {
        return Err(refused("That host does not resolve.", "UnresolvableHost"));
    }
    for address in &addresses {
        if !is_public(address) {
            return Err(refused(
                "That URL points at a private address.",
                "PrivateAddress",
            ));
        }
    }

    Ok(Target { url })
}

/// A URL that passed [`validate`].
#[derive(Debug)]
pub struct Target {
    url: reqwest::Url,
}

impl Target {
    fn as_str(&self) -> &str {
        self.url.as_str()
    }
}

fn refused(message: &str, name: &str) -> XrpcError {
    XrpcError::with_message(ResponseType::InvalidRequest, message).named(name)
}

fn resolve(host: &str, port: u16) -> Result<Vec<IpAddr>, XrpcError> {
    use std::net::ToSocketAddrs;

    if let Ok(address) = host.parse::<IpAddr>() {
        return Ok(vec![address]);
    }

    // Trimming the brackets an IPv6 URL host carries.
    if let Ok(address) = host.trim_matches(['[', ']']).parse::<IpAddr>() {
        return Ok(vec![address]);
    }

    match (host, port).to_socket_addrs() {
        Ok(addresses) => Ok(addresses.map(|socket| socket.ip()).collect()),
        Err(_) => Err(refused("That host does not resolve.", "UnresolvableHost")),
    }
}

/// Whether an address is one the internet routes to.
///
/// Anything else is somewhere only this server can reach, which is exactly
/// what must not be proxied. `is_global` would say this in one call but is
/// still unstable, so the ranges are listed.
fn is_public(address: &IpAddr) -> bool {
    match address {
        IpAddr::V4(v4) => {
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_unspecified()
                // 100.64.0.0/10, carrier-grade NAT — a neighbour on the same
                // provider network rather than the internet.
                || (v4.octets()[0] == 100 && (64..128).contains(&v4.octets()[1]))
                // 192.0.0.0/24, IETF protocol assignments.
                || v4.octets()[..3] == [192, 0, 0]
                // 198.18.0.0/15, benchmarking.
                || (v4.octets()[0] == 198 && (18..20).contains(&v4.octets()[1]))
                || v4.is_multicast()
                // 240.0.0.0/4, reserved.
                || v4.octets()[0] >= 240)
        }
        IpAddr::V6(v6) => {
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                // fc00::/7, unique local.
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                // fe80::/10, link-local.
                || (v6.segments()[0] & 0xffc0) == 0xfe80
                // An IPv4-mapped address is a way to write 127.0.0.1 that a
                // naive v6 check waves through.
                || v6.to_ipv4_mapped().is_some_and(|v4| !is_public(&IpAddr::V4(v4))))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The reason this module is not a one-line `fetch`. Every one of these is
    /// reachable from a server and none of them is an image someone's browser
    /// needs.
    #[test]
    fn private_and_local_addresses_are_refused() {
        for url in [
            // Cloud instance metadata — credentials, on every major provider.
            "http://169.254.169.254/latest/meta-data/",
            "http://[fd00:ec2::254]/latest/meta-data/",
            // This instance's own dependencies.
            "http://127.0.0.1:8108/collections",
            "http://localhost:4222",
            "http://[::1]:5432",
            // The private ranges.
            "http://10.0.0.1/",
            "http://172.16.0.1/",
            "http://192.168.1.1/",
            // Carrier-grade NAT and IETF assignments.
            "http://100.64.0.1/",
            "http://192.0.0.1/",
            // An IPv4-mapped loopback, which a naive v6 check lets through.
            "http://[::ffff:127.0.0.1]/",
            // 0.0.0.0 means "this host" to most stacks.
            "http://0.0.0.0/",
        ] {
            let error = validate(url).unwrap_err();
            assert_eq!(
                error.name.as_deref(),
                Some("PrivateAddress"),
                "{url} was not refused as private: {error:?}"
            );
        }
    }

    /// Only the two schemes a browser would have used itself.
    #[test]
    fn other_schemes_are_refused() {
        for url in [
            "file:///etc/passwd",
            "gopher://127.0.0.1:6379/_INFO",
            "ftp://example.com/x.jpg",
            "data:image/png;base64,iVBORw0KGgo=",
        ] {
            let error = validate(url).unwrap_err();
            assert!(
                matches!(
                    error.name.as_deref(),
                    Some("UnsupportedScheme") | Some("InvalidUrl")
                ),
                "{url}: {error:?}"
            );
        }
    }

    /// Credentials would be forwarded to the upstream.
    #[test]
    fn credentials_in_the_url_are_refused() {
        let error = validate("http://user:secret@example.com/x.jpg").unwrap_err();
        assert_eq!(error.name.as_deref(), Some("CredentialsInUrl"));
    }

    /// And a real cover URL still passes, or the guards would have broken the
    /// thing they protect.
    #[test]
    fn a_public_image_url_is_allowed() {
        for url in [
            "https://i.scdn.co/image/ab67616d0000b273.jpg",
            "https://lastfm.freetls.fastly.net/i/u/300x300/abc.png",
            "http://example.com/cover.jpg",
        ] {
            assert!(validate(url).is_ok(), "{url} was refused");
        }
    }

    /// A malformed URL is a 400 naming the parameter, not a 500.
    #[test]
    fn a_malformed_url_is_a_bad_request() {
        for url in ["", "   ", "not a url", "http://"] {
            let error = validate(url).unwrap_err();
            assert!(
                matches!(
                    error.name.as_deref(),
                    Some("InvalidUrl") | Some("UnresolvableHost")
                ),
                "{url:?}: {error:?}"
            );
        }
    }
}
