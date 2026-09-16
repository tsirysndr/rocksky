//! `/.well-known/did.json` and the health endpoints.
//!
//! A feed generator is an ATProto service, so it needs a resolvable DID. This
//! one uses `did:web`, which means the document is served from its own domain
//! rather than registered with the PLC directory — no key management, and the
//! document changes by editing the config.

use crate::FeedsState;
use actix_web::web::{self, ServiceConfig};
use actix_web::{HttpResponse, Responder};

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/.well-known/did.json", web::get().to(did_document))
        .route("/xrpc/_health", web::get().to(health))
        .route("/", web::get().to(index));
}

/// The `did:web` document.
///
/// The service `type` is `RockskyFeedGenerator` rather than Bluesky's
/// `BskyFeedGenerator`: these feeds carry scrobbles, not posts, and a client
/// looking for one should not find the other.
async fn did_document(state: web::Data<FeedsState>) -> impl Responder {
    let domain = &state.config().domain;

    HttpResponse::Ok().json(serde_json::json!({
        "@context": ["https://www.w3.org/ns/did/v1"],
        "id": state.config().own_did(),
        "service": [{
            "id": "#rocksky_fg",
            "type": "RockskyFeedGenerator",
            "serviceEndpoint": format!("https://{domain}"),
        }],
    }))
}

async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn index() -> impl Responder {
    HttpResponse::Ok().body(
        "This is a feed generator for the \"rocksky.app\" application.\n\
         Most API routes are under /xrpc/\n",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test as http, App};

    /// The document is how a client resolves this service. A wrong `id` or a
    /// missing endpoint makes every feed unreachable.
    #[actix_web::test]
    async fn the_did_document_describes_this_service() {
        let db = rocksky_db::connect_in_memory().await.unwrap();
        let state = FeedsState::new(db, crate::Config::for_test());
        let app = http::init_service(
            App::new()
                .app_data(web::Data::new(state))
                .configure(crate::configure),
        )
        .await;

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/.well-known/did.json")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["id"], "did:web:feeds.example.com");
        assert_eq!(body["service"][0]["type"], "RockskyFeedGenerator");
        assert_eq!(
            body["service"][0]["serviceEndpoint"],
            "https://feeds.example.com"
        );
        // The DID must match what describeFeedGenerator advertises, or a
        // client resolves one service and talks to another.
        assert_eq!(body["id"], crate::Config::for_test().own_did());
    }
}
