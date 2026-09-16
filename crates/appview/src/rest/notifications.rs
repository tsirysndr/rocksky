//! `GET /notifications/stream` — a live notification feed, over Server-Sent
//! Events.
//!
//! # Why the token is in the query string
//!
//! `EventSource` cannot set request headers. There is no way for the browser
//! to send `Authorization` on this request, so the JWT travels as `?token=`,
//! exactly as `apps/api` does it — the same `apps/web` bundle talks to both.
//!
//! That is a real cost: a URL ends up in browser history, in proxy logs and in
//! `Referer` on any resource the page loads afterwards. It is accepted here
//! only because the alternative is no live notifications at all. The
//! mitigation is that the token is checked exactly as a bearer token would be,
//! and a revoked one stops working immediately — see [`crate::auth::jwt`],
//! where an access token's `jti` is looked up on every verification.
//!
//! # Three kinds of event
//!
//! | event          | when                                  | data                      |
//! |----------------|---------------------------------------|---------------------------|
//! | `unread`       | once, on connect                      | `{"unreadCount": n}`      |
//! | `notification` | when one is published for this user   | the notification, as JSON |
//! | `ping`         | every 25 seconds                      | empty                     |
//!
//! The heartbeat is not decoration. An idle connection through a reverse proxy
//! is dropped after a minute or so by most defaults, and the browser's
//! reconnect makes that look like a flapping feed; a comment frame every 25
//! seconds keeps it open.

use crate::db::schema::{Notifications, Users};
use crate::db::Backend;
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Expr, Func, Query};
use crate::state::AppState;
use actix_web::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::Deserialize;
use std::time::Duration;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/notifications/stream", web::get().to(stream));
}

/// How often to send a keep-alive.
///
/// Under the common 60-second proxy idle timeout, with room for one to be lost
/// without the connection being reaped.
const HEARTBEAT: Duration = Duration::from_secs(25);

#[derive(Debug, Deserialize)]
pub struct StreamParams {
    pub token: String,
}

async fn stream(
    state: web::Data<AppState>,
    params: web::Query<StreamParams>,
) -> XrpcResult<HttpResponse> {
    // Verified the same way a bearer token is, so a revoked access token stops
    // working here too rather than keeping a stream alive indefinitely.
    let claims =
        crate::auth::jwt::verify_token(state.db(), &state.config().jwt_secret, &params.token)
            .await
            .map_err(|_| XrpcError::auth_required("Unauthorized"))?;

    let did = claims
        .did
        .as_deref()
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))?;

    let user_id = caller_id(state.db(), did)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))?;

    let Some(events) = state.events() else {
        // Only reachable under test — the bus is required at boot.
        return Err(XrpcError::with_message(
            crate::error::ResponseType::MethodNotImplemented,
            "Live notifications are unavailable on this instance.",
        )
        .named("StreamUnavailable"));
    };

    let subject = crate::events::Events::notification_subject(&user_id);
    let subscriber = events.subscribe(subject.clone()).await.map_err(|err| {
        tracing::error!(error = %err, subject = %subject, "could not subscribe for notifications");
        XrpcError::with_message(
            crate::error::ResponseType::UpstreamFailure,
            "Could not open the notification stream.",
        )
        .named("SubscribeFailed")
    })?;

    // Read before the stream starts so the first frame is the current state
    // rather than the client having to call `getUnreadCount` separately.
    let unread = unread_count(state.db(), &user_id)
        .await
        .unwrap_or_else(|err| {
            tracing::error!(error = ?err, "could not read the unread count");
            0
        });

    tracing::debug!(did, user_id = %user_id, "opened a notification stream");

    Ok(HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, "text/event-stream"))
        // `no-transform` as well as `no-cache`: a proxy that gzips this would
        // buffer it, and a buffered event stream is not a stream.
        .insert_header((CACHE_CONTROL, "no-cache, no-transform"))
        .insert_header(("X-Accel-Buffering", "no"))
        .streaming(body(subscriber, unread)))
}

/// The event stream: one priming frame, then notifications and heartbeats
/// until the client goes away.
fn body(
    subscriber: async_nats::Subscriber,
    unread: i64,
) -> impl futures::Stream<Item = Result<web::Bytes, actix_web::Error>> {
    use futures::StreamExt;

    let primer = futures::stream::once(async move {
        Ok(frame(
            "unread",
            &serde_json::json!({ "unreadCount": unread }).to_string(),
        ))
    });

    let notifications = subscriber.map(|message| {
        // The payload is whatever the publisher sent, passed through as the
        // event data rather than re-parsed: this endpoint is a transport, and
        // re-encoding would only add a way to corrupt it.
        let data = String::from_utf8_lossy(&message.payload).to_string();
        Ok(frame("notification", &data))
    });

    let heartbeats = futures::stream::unfold((), |()| async {
        tokio::time::sleep(HEARTBEAT).await;
        Some((Ok(frame("ping", "")), ()))
    });

    // `select` rather than `chain`: a heartbeat has to be able to go out while
    // the notification stream is idle, which is the entire point of it.
    primer.chain(futures::stream::select(notifications, heartbeats))
}

/// One SSE frame.
///
/// The blank line terminates the event — without it the browser buffers
/// waiting for more of the same one.
fn frame(event: &str, data: &str) -> web::Bytes {
    web::Bytes::from(format!("event: {event}\ndata: {data}\n\n"))
}

async fn caller_id(db: &Backend, did: &str) -> XrpcResult<Option<String>> {
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .to_owned();
    Ok(db.fetch_scalar::<String>(&query).await?)
}

async fn unread_count(db: &Backend, user_id: &str) -> Result<i64, sqlx::Error> {
    let query = Query::select()
        .expr(db.cast_int(Func::count(Expr::col(Notifications::XataId))))
        .from(Notifications::Table)
        .and_where(Expr::col(Notifications::UserId).eq(user_id))
        .and_where(Expr::col(Notifications::Read).eq(false))
        .to_owned();
    db.count(&query).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test as http, App};

    macro_rules! app {
        ($state:expr) => {
            http::init_service(
                App::new()
                    .app_data($state.clone())
                    .app_data(web::Data::new($state.clone()))
                    .configure(crate::rest::configure),
            )
            .await
        };
    }

    /// The frame format is the protocol. A missing blank line means the
    /// browser buffers the event forever, which looks like a stream that
    /// connects and then does nothing.
    #[test]
    fn a_frame_is_terminated_by_a_blank_line() {
        let rendered = frame("notification", r#"{"id":"rec_1"}"#);
        assert_eq!(
            std::str::from_utf8(&rendered).unwrap(),
            "event: notification\ndata: {\"id\":\"rec_1\"}\n\n"
        );

        // And a heartbeat still needs the terminator, even with no data.
        assert_eq!(
            std::str::from_utf8(&frame("ping", "")).unwrap(),
            "event: ping\ndata: \n\n"
        );
    }

    /// A dot in the id would create a NATS subtree rather than a subject, and
    /// the subscriber would never match what the publisher sent.
    #[test]
    fn the_subject_cannot_be_broken_by_an_odd_id() {
        assert_eq!(
            crate::events::Events::notification_subject("rec_abc123"),
            "rocksky.notification.rec_abc123"
        );
        assert_eq!(
            crate::events::Events::notification_subject("a.b"),
            "rocksky.notification.a_b"
        );
        assert_eq!(
            crate::events::Events::notification_subject("a *"),
            "rocksky.notification.a__"
        );
        // And a wildcard cannot be smuggled in to subscribe to everyone's.
        assert!(!crate::events::Events::notification_subject("*").contains('*'));
        assert!(!crate::events::Events::notification_subject(">").contains('>'));
    }

    /// No token, a malformed token and a token for an unknown account are all
    /// 401 — never an open stream.
    #[actix_web::test]
    async fn an_unauthenticated_stream_is_refused() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/notifications/stream")
                .to_request(),
        )
        .await;
        // No `token` at all fails to deserialize the query, which actix
        // reports as a bad request.
        assert!(
            res.status() == 400 || res.status() == 401,
            "{}",
            res.status()
        );

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/notifications/stream?token=not-a-jwt")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
    }

    /// A valid token for an account with no row is still 401: the stream is
    /// keyed on the row id, so there would be nothing to subscribe to.
    #[actix_web::test]
    async fn a_token_for_an_unknown_account_is_refused() {
        let state = AppState::for_test().await.unwrap();
        let token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:nobody").unwrap();
        let app = app!(state);

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri(&format!("/notifications/stream?token={token}"))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
    }

    /// The unread count is what primes the stream, so it has to be right.
    #[tokio::test]
    async fn the_unread_count_ignores_read_and_other_users() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let alice = crate::ingest::upsert_user(&db, "did:plc:alice")
            .await
            .unwrap();
        let bob = crate::ingest::upsert_user(&db, "did:plc:bob")
            .await
            .unwrap();

        for (id, user, read) in [
            ("rec_n1", &alice, false),
            ("rec_n2", &alice, false),
            ("rec_n3", &alice, true),
            ("rec_n4", &bob, false),
        ] {
            let insert = Query::insert()
                .into_table(Notifications::Table)
                .columns([
                    Notifications::XataId,
                    Notifications::UserId,
                    // NOT NULL: a notification is always *by* somebody, even
                    // when that somebody is the recipient's own account.
                    Notifications::ActorId,
                    Notifications::Type,
                    Notifications::Read,
                ])
                .values_panic([
                    id.into(),
                    user.clone().into(),
                    user.clone().into(),
                    "like".into(),
                    read.into(),
                ])
                .to_owned();
            db.execute(&insert).await.unwrap();
        }

        assert_eq!(unread_count(&db, &alice).await.unwrap(), 2);
        assert_eq!(unread_count(&db, &bob).await.unwrap(), 1);
    }
}
