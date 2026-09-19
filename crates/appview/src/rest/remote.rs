//! `/ws` — the remote-player socket, proxied to the service that really
//! speaks it.
//!
//! The sticky player's device picker and miniplayer open a websocket to
//! `${API_URL}/ws` (`StickyPlayerWithData.tsx`), and the protocol on it —
//! register handshake, heartbeat, `devices` snapshots, transport commands —
//! belongs to `remote-ws`, the Elixir/Phoenix service (see
//! `remote-ws/PROTOCOL.md`). On the TypeScript deployment the reverse proxy
//! routes `/ws` there; on this binary's origin nothing did, the upgrade fell
//! through to the SPA fallback, and every player looked offline.
//!
//! # A proxy, not an implementation and not a redirect
//!
//! Not an implementation, because the protocol lives in one place and playerd,
//! the desktop app and the web all hold long sessions against the same state —
//! a second server would be a second source of truth for who is playing what.
//!
//! Not a redirect, because the browser `WebSocket` API does not follow a 3xx
//! on the handshake — a redirect here is indistinguishable from an outage to
//! every client.
//!
//! So the upgrade is accepted here and every frame is piped to the configured
//! upstream — `wss://api.rocksky.app/ws` unless `[services] remote_ws_url`
//! says otherwise — with the query string (which carries the token) passed
//! through untouched.

use actix_web::web::{self, ServiceConfig};
use actix_web::{HttpRequest, HttpResponse};
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message as Upstream;

use crate::state::AppState;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/ws", web::get().to(serve));
}

/// One browser socket, piped to one upstream socket.
async fn serve(
    request: HttpRequest,
    body: web::Payload,
    state: web::Data<AppState>,
) -> actix_web::Result<HttpResponse> {
    let upstream_url = {
        let base = state
            .config()
            .remote_ws_url
            .as_deref()
            .unwrap_or("wss://api.rocksky.app/ws")
            .trim_end_matches('/');
        match request.query_string() {
            "" => base.to_string(),
            query => format!("{base}?{query}"),
        }
    };

    // Dial the upstream *before* accepting the browser's upgrade: if the
    // service is down the client sees a failed handshake — which its
    // reconnect logic handles — rather than a socket that opens and dies.
    let (upstream, _) = tokio_tungstenite::connect_async(&upstream_url)
        .await
        .map_err(|err| {
            tracing::warn!(error = %err, url = %upstream_url, "remote-ws unreachable");
            actix_web::error::ErrorBadGateway("remote-ws unreachable")
        })?;
    let (mut up_tx, mut up_rx) = upstream.split();

    let (response, mut session, mut client_rx) = actix_ws::handle(&request, body)?;

    actix_web::rt::spawn(async move {
        loop {
            tokio::select! {
                // Browser → upstream.
                message = client_rx.recv() => {
                    let forward = match message {
                        Some(Ok(actix_ws::Message::Text(text))) => {
                            Upstream::text(text.to_string())
                        }
                        Some(Ok(actix_ws::Message::Binary(bytes))) => {
                            Upstream::binary(bytes.to_vec())
                        }
                        Some(Ok(actix_ws::Message::Ping(bytes))) => {
                            Upstream::Ping(bytes.to_vec().into())
                        }
                        Some(Ok(actix_ws::Message::Pong(bytes))) => {
                            Upstream::Pong(bytes.to_vec().into())
                        }
                        Some(Ok(actix_ws::Message::Close(_))) | None => break,
                        Some(Ok(_)) => continue,
                        Some(Err(_)) => break,
                    };
                    if up_tx.send(forward).await.is_err() {
                        break;
                    }
                }
                // Upstream → browser.
                message = up_rx.next() => {
                    let sent = match message {
                        Some(Ok(Upstream::Text(text))) => {
                            session.text(text.as_str()).await
                        }
                        Some(Ok(Upstream::Binary(bytes))) => {
                            session.binary(bytes.to_vec()).await
                        }
                        Some(Ok(Upstream::Ping(bytes))) => {
                            session.ping(&bytes).await
                        }
                        Some(Ok(Upstream::Pong(bytes))) => {
                            session.pong(&bytes).await
                        }
                        Some(Ok(Upstream::Close(_))) | None => break,
                        Some(Ok(_)) => continue,
                        Some(Err(_)) => break,
                    };
                    if sent.is_err() {
                        break;
                    }
                }
            }
        }
        // Either side went away; close both without ceremony. The client's
        // reconnect (and the upstream's session timeout) do the rest.
        let _ = up_tx.send(Upstream::Close(None)).await;
        let _ = session.close(None).await;
    });

    Ok(response)
}
