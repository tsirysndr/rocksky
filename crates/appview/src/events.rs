//! The NATS event bus.
//!
//! **NATS is required, not optional.** It is how the other services find out
//! that anything happened: the Spotify poller, the Last.fm mirror, the
//! playlist importer and the scrobble sync all subscribe to these subjects and
//! do work in response. An instance that published nowhere would look healthy
//! and quietly stop half the system — a user would like a song and the mirror
//! would never push it, with nothing in any log to say why.
//!
//! That is why there is no in-process fallback here. An earlier version had
//! one, which was worse than useless: it made a broken deployment
//! indistinguishable from a working one.
//!
//! # The subjects
//!
//! These are a contract with the other services, so the names and payloads are
//! exactly what `apps/api` publishes — a subscriber cannot be asked to learn a
//! second spelling.
//!
//! | subject                       | payload                    | who listens |
//! |-------------------------------|----------------------------|-------------|
//! | `rocksky.user`                | the user row, as JSON      | avatar sync |
//! | `rocksky.like`                | the loved-track row        | the mirrors |
//! | `rocksky.unlike`              | the same, on removal       | the mirrors |
//! | `rocksky.user.scrobble.sync`  | a bare DID, not JSON       | scrobble sync |
//! | `rocksky.spotify.user`        | a bare email, not JSON     | the Spotify poller |
//! | `rocksky.mirror.user`         | `"{provider}:{user_id}"`   | the mirror poller |
//!
//! The two bare-string payloads are not an oversight to be tidied up: the
//! subscribers parse them as plain text, and wrapping them in JSON would break
//! those services.

use serde::Serialize;
use std::time::Duration;

/// How long to wait for NATS before giving up at startup.
///
/// Short, because failing to reach it is fatal and a slow failure at boot is
/// just a slow boot. A restart loop with a clear message beats a process that
/// hangs.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, thiserror::Error)]
pub enum EventsError {
    #[error(
        "cannot reach NATS at {url}: {source}.\n\
         NATS is required — the Spotify poller, the scrobble mirrors and the \
         playlist importer all learn about changes through it, so an instance \
         without it would silently stop half the system. Start one (the \
         docker-compose file includes it) or point [events].nats_url at yours."
    )]
    Unreachable {
        url: String,
        #[source]
        source: async_nats::ConnectError,
    },
}

/// A connection to the bus.
#[derive(Clone)]
pub struct Events {
    client: async_nats::Client,
}

impl std::fmt::Debug for Events {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The client's own Debug prints connection internals that are noise in
        // a state dump.
        f.write_str("Events(connected)")
    }
}

/// The subjects this instance publishes on.
pub mod subject {
    /// A user row changed — a new account, or a refreshed avatar or handle.
    pub const USER: &str = "rocksky.user";
    /// A song was liked.
    pub const LIKE: &str = "rocksky.like";
    /// A like was removed.
    pub const UNLIKE: &str = "rocksky.unlike";
    /// A DID whose scrobbles should be pushed to the configured mirrors.
    pub const SCROBBLE_SYNC: &str = "rocksky.user.scrobble.sync";
    /// An email whose Spotify account should be polled.
    pub const SPOTIFY_USER: &str = "rocksky.spotify.user";
    /// `"{provider}:{user_id}"` — a mirror was enabled or disabled, so the
    /// mirror process starts or stops that user's polling task.
    pub const MIRROR_USER: &str = "rocksky.mirror.user";
}

impl Events {
    /// Connects, or fails.
    ///
    /// Deliberately fatal. See the module note on why there is no fallback.
    pub async fn connect(url: &str) -> Result<Self, EventsError> {
        tracing::info!(url, "connecting to NATS");

        // Note the absence of `retry_on_initial_connect()`: with it, `connect`
        // returns a healthy-looking client for a URL where nothing is
        // listening, which is the exact failure this module exists to prevent.
        // Reconnection after a *successful* first connect is automatic and does
        // not need that option, so dropping it costs nothing.
        let client = async_nats::ConnectOptions::new()
            .connection_timeout(CONNECT_TIMEOUT)
            .connect(url)
            .await
            .map_err(|source| EventsError::Unreachable {
                url: url.to_string(),
                source,
            })?;

        tracing::info!(url, "connected to NATS");
        Ok(Self { client })
    }

    /// Publishes a JSON payload.
    ///
    /// Failures are logged rather than returned. By the time an event is
    /// published the thing it describes has already happened — the row is
    /// written, the record is in the repository — so refusing the request
    /// would be a lie, and unwinding it is not possible. What a caller can do
    /// about a dropped event is nothing, so it is not asked to.
    pub async fn publish_json<T: Serialize>(&self, subject: &'static str, payload: &T) {
        let body = match serde_json::to_vec(payload) {
            Ok(body) => body,
            Err(err) => {
                tracing::error!(subject, error = %err, "could not serialize an event");
                return;
            }
        };
        self.send(subject, body).await;
    }

    /// Publishes a bare string.
    ///
    /// Two subjects use this — see the table in the module note. Their
    /// subscribers read plain text, so JSON would break them.
    pub async fn publish_text(&self, subject: &'static str, payload: &str) {
        self.send(subject, payload.as_bytes().to_vec()).await;
    }

    async fn send(&self, subject: &'static str, body: Vec<u8>) {
        match self.client.publish(subject, body.into()).await {
            Ok(()) => tracing::debug!(subject, "published an event"),
            Err(err) => tracing::error!(
                subject,
                error = %err,
                "could not publish an event; a downstream service will not see it"
            ),
        }
    }

    /// Flushes anything buffered.
    ///
    /// NATS publishes are fire-and-forget into a local buffer, so a process
    /// that exits immediately after publishing can lose the message. Called on
    /// shutdown.
    pub async fn flush(&self) {
        if let Err(err) = self.client.flush().await {
            tracing::warn!(error = %err, "could not flush pending events");
        }
    }
}

/// The payload `rocksky.like` and `rocksky.unlike` carry.
///
/// The field names are `apps/api`'s, including the `{ xata_id }` wrappers
/// around the two foreign keys and the `xata_`-prefixed timestamps — it
/// publishes the Xata row shape directly, and the subscribers read it.
#[derive(Debug, Clone, Serialize)]
pub struct LikeEvent {
    pub uri: Option<String>,
    pub user_id: XataRef,
    pub track_id: XataRef,
    pub xata_id: String,
    pub xata_createdat: String,
    pub xata_updatedat: String,
    pub xata_version: i64,
}

/// A foreign key as the Xata row shape expresses it.
#[derive(Debug, Clone, Serialize)]
pub struct XataRef {
    pub xata_id: String,
}

impl XataRef {
    pub fn new(id: impl Into<String>) -> Self {
        Self { xata_id: id.into() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The payload shape is a contract with services this repository does not
    /// contain, so it is pinned rather than assumed.
    #[test]
    fn a_like_event_matches_the_shape_subscribers_read() {
        let event = LikeEvent {
            uri: Some("at://did:plc:alice/app.rocksky.like/3abc".into()),
            user_id: XataRef::new("rec_user"),
            track_id: XataRef::new("rec_track"),
            xata_id: "rec_like".into(),
            xata_createdat: "2026-01-01T00:00:00.000Z".into(),
            xata_updatedat: "2026-01-01T00:00:00.000Z".into(),
            xata_version: 0,
        };

        let value = serde_json::to_value(&event).unwrap();

        // The foreign keys are wrapped, not bare ids.
        assert_eq!(value["user_id"]["xata_id"], "rec_user");
        assert_eq!(value["track_id"]["xata_id"], "rec_track");
        assert!(
            !value["user_id"].is_string(),
            "a bare id would break the subscribers: {value}"
        );

        // snake_case with the xata_ prefixes, not camelCase.
        assert_eq!(value["xata_id"], "rec_like");
        assert_eq!(value["xata_createdat"], "2026-01-01T00:00:00.000Z");
        assert!(value.get("xataId").is_none(), "{value}");
        assert!(value.get("createdAt").is_none(), "{value}");
    }

    /// The subject names are what the other services subscribe to. A typo here
    /// is a service that silently never fires.
    #[test]
    fn the_subjects_are_the_ones_subscribers_use() {
        assert_eq!(subject::USER, "rocksky.user");
        assert_eq!(subject::LIKE, "rocksky.like");
        assert_eq!(subject::UNLIKE, "rocksky.unlike");
        assert_eq!(subject::SCROBBLE_SYNC, "rocksky.user.scrobble.sync");
        assert_eq!(subject::SPOTIFY_USER, "rocksky.spotify.user");

        // All under one prefix, so a wildcard subscription catches them.
        for subject in [
            subject::USER,
            subject::LIKE,
            subject::UNLIKE,
            subject::SCROBBLE_SYNC,
            subject::SPOTIFY_USER,
        ] {
            assert!(subject.starts_with("rocksky."), "{subject}");
            assert!(!subject.contains(' '), "{subject}");
        }
    }

    /// An unreachable bus must say what to do about it, since it stops the
    /// process.
    #[tokio::test]
    async fn an_unreachable_bus_explains_itself() {
        // Port 1 is reserved and nothing listens there.
        let error = Events::connect("nats://127.0.0.1:1")
            .await
            .expect_err("connecting to a closed port must fail");

        let message = error.to_string();
        assert!(message.contains("NATS is required"), "{message}");
        assert!(message.contains("docker-compose"), "{message}");
        assert!(message.contains("nats://127.0.0.1:1"), "{message}");
    }
}
