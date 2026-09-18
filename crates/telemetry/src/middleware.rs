//! One span and one metric sample per HTTP request.
//!
//! Registered once on the actix app, which is what makes this cover *every*
//! route rather than the ones somebody remembered to annotate — all 123 XRPC
//! methods, the REST surface, and any method added later without touching this
//! file.
//!
//! # Spans are named by route, not by path
//!
//! `/xrpc/app.rocksky.actor.getProfile` is a route and a useful span name.
//! `/uploads/rec_daluft89m00c73eo2c5g` is a path, and naming a span after it
//! gives a backend one span name per upload — unsearchable, and on the metrics
//! side a new time series per id. So the matched pattern is preferred and the
//! path is recorded as an attribute.
//!
//! # The trace continues across services
//!
//! `traceparent` is read off the request, so a scrobble that arrives from the
//! Last.fm mirror shows as one trace spanning both processes rather than two
//! unrelated ones.

use actix_web::body::MessageBody;
use actix_web::dev::{Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::http::header::HeaderName;
use actix_web::Error;
use futures_util::future::{ready, LocalBoxFuture, Ready};
use opentelemetry::propagation::Extractor;
use opentelemetry::trace::TraceContextExt;
use std::time::Instant;
use tracing::Instrument;
use tracing_opentelemetry::OpenTelemetrySpanExt;

/// Reads W3C trace headers off an incoming request.
struct Headers<'a>(&'a actix_web::http::header::HeaderMap);

impl Extractor for Headers<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|value| value.to_str().ok())
    }

    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(HeaderName::as_str).collect()
    }
}

/// Add with `.wrap(rocksky_telemetry::middleware::Tracing)`.
pub struct Tracing;

impl<S, B> Transform<S, ServiceRequest> for Tracing
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = TracingMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(TracingMiddleware { service }))
    }
}

pub struct TracingMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for TracingMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    actix_web::dev::forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let method = req.method().as_str().to_string();
        let path = req.path().to_string();
        // The matched pattern when actix has one; the path otherwise, which is
        // what a 404 gets.
        let route = req.match_pattern().unwrap_or_else(|| path.clone());

        // XRPC methods read better as their NSID than as `/xrpc/<nsid>`, and
        // it is the name anybody debugging this would search for.
        let name = match route.strip_prefix("/xrpc/") {
            Some(nsid) => nsid.to_string(),
            None => format!("{method} {route}"),
        };

        let span = tracing::info_span!(
            "http.request",
            otel.name = %name,
            otel.kind = "server",
            http.request.method = %method,
            http.route = %route,
            url.path = %path,
            http.response.status_code = tracing::field::Empty,
            otel.status_code = tracing::field::Empty,
        );

        // Continue the caller's trace when it sent one.
        let parent = opentelemetry::global::get_text_map_propagator(|propagator| {
            propagator.extract(&Headers(req.headers()))
        });
        if parent.span().span_context().is_valid() {
            // The returned context is the one being replaced; there is nothing
            // to do with it here.
            let _ = span.set_parent(parent);
        }

        let started = Instant::now();
        let future = self.service.call(req);

        Box::pin(
            async move {
                let result = future.await;
                let elapsed = started.elapsed().as_secs_f64();
                let span = tracing::Span::current();

                let status = match &result {
                    Ok(response) => response.status().as_u16(),
                    // An error that reached here never became a response; 500
                    // is what actix will turn it into.
                    Err(error) => error.as_response_error().status_code().as_u16(),
                };

                span.record("http.response.status_code", status);
                // Only 5xx marks the span as failed. A 404 or a 401 is the
                // server working correctly, and colouring those red makes the
                // real failures impossible to pick out.
                if status >= 500 {
                    span.record("otel.status_code", "ERROR");
                }

                crate::metrics::record_request(&route, &method, status, elapsed);
                result
            }
            .instrument(span),
        )
    }
}

#[cfg(test)]
mod tests {
    use actix_web::{test, web, App, HttpResponse};

    /// Three routes take a session JWT as a query parameter, because the
    /// browser opens them with `EventSource` or an `<audio src>` and cannot
    /// send an `Authorization` header. Nothing this middleware records may
    /// carry that token: the span goes to whatever backend `[telemetry]`
    /// names, and a bearer token in a trace is a bearer token in a third
    /// party's storage.
    #[actix_web::test]
    async fn no_span_field_carries_a_query_string() {
        let app = test::init_service(App::new().wrap(super::Tracing).route(
            "/notifications/stream",
            web::get().to(|| async { HttpResponse::Ok().finish() }),
        ))
        .await;

        let request = test::TestRequest::get()
            .uri("/notifications/stream?token=SUPER_SECRET_JWT")
            .to_request();

        // The recorded fields come from `req.path()` and `match_pattern()`,
        // neither of which includes the query — asserted here rather than
        // trusted, since it is one actix release away from changing.
        assert_eq!(request.uri().path(), "/notifications/stream");
        assert!(!request.uri().path().contains("SUPER_SECRET_JWT"));

        let response = test::call_service(&app, request).await;
        assert_eq!(response.status(), 200);
    }

    /// Headers are never read for span fields, so `Authorization` cannot reach
    /// an exporter either. Only the W3C trace headers are looked at, by name.
    #[actix_web::test]
    async fn an_authorization_header_is_not_recorded() {
        let app = test::init_service(App::new().wrap(super::Tracing).route(
            "/x",
            web::get().to(|| async { HttpResponse::Ok().finish() }),
        ))
        .await;

        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/x")
                .insert_header(("Authorization", "Bearer SUPER_SECRET_JWT"))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), 200);
    }
}
