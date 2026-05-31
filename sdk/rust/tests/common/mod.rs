//! Shared test helpers.
//!
//! Each integration test compiles as its own crate; with `pub` helpers,
//! Rust warns once per test file that doesn't happen to use both. The
//! `#[allow(dead_code)]` opts out of that noise.

#![allow(dead_code)]

use rocksky::Client;
use wiremock::MockServer;

pub async fn mock_client() -> (MockServer, Client) {
    let server = MockServer::start().await;
    let client = Client::builder().base_url(server.uri()).build();
    (server, client)
}

pub async fn mock_client_with_token(token: &str) -> (MockServer, Client) {
    let server = MockServer::start().await;
    let client = Client::builder()
        .base_url(server.uri())
        .token(token)
        .build();
    (server, client)
}
