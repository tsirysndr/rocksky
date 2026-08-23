//! Browser-login token handoff.
//!
//! The rocksky.app web login already supports handing the session token to a
//! local listener: with `?cli=true` it POSTs `{"token": "..."}` to
//! `http://localhost:6996/token` after OAuth completes (the CLI flow). The
//! desktop app reuses that exact contract: `login_start` opens the system
//! browser at the login page with `cli=true`, this listener receives the
//! token and emits it to the webview as a `rocksky://token` event.
//!
//! The POST comes from the rocksky.app origin, so CORS preflight (OPTIONS)
//! must be answered permissively.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;
use tauri::{AppHandle, Emitter};

const PORT: u16 = 6996;

static STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Deserialize)]
struct TokenBody {
    token: String,
}

/// Start the localhost token listener (idempotent). Failure to bind is
/// non-fatal — e.g. the rocksky CLI already listening — password login and
/// pasted tokens still work.
pub fn start(app: &AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let listener = match TcpListener::bind(("127.0.0.1", PORT)) {
        Ok(l) => l,
        Err(e) => {
            tracing::warn!("login listener: cannot bind 127.0.0.1:{PORT}: {e}");
            STARTED.store(false, Ordering::SeqCst);
            return;
        }
    };
    let app = app.clone();
    std::thread::Builder::new()
        .name("rocksky-login".into())
        .spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let mut buf = vec![0u8; 16 * 1024];
                let n = match stream.read(&mut buf) {
                    Ok(0) | Err(_) => continue,
                    Ok(n) => n,
                };
                let req = String::from_utf8_lossy(&buf[..n]);

                // CORS preflight from the rocksky.app login page.
                if req.starts_with("OPTIONS") {
                    let _ = stream.write_all(
                        b"HTTP/1.1 204 No Content\r\n\
                          Access-Control-Allow-Origin: *\r\n\
                          Access-Control-Allow-Methods: POST, OPTIONS\r\n\
                          Access-Control-Allow-Headers: Content-Type\r\n\
                          Connection: close\r\n\r\n",
                    );
                    continue;
                }

                let token = req
                    .split_once("\r\n\r\n")
                    .and_then(|(_, body)| serde_json::from_str::<TokenBody>(body.trim()).ok())
                    .map(|b| b.token);

                let ok = matches!(&token, Some(t) if !t.trim().is_empty());
                let status: &[u8] = if ok {
                    b"HTTP/1.1 200 OK\r\n"
                } else {
                    b"HTTP/1.1 400 Bad Request\r\n"
                };
                let _ = stream.write_all(status);
                let _ = stream.write_all(
                    b"Access-Control-Allow-Origin: *\r\n\
                      Content-Type: application/json\r\n\
                      Connection: close\r\n\r\n{\"ok\":true}",
                );

                if let Some(token) = token {
                    if !token.trim().is_empty() {
                        tracing::info!("login token received via localhost handoff");
                        let _ = app.emit("rocksky://token", token);
                    }
                }
            }
        })
        .ok();
}
