//! Exact-origin CORS for separately hosted clients. Same-origin clients need no configuration.
use actix_cors::Cors;
use anyhow::{ensure, Context, Result};

pub fn origins_from_env() -> Result<Vec<String>> {
    parse_origins(&std::env::var("SUBMISSIONS_CORS_ORIGINS").unwrap_or_default())
}
fn parse_origins(value: &str) -> Result<Vec<String>> {
    value.split(',').map(str::trim).filter(|s| !s.is_empty()).map(|origin| {
        let url = reqwest::Url::parse(origin).context("invalid SUBMISSIONS_CORS_ORIGINS origin")?;
        ensure!(!origin.contains('*') && matches!(url.scheme(), "https" | "http") && url.host_str().is_some()
            && url.username().is_empty() && url.password().is_none() && url.query().is_none()
            && url.fragment().is_none() && url.path() == "/"
            && url.origin().ascii_serialization() == origin,
            "SUBMISSIONS_CORS_ORIGINS must contain exact http(s) origins without paths, credentials, trailing slashes, or wildcards");
        Ok(origin.to_owned())
    }).collect()
}
pub fn middleware(origins: &[String]) -> Cors {
    // Don't block requests without an allowlisted Origin: same-origin POSTs carry
    // Origin too. Without ACAO browsers cannot read cross-origin responses; the
    // custom secret header triggers preflight and all handlers authenticate it.
    let mut cors = Cors::default()
        .allowed_methods(["GET", "POST", "OPTIONS"])
        .allowed_headers(["content-type", "x-rocksky-submissions-secret"])
        .max_age(600);
    for origin in origins {
        cors = cors.allowed_origin(origin);
    }
    cors
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{
        http::{header, Method, StatusCode},
        test, web, App, HttpResponse,
    };
    #[test]
    async fn validates_origin_configuration() {
        assert!(parse_origins("").unwrap().is_empty());
        assert_eq!(
            parse_origins("https://ops.example.com, http://localhost:5173")
                .unwrap()
                .len(),
            2
        );
        for value in [
            "*",
            "null",
            "https://*.example.com",
            "https://ops.example.com/",
            "https://ops.example.com/path",
            "https://u:p@example.com",
            "https://ops.example.com?x=1",
        ] {
            assert!(parse_origins(value).is_err(), "{value}");
        }
    }
    #[actix_web::test]
    async fn preflight_is_restricted_and_non_browser_requests_work() {
        let app = test::init_service(
            App::new()
                .wrap(middleware(&["https://ops.example.com".into()]))
                .route(
                    "/v1/test",
                    web::post().to(|| async { HttpResponse::Unauthorized().finish() }),
                ),
        )
        .await;
        for (origin, method, headers, allowed) in [
            (
                "https://ops.example.com",
                "POST",
                "content-type,x-rocksky-submissions-secret",
                true,
            ),
            (
                "https://evil.example.com",
                "POST",
                "x-rocksky-submissions-secret",
                false,
            ),
            (
                "https://ops.example.com.evil.com",
                "POST",
                "x-rocksky-submissions-secret",
                false,
            ),
            (
                "https://ops.example.com",
                "DELETE",
                "x-rocksky-submissions-secret",
                false,
            ),
            ("https://ops.example.com", "POST", "x-unapproved", false),
        ] {
            let request = test::TestRequest::default()
                .method(Method::OPTIONS)
                .uri("/v1/test")
                .insert_header((header::ORIGIN, origin))
                .insert_header((header::ACCESS_CONTROL_REQUEST_METHOD, method))
                .insert_header((header::ACCESS_CONTROL_REQUEST_HEADERS, headers))
                .to_request();
            let response = test::call_service(&app, request).await;
            assert_eq!(response.status().is_success(), allowed);
            if allowed {
                assert_eq!(
                    response
                        .headers()
                        .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                        .unwrap(),
                    origin
                );
                assert!(response
                    .headers()
                    .get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS)
                    .is_none());
            }
        }
        let response = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/v1/test")
                .insert_header((header::ORIGIN, "https://ops.example.com"))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .unwrap(),
            "https://ops.example.com"
        );
        assert!(response
            .headers()
            .get(header::VARY)
            .unwrap()
            .to_str()
            .unwrap()
            .contains("Origin"));
        for origin in [None, Some("http://localhost:8098")] {
            let mut request = test::TestRequest::post().uri("/v1/test");
            if let Some(origin) = origin {
                request = request.insert_header((header::ORIGIN, origin));
            }
            assert_eq!(
                test::call_service(&app, request.to_request())
                    .await
                    .status(),
                StatusCode::UNAUTHORIZED
            );
        }
    }
}
