//! HTTP server assembly.
//!
//! Layout of the routing table, in the order a request is matched:
//!
//! 1. `/healthz` — liveness, and a cheap way to confirm the database opened.
//! 2. `/xrpc/{nsid}` — the `app.rocksky.*` methods ([`crate::xrpc`]).
//! 3. anything else — the embedded SPA, unless the path belongs to the API
//!    ([`crate::web::is_api_path`]), in which case it goes upstream if an
//!    upstream is configured and 404s otherwise.
//!
//! That last rule is what lets the web UI point its API base URL at this same
//! origin: API routes and app routes share one port without colliding.

use crate::sea_query::{Expr, Query};
use crate::state::AppState;
use crate::web;
use actix_cors::Cors;
use actix_web::http::header::{HeaderName, HeaderValue};
use actix_web::http::Method;
use actix_web::{middleware, web as axweb, App, HttpRequest, HttpResponse, HttpServer};

/// Hop-by-hop headers that must not be copied when proxying. Forwarding these
/// corrupts the connection: `Host` would send the upstream the wrong vhost and
/// the framing headers would contradict the new response body.
const HOP_BY_HOP: &[&str] = &[
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "content-length",
];

/// Builds the CORS policy. Permissive by default — a personal instance gets
/// called from whatever host its owner is on, and the API authenticates with
/// bearer tokens rather than cookies, so `Access-Control-Allow-Origin: *` is
/// not a credential-leak risk. `[server].cors_origins` narrows it.
fn cors(state: &AppState) -> Cors {
    match &state.config().cors_origins {
        None => Cors::permissive(),
        Some(origins) => {
            let mut cors = Cors::default()
                .allow_any_method()
                .allow_any_header()
                .supports_credentials()
                .max_age(3600);
            for origin in origins {
                cors = cors.allowed_origin(origin);
            }
            cors
        }
    }
}

async fn healthz(state: axweb::Data<AppState>) -> HttpResponse {
    // A trivial query, so the check fails if the database is gone rather than
    // reporting healthy while every real request errors.
    //
    // `1i64`, not `1`: `count` decodes column 0 as an `i64`, and an `i32`
    // literal is `int4` on Postgres, which sqlx refuses to decode into one.
    // With the narrower literal this endpoint reported "database unavailable"
    // on every Postgres deployment no matter how healthy the database was —
    // and no test caught it, because the test backend is SQLite.
    let probe = Query::select().expr(Expr::val(1i64)).to_owned();
    match state.db().count(&probe).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "status": "ok",
            "version": env!("CARGO_PKG_VERSION"),
            "web": web::is_embedded(),
        })),
        Err(err) => {
            tracing::error!(error = %err, "health check failed");
            HttpResponse::ServiceUnavailable()
                .json(serde_json::json!({ "status": "database unavailable" }))
        }
    }
}

/// Forwards a request to the configured upstream, reproducing the
/// `http-proxy-middleware` fallback in `apps/api/src/server.ts`. Only reached
/// when `[server].upstream_url` is set; a standalone instance never proxies.
async fn proxy(req: &HttpRequest, body: axweb::Bytes, state: &AppState) -> HttpResponse {
    let Some(upstream) = state.config().upstream_url.as_deref() else {
        return not_found(req);
    };

    let target = format!(
        "{}{}",
        upstream.trim_end_matches('/'),
        req.uri()
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/")
    );

    let method = reqwest::Method::from_bytes(req.method().as_str().as_bytes())
        .unwrap_or(reqwest::Method::GET);
    let mut outbound = state.http().request(method, &target);

    for (name, value) in req.headers() {
        if HOP_BY_HOP.contains(&name.as_str().to_ascii_lowercase().as_str()) {
            continue;
        }
        outbound = outbound.header(name.as_str(), value.as_bytes());
    }

    if !body.is_empty() {
        outbound = outbound.body(body.to_vec());
    }

    match outbound.send().await {
        Ok(response) => {
            let status = actix_web::http::StatusCode::from_u16(response.status().as_u16())
                .unwrap_or(actix_web::http::StatusCode::BAD_GATEWAY);
            let mut builder = HttpResponse::build(status);

            for (name, value) in response.headers() {
                if HOP_BY_HOP.contains(&name.as_str().to_ascii_lowercase().as_str()) {
                    continue;
                }
                if let (Ok(name), Ok(value)) = (
                    HeaderName::from_bytes(name.as_str().as_bytes()),
                    HeaderValue::from_bytes(value.as_bytes()),
                ) {
                    builder.insert_header((name, value));
                }
            }

            match response.bytes().await {
                Ok(bytes) => builder.body(bytes),
                Err(err) => {
                    tracing::warn!(error = %err, target, "upstream body read failed");
                    HttpResponse::BadGateway().finish()
                }
            }
        }
        Err(err) => {
            tracing::warn!(error = %err, target, "upstream request failed");
            HttpResponse::BadGateway().json(serde_json::json!({
                "error": "UpstreamFailure",
                "message": "The upstream service could not be reached",
            }))
        }
    }
}

/// A 404 in the shape the caller expects: the XRPC envelope under `/xrpc`,
/// plain JSON elsewhere.
fn not_found(req: &HttpRequest) -> HttpResponse {
    if req.path().starts_with("/xrpc/") {
        let nsid = req.path().trim_start_matches("/xrpc/");
        return HttpResponse::NotFound().json(serde_json::json!({
            "error": "MethodNotImplemented",
            "message": format!("Method not implemented: {nsid}"),
        }));
    }
    HttpResponse::NotFound().json(serde_json::json!({
        "error": "NotFound",
        "message": "Not found",
    }))
}

/// Everything that did not match a registered route.
async fn fallback(
    req: HttpRequest,
    body: axweb::Bytes,
    state: axweb::Data<AppState>,
) -> HttpResponse {
    let path = req.path().trim_start_matches('/').to_string();

    // A CORS preflight for a route we do not have still needs the CORS
    // headers, which the middleware only adds to a response it sees.
    if req.method() == Method::OPTIONS {
        return HttpResponse::NoContent().finish();
    }

    if web::is_api_path(&path) {
        return if state.config().upstream_url.is_some() {
            proxy(&req, body, &state).await
        } else {
            not_found(&req)
        };
    }

    // Client-side routing: an unknown path is a page, not a missing file.
    web::serve(&req, state.config())
}

/// Starts the server and blocks until it stops.
pub async fn run(state: AppState) -> std::io::Result<()> {
    let config = state.config().clone();
    let bind = (config.host.clone(), config.port);

    tracing::info!("{}", config.summary());
    // Loud on purpose: an instance on a VPS that still calls itself localhost
    // serves traffic fine and then fails at login, which is a miserable thing
    // to debug.
    if let Some(warning) = config.public_deployment_warning() {
        tracing::warn!("{warning}");
    }
    if web::is_embedded() {
        tracing::info!(assets = web::asset_count(), "serving the embedded web UI");
    } else {
        tracing::warn!("no web UI embedded; serving the API only");
    }
    tracing::info!("listening on http://{}:{}", bind.0, bind.1);

    HttpServer::new(move || {
        let state = state.clone();
        App::new()
            // `app_data(state)` (not `Data::new`) is what the auth extractors
            // read via `app_data::<AppState>()`; `Data` is registered too so
            // handlers can take `Data<AppState>`.
            .app_data(state.clone())
            .app_data(axweb::Data::new(state.clone()))
            .wrap(middleware::NormalizePath::trim())
            .wrap(cors(&state))
            .wrap(middleware::Compress::default())
            .wrap(tracing_actix_middleware())
            // One span and one metric sample per request, for every route
            // this app serves — all 123 XRPC methods and the REST surface,
            // without any of them being annotated individually.
            .wrap(rocksky_telemetry::middleware::Tracing)
            .route("/healthz", axweb::get().to(healthz))
            .configure(crate::rest::configure)
            .configure(crate::xrpc::configure)
            .default_service(axweb::to(fallback))
    })
    .bind(bind)?
    .run()
    .await
}

/// Request logging through `tracing` rather than actix's `Logger`, so the
/// output joins the same structured stream as everything else.
///
/// # `%U` and not `%r`, because `%r` carries the query string
///
/// `%r` is the request line, and actix interpolates `path?query` into it.
/// Three routes take a session JWT as a query parameter — the notification
/// stream, the import event stream and an upload's stream URL, all of which
/// the browser opens with `EventSource` or an `<audio src>` and so cannot send
/// an `Authorization` header on. Logging `%r` put those tokens in the log, and
/// since these logs are now exported over OTLP it would put them in whatever
/// backend `[telemetry]` names.
///
/// `%U` is `req.path()`, which has no query string in it. The method is
/// prefixed explicitly, since dropping `%r` drops that too.
fn tracing_actix_middleware() -> middleware::Logger {
    // actix's Logger writes via the `log` facade, which `tracing-subscriber`
    // picks up through the `log` tracer installed in main.
    middleware::Logger::new("%{METHOD}xi %U %s %Dms")
        .custom_request_replace("METHOD", |req| req.method().to_string())
        .log_target("rocksky_appview::http")
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    macro_rules! app {
        ($state:expr) => {
            test::init_service(
                App::new()
                    .app_data($state.clone())
                    .app_data(axweb::Data::new($state.clone()))
                    .wrap(cors(&$state))
                    .route("/healthz", axweb::get().to(healthz))
                    .configure(crate::rest::configure)
                    .configure(crate::xrpc::configure)
                    .default_service(axweb::to(fallback)),
            )
            .await
        };
    }

    #[actix_web::test]
    async fn healthz_reports_ok_with_a_live_database() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res =
            test::call_service(&app, test::TestRequest::get().uri("/healthz").to_request()).await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["status"], "ok");
    }

    #[actix_web::test]
    async fn cors_allows_any_origin_by_default() {
        let state = AppState::for_test().await.unwrap();
        assert!(
            state.config().cors_origins.is_none(),
            "the default must be permissive"
        );
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/healthz")
                .insert_header(("origin", "https://somewhere.example"))
                .to_request(),
        )
        .await;

        let allow = res
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok());
        assert!(allow.is_some(), "CORS headers must be present: {res:?}");
    }

    #[actix_web::test]
    async fn an_unknown_xrpc_method_is_a_method_not_implemented_envelope() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/xrpc/app.rocksky.nope.doesNotExist")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 404);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["error"], "MethodNotImplemented");
    }

    #[actix_web::test]
    async fn an_unknown_page_route_gets_the_spa_shell() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/profile/someone.rocksky.app")
                .to_request(),
        )
        .await;
        // Deep links must survive a hard refresh.
        assert_eq!(res.status(), 200);
        let content_type = res
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        assert!(content_type.starts_with("text/html"), "{content_type}");
    }

    #[actix_web::test]
    async fn an_api_route_with_no_upstream_is_a_404_not_the_spa() {
        let state = AppState::for_test().await.unwrap();
        assert!(state.config().upstream_url.is_none());
        let app = app!(state);

        // Answering these with the HTML shell would make a fetch() failure
        // look like a JSON parse error, which is much harder to diagnose.
        for path in ["/now-playing", "/likes", "/public/scrobbles"] {
            let res =
                test::call_service(&app, test::TestRequest::get().uri(path).to_request()).await;
            assert_eq!(res.status(), 404, "{path}");
            let content_type = res
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default();
            assert!(content_type.contains("json"), "{path}: {content_type}");
        }
    }

    #[actix_web::test]
    async fn preflight_requests_to_unknown_routes_do_not_404() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::default()
                .method(Method::OPTIONS)
                .uri("/xrpc/app.rocksky.nope")
                .to_request(),
        )
        .await;
        assert!(res.status().is_success(), "{:?}", res.status());
    }
}
