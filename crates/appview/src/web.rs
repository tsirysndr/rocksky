//! Serves the embedded web UI as a single-page app.
//!
//! The assets are compiled into the binary by `build.rs`, so a self-hosted
//! Rocksky is one file with no static directory to deploy alongside it.
//!
//! The interesting part is configuration. `apps/web` reads its API base URL
//! from `import.meta.env.VITE_API_URL`, which is fixed at *build* time — no use
//! to a binary that might be reached at `localhost:3004`, a LAN address or a
//! public domain. So the HTML shell gets a `window.__ROCKSKY_CONFIG__` script
//! injected on the way out, derived from the request's own origin. Nothing to
//! configure, and the same binary works at every address.
//!
//! `apps/web/src/consts.ts` reads that object and falls back to its build-time
//! values when it is absent, so the Cloudflare Pages deployment is unaffected.

use crate::config::Config;
use actix_web::http::header::{
    HeaderValue, CACHE_CONTROL, CONTENT_TYPE, ETAG, IF_NONE_MATCH, LOCATION,
};
use actix_web::{HttpRequest, HttpResponse};

pub struct Asset {
    pub path: &'static str,
    pub content_type: &'static str,
    pub bytes: &'static [u8],
}

include!(concat!(env!("OUT_DIR"), "/web_assets.rs"));

/// The SPA shell. Every unmatched route is answered with this so client-side
/// routing works on a hard refresh.
const INDEX: &str = "index.html";

/// Whether a UI was compiled in at all.
pub fn is_embedded() -> bool {
    !ASSETS.is_empty()
}

pub fn asset_count() -> usize {
    ASSETS.len()
}

fn find(path: &str) -> Option<&'static Asset> {
    ASSETS.iter().find(|asset| asset.path == path)
}

/// Request paths the SPA must never answer, because the API owns them.
///
/// Mirrors `navigateFallbackDenylist` in `apps/web/vite.config.ts` — the same
/// list the service worker uses — so the server and the service worker agree
/// on what is an API route. Dropbox and Google Drive are absent here because
/// both are unused.
const API_PREFIXES: &[&str] = &[
    "xrpc/",
    "oauth",
    "login",
    "logout",
    "token",
    "jwks.json",
    "oauth-client-metadata.json",
    "client-metadata.json",
    "spotify/",
    "now-playing",
    "now-playings",
    "likes",
    "public/",
    "scrobbles",
    "tracks",
    "albums",
    "artists",
    "proxy-image",
    "healthz",
];

/// Whether `path` (no leading slash) belongs to the API rather than the SPA.
pub fn is_api_path(path: &str) -> bool {
    API_PREFIXES.iter().any(|prefix| {
        if let Some(prefix) = prefix.strip_suffix('/') {
            // A directory prefix matches the segment and anything under it.
            path == prefix
                || path
                    .strip_prefix(prefix)
                    .is_some_and(|r| r.starts_with('/'))
        } else {
            path == *prefix
        }
    })
}

/// Files that must not be cached, because the client has no hashed URL to
/// notice a change by. Everything else out of Vite carries a content hash and
/// is safe to cache forever.
fn is_immutable(path: &str) -> bool {
    if path.ends_with(".html") || path.ends_with(".webmanifest") {
        return false;
    }
    // The service worker and its registration shim must always be revalidated,
    // or a stale worker keeps serving an old build indefinitely.
    let file = path.rsplit('/').next().unwrap_or(path);
    !(file.starts_with("sw") || file.starts_with("registerSW") || file == "manifest.json")
}

/// The origin the browser reached this instance at, honouring the headers a
/// reverse proxy sets. Without this, an instance behind TLS termination would
/// hand the UI an `http://` API URL and every call would be blocked as mixed
/// content.
fn request_origin(req: &HttpRequest) -> Option<String> {
    let header = |name: &str| {
        req.headers()
            .get(name)?
            .to_str()
            .ok()
            .map(str::trim)
            .filter(|value| !value.is_empty())
    };

    // X-Forwarded-* may be a comma-separated chain; the first entry is the
    // original client-facing value.
    let first = |value: &str| value.split(',').next().unwrap_or(value).trim().to_string();

    let host = header("x-forwarded-host")
        .map(first)
        .or_else(|| header("host").map(first))?;

    let scheme = header("x-forwarded-proto")
        .map(first)
        .unwrap_or_else(|| req.connection_info().scheme().to_string());

    Some(format!("{scheme}://{host}"))
}

/// Builds the `window.__ROCKSKY_CONFIG__` payload for this request.
fn runtime_config(req: &HttpRequest, config: &Config) -> serde_json::Value {
    let origin = request_origin(req);

    let api_url = config
        .web_api_url
        .clone()
        .or_else(|| origin.clone())
        .unwrap_or_else(|| config.public_url.clone());

    // The live-feed websocket. This binary serves no socket of its own, so
    // the same-origin default the other URLs use would be wrong here — an
    // upgrade against this origin falls through to the SPA fallback and the
    // handshake dies on an HTML answer, which is what "the feed never moves"
    // looked like. The official `apps/ws` deployment is the default;
    // `[web] ws_url` points a self-hosted instance at its own.
    //
    // It has to be injected rather than redirected: the browser WebSocket
    // API does not follow a 3xx on the handshake.
    let ws_url = config
        .web_ws_url
        .clone()
        .unwrap_or_else(|| "wss://ws.rocksky.app".to_string());

    let mut value = serde_json::json!({
        "apiUrl": api_url,
        "cdnUrl": config.cdn_url,
        "mediaCdnUrl": config.media_cdn_url,
        "selfHosted": true,
    });

    value["wsUrl"] = serde_json::Value::String(ws_url);
    value
}

/// Injects the runtime config into the HTML shell, immediately before
/// `</head>` so it is set before any application script runs.
fn inject_config(html: &str, config: serde_json::Value) -> String {
    let script = format!(
        "<script>window.__ROCKSKY_CONFIG__={};</script>",
        // serde_json escapes `<` as-is, so close the tag defensively: a `</script>`
        // inside a string value would otherwise end the block early.
        serde_json::to_string(&config)
            .unwrap_or_else(|_| "{}".to_string())
            .replace("</", "<\\/")
    );

    match html.find("</head>") {
        Some(index) => {
            let mut out = String::with_capacity(html.len() + script.len());
            out.push_str(&html[..index]);
            out.push_str(&script);
            out.push_str(&html[index..]);
            out
        }
        // No <head> to inject into: prepend rather than silently dropping the
        // config, which would leave the UI pointing at its build-time default.
        None => format!("{script}{html}"),
    }
}

/// Answers a request for the SPA: an exact asset match, or the shell.
pub fn serve(req: &HttpRequest, config: &Config) -> HttpResponse {
    let path = req.path().trim_start_matches('/');

    if !is_embedded() {
        return not_built();
    }

    // A directory-style request is the shell, not a 404.
    let lookup = if path.is_empty() { INDEX } else { path };

    match find(lookup) {
        Some(asset) if lookup != INDEX => serve_asset(req, asset),
        // index.html always goes through injection, so it is never served raw.
        _ => serve_shell(req, config),
    }
}

fn serve_asset(req: &HttpRequest, asset: &'static Asset) -> HttpResponse {
    // Content-addressed by build: the bytes cannot change without the path
    // changing, so a length-and-path tag is a sound validator.
    let etag = format!("\"{:x}-{}\"", asset.bytes.len(), asset.path.len());

    if req
        .headers()
        .get(IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(',').any(|tag| tag.trim() == etag))
    {
        return HttpResponse::NotModified().finish();
    }

    let cache_control = if is_immutable(asset.path) {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };

    HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, asset.content_type))
        .insert_header((CACHE_CONTROL, cache_control))
        .insert_header((ETAG, HeaderValue::from_str(&etag).unwrap()))
        .body(asset.bytes)
}

fn serve_shell(req: &HttpRequest, config: &Config) -> HttpResponse {
    let Some(asset) = find(INDEX) else {
        return not_built();
    };

    let html = match std::str::from_utf8(asset.bytes) {
        Ok(html) => html,
        Err(_) => return not_built(),
    };

    HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, "text/html; charset=utf-8"))
        // The shell names hashed assets, so it must always be revalidated.
        .insert_header((CACHE_CONTROL, "no-cache"))
        .body(inject_config(html, runtime_config(req, config)))
}

/// Shown when the binary was built without `apps/web/dist`. A plain
/// instruction beats a blank 404 for someone self-hosting from source.
fn not_built() -> HttpResponse {
    HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, "text/html; charset=utf-8"))
        .body(
            "<!doctype html><meta charset=utf-8><title>Rocksky</title>\
             <style>body{font:16px/1.6 system-ui;margin:4rem auto;max-width:44rem;padding:0 1rem}\
             code{background:#eee;padding:.15em .4em;border-radius:.25em}</style>\
             <h1>Rocksky AppView</h1>\
             <p>The API is running, but no web UI was compiled into this binary.</p>\
             <p>Build it and rebuild:</p>\
             <pre><code>cd apps/web &amp;&amp; bun install &amp;&amp; bun run build\n\
             cargo build --release -p rocksky-appview</code></pre>\
             <p>Or point the build at an existing bundle with \
             <code>ROCKSKY_WEB_DIST=/path/to/dist</code>.</p>\
             <p>The XRPC API is available under <code>/xrpc/</code>.</p>",
        )
}

/// Redirects a bare `/xrpc` style mistake to the SPA rather than 404ing it.
#[allow(dead_code)]
pub fn redirect_to_root() -> HttpResponse {
    HttpResponse::Found()
        .insert_header((LOCATION, "/"))
        .finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::test::TestRequest;

    #[test]
    fn api_paths_are_not_claimed_by_the_spa() {
        assert!(is_api_path("xrpc/app.rocksky.feed.getFeed"));
        assert!(is_api_path("oauth"));
        assert!(is_api_path("oauth-client-metadata.json"));
        assert!(is_api_path("login"));
        assert!(is_api_path("now-playing"));
        assert!(is_api_path("spotify/callback"));
        assert!(is_api_path("public/scrobbles"));
        assert!(is_api_path("healthz"));
    }

    #[test]
    fn spa_routes_are_not_mistaken_for_api_paths() {
        // These are real pages in the app; claiming them for the API would
        // break a hard refresh on any of them.
        assert!(!is_api_path(""));
        assert!(!is_api_path("profile/someone.rocksky.app"));
        assert!(!is_api_path("settings"));
        assert!(!is_api_path("charts"));
        // A prefix match must respect segment boundaries.
        assert!(!is_api_path("tracksomething"));
        assert!(!is_api_path("logins"));
        assert!(!is_api_path("xrpcsomething"));
    }

    #[test]
    fn hashed_assets_cache_forever_and_entrypoints_do_not() {
        assert!(is_immutable("assets/index-CSQLldyB.js"));
        assert!(is_immutable("assets/JetBrainsMono-Bold-CUogYd9I.woff2"));
        assert!(is_immutable("rockbox/rockbox-core.js"));

        assert!(!is_immutable("index.html"));
        assert!(!is_immutable("manifest.webmanifest"));
        // A stale service worker would otherwise pin an old build forever.
        assert!(!is_immutable("registerSW.js"));
        assert!(!is_immutable("sw.js"));
    }

    #[test]
    fn config_is_injected_before_the_application_script() {
        let html = "<!doctype html><html><head><title>Rocksky</title></head>\
                    <body><script src=\"/assets/index.js\"></script></body></html>";
        let out = inject_config(html, serde_json::json!({ "apiUrl": "http://x" }));

        let script = out.find("__ROCKSKY_CONFIG__").expect("injected");
        let head_end = out.find("</head>").expect("head");
        let app = out.find("/assets/index.js").expect("app script");
        assert!(script < head_end, "must be inside <head>");
        assert!(
            script < app,
            "config must be set before the app script loads"
        );
    }

    #[test]
    fn injection_without_a_head_still_sets_the_config() {
        let out = inject_config("<div id=root></div>", serde_json::json!({ "apiUrl": "x" }));
        assert!(out.contains("__ROCKSKY_CONFIG__"));
    }

    #[test]
    fn a_closing_script_tag_in_a_value_cannot_break_out() {
        let out = inject_config(
            "<head></head>",
            serde_json::json!({ "apiUrl": "</script><script>alert(1)</script>" }),
        );
        // Exactly one *closing* tag: the injected block's own. An unescaped
        // `</script>` in the value would have ended the block early and let
        // the rest of the payload execute as markup.
        assert_eq!(out.matches("</script>").count(), 1, "{out}");
        assert!(out.contains("<\\/script>"), "{out}");
        // The payload survives as inert data inside the JS string literal.
        assert!(out.contains(r"alert(1)<\/script>"), "{out}");
    }

    #[test]
    fn the_api_url_follows_the_request_host() {
        let config = Config::for_test();

        let req = TestRequest::get()
            .uri("/")
            .insert_header(("host", "rocksky.local:3004"))
            .to_http_request();
        let value = runtime_config(&req, &config);
        assert_eq!(value["apiUrl"], "http://rocksky.local:3004");
        // NOT the request origin: `wsUrl` is the *feed* socket, which only
        // `apps/ws` speaks — this binary serves no socket at that path, so a
        // same-origin default was a handshake against the SPA fallback. The
        // remote-player socket is different: it is `apiUrl` + `/ws`, which
        // this binary proxies (`rest::remote`), so it does follow the origin.
        assert_eq!(value["wsUrl"], "wss://ws.rocksky.app");
    }

    #[test]
    fn forwarded_headers_win_so_tls_termination_works() {
        let config = Config::for_test();

        let req = TestRequest::get()
            .uri("/")
            .insert_header(("host", "127.0.0.1:3004"))
            .insert_header(("x-forwarded-host", "rocksky.example"))
            .insert_header(("x-forwarded-proto", "https"))
            .to_http_request();
        let value = runtime_config(&req, &config);

        // Answering http:// here would get every API call blocked as mixed
        // content on an https page.
        assert_eq!(value["apiUrl"], "https://rocksky.example");
        // The feed socket does not follow the origin — see above.
        assert_eq!(value["wsUrl"], "wss://ws.rocksky.app");
    }

    #[test]
    fn a_forwarded_chain_uses_the_client_facing_entry() {
        let config = Config::for_test();

        let req = TestRequest::get()
            .uri("/")
            .insert_header(("x-forwarded-host", "rocksky.example, internal.lb"))
            .insert_header(("x-forwarded-proto", "https, http"))
            .to_http_request();
        let value = runtime_config(&req, &config);
        assert_eq!(value["apiUrl"], "https://rocksky.example");
    }

    #[test]
    fn an_explicit_api_url_overrides_the_request_origin() {
        let mut config = Config::for_test();
        config.web_api_url = Some("https://api.example.test".into());

        let req = TestRequest::get()
            .uri("/")
            .insert_header(("host", "rocksky.local"))
            .to_http_request();
        assert_eq!(
            runtime_config(&req, &config)["apiUrl"],
            "https://api.example.test"
        );
    }

    #[test]
    fn a_request_without_a_host_falls_back_to_the_public_url() {
        let config = Config::for_test();
        let req = TestRequest::get().uri("/").to_http_request();
        assert_eq!(runtime_config(&req, &config)["apiUrl"], config.public_url);
    }
}
