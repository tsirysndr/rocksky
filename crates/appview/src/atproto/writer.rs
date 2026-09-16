//! Writing to a user's repository on their behalf.
//!
//! Every write procedure — liking a song, following an account, posting a
//! shout, creating a playlist — is the same two steps: get something that can
//! sign a request as the user, then `createRecord` or `deleteRecord`. This
//! module is that first step, and it is the reason those procedures can exist
//! at all.
//!
//! # Why there are two paths
//!
//! An account signs in one of two ways, and they authenticate writes
//! differently:
//!
//! | session       | credential                | how a write is authenticated |
//! |---------------|---------------------------|------------------------------|
//! | OAuth         | access token + DPoP key   | `Authorization: DPoP …` plus a per-request signed proof |
//! | app password  | `accessJwt`               | `Authorization: Bearer …` |
//!
//! OAuth is what the web UI uses, so it is the path that matters; the
//! app-password one exists for scripts and for the `atp:` sessions already in
//! the database. A DPoP proof is signed per request with the session's own
//! private key and carries the request's method and URL, so it cannot be
//! replayed — which is why a bearer token cannot be substituted and why this
//! could not be done by hand with `reqwest`.
//!
//! `jacquard-oauth` does the signing: [`OAuthSession`] implements
//! `XrpcClient`, so an `Agent` wrapped around one signs every call. All this
//! module does is choose the right session and hand back something uniform.

use crate::atproto::session;
use crate::error::XrpcError;
use crate::state::AppState;
use jacquard_common::types::string::Did;
use serde::Serialize;

/// Something that can write to one repository.
pub enum Writer {
    /// An OAuth session, signing each request with its DPoP key.
    Oauth {
        did: String,
        session: Box<crate::oauth::RockskyOAuthSession>,
    },
    /// An app-password session, sending a bearer token.
    AppPassword {
        did: String,
        pds: String,
        access_jwt: String,
        http: reqwest::Client,
    },
}

/// What a write returns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Written {
    pub uri: String,
    pub cid: String,
}

impl Writer {
    /// Finds a way to write as `did`.
    ///
    /// The OAuth session is tried first because it is what a signed-in user
    /// has. A missing session is [`XrpcError::auth_required`] rather than an
    /// internal error: the caller is authenticated to *this* instance but has
    /// no credential for their PDS, and the fix is to sign in again.
    pub async fn for_did(state: &AppState, did: &str) -> Result<Self, XrpcError> {
        if let Some(oauth) = state.oauth() {
            let parsed: Did = did
                .parse()
                .map_err(|_| XrpcError::invalid_request(format!("{did} is not a usable DID")))?;

            match oauth
                .client
                .restore(&parsed, crate::oauth::store::DEFAULT_SESSION_ID)
                .await
            {
                Ok(session) => {
                    tracing::debug!(did, "writing with the OAuth session");
                    return Ok(Self::Oauth {
                        did: did.to_string(),
                        session: Box::new(session),
                    });
                }
                Err(err) => {
                    // Not fatal on its own: the account may have signed in
                    // with an app password instead. Logged at debug because
                    // that is the common case for `atp:` sessions, not a
                    // problem.
                    tracing::debug!(did, error = %err, "no OAuth session to write with");
                }
            }
        }

        let Ok(Some(atp)) = session::load(state.auth_db(), did).await else {
            return Err(XrpcError::auth_required(
                "No PDS session for this account. Sign in again to publish records.",
            ));
        };

        let pds = crate::atproto::resolve_pds(state.http(), &state.config().plc_directory_url, did)
            .await
            .map_err(|err| {
                tracing::warn!(did, error = %err, "could not resolve the PDS to write to");
                XrpcError::with_message(
                    crate::error::ResponseType::UpstreamFailure,
                    "Could not reach this account's PDS",
                )
            })?;

        tracing::debug!(did, pds = %pds, "writing with the app-password session");
        Ok(Self::AppPassword {
            did: did.to_string(),
            pds,
            access_jwt: atp.access_jwt,
            http: state.http().clone(),
        })
    }

    pub fn did(&self) -> &str {
        match self {
            Self::Oauth { did, .. } | Self::AppPassword { did, .. } => did,
        }
    }

    /// Which credential this writer signs with.
    ///
    /// Logged on every write, because "was that an OAuth session or an app
    /// password?" is the first question when a write misbehaves — the two
    /// fail in completely different ways.
    fn kind(&self) -> &'static str {
        match self {
            Self::Oauth { .. } => "oauth",
            Self::AppPassword { .. } => "app-password",
        }
    }

    /// Creates a record, letting the server keep the rkey this supplies.
    ///
    /// `createRecord` rather than `putRecord`: a like or a follow is a new
    /// record each time, and `createRecord` fails if the rkey is taken, which
    /// is the behaviour a double-click should get.
    pub async fn create(
        &self,
        collection: &str,
        rkey: &str,
        record: &impl Serialize,
    ) -> Result<Written, XrpcError> {
        self.write(
            "com.atproto.repo.createRecord",
            collection,
            rkey,
            Some(record),
        )
        .await
    }

    /// Creates or replaces a record.
    pub async fn put(
        &self,
        collection: &str,
        rkey: &str,
        record: &impl Serialize,
    ) -> Result<Written, XrpcError> {
        self.write("com.atproto.repo.putRecord", collection, rkey, Some(record))
            .await
    }

    /// Removes a record. Absent is not an error, so unliking twice is safe.
    pub async fn delete(&self, collection: &str, rkey: &str) -> Result<(), XrpcError> {
        self.write::<()>("com.atproto.repo.deleteRecord", collection, rkey, None)
            .await
            .map(|_| ())
    }

    async fn write<T: Serialize>(
        &self,
        nsid: &str,
        collection: &str,
        rkey: &str,
        record: Option<&T>,
    ) -> Result<Written, XrpcError> {
        let mut body = serde_json::json!({
            "repo": self.did(),
            "collection": collection,
            "rkey": rkey,
        });
        if let Some(record) = record {
            body["record"] = serde_json::to_value(record)
                .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;
            // The PDS would otherwise validate against its own copy of the
            // lexicon, which for `app.rocksky.*` it does not have.
            body["validate"] = serde_json::Value::Bool(false);
        }

        let response = match self {
            Self::Oauth { session, .. } => {
                let endpoint = session.endpoint().await;
                let url = format!("{endpoint}/xrpc/{nsid}");
                send_dpop(session, &url, &body).await?
            }
            Self::AppPassword {
                pds,
                access_jwt,
                http,
                ..
            } => {
                let url = format!("{pds}/xrpc/{nsid}");
                let response = http
                    .post(&url)
                    .bearer_auth(access_jwt)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|err| {
                        tracing::warn!(nsid, error = %err, "the PDS write did not reach the server");
                        XrpcError::with_message(crate::error::ResponseType::UpstreamFailure, "Could not reach this account's PDS")
                    })?;

                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                if !status.is_success() {
                    return Err(pds_refused(nsid, status.as_u16(), &text));
                }
                text
            }
        };

        // `deleteRecord` answers `{}`, so an absent uri is not a failure.
        let parsed: serde_json::Value =
            serde_json::from_str(&response).unwrap_or(serde_json::Value::Null);

        tracing::debug!(
            did = self.did(),
            auth = self.kind(),
            nsid,
            collection,
            rkey,
            "wrote to a repository"
        );

        Ok(Written {
            uri: parsed
                .get("uri")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
            cid: parsed
                .get("cid")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
        })
    }
}

/// Sends a DPoP-signed POST through the session.
///
/// `OAuthSession` implements `jacquard_common::http_client::HttpClient`, and
/// its `send_http` is what attaches the `Authorization: DPoP` header and the
/// per-request proof — and what retries once with the server's nonce when it
/// answers `use_dpop_nonce`. Going through `reqwest` directly would mean
/// reimplementing both.
async fn send_dpop(
    session: &crate::oauth::RockskyOAuthSession,
    url: &str,
    body: &serde_json::Value,
) -> Result<String, XrpcError> {
    use jacquard_common::http_client::HttpClient;

    let payload =
        serde_json::to_vec(body).map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    let request = http::Request::builder()
        .method(http::Method::POST)
        .uri(url)
        .header(http::header::CONTENT_TYPE, "application/json")
        .body(payload)
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    let response = session.send_http(request).await.map_err(|err| {
        tracing::warn!(url, error = ?err, "the DPoP-signed write failed");
        XrpcError::with_message(
            crate::error::ResponseType::UpstreamFailure,
            "Could not write to this account's PDS",
        )
    })?;

    let status = response.status();
    let text = String::from_utf8_lossy(response.body()).to_string();
    if !status.is_success() {
        return Err(pds_refused(url, status.as_u16(), &text));
    }
    Ok(text)
}

/// Turns a PDS rejection into something the caller can act on.
///
/// The status is carried through rather than flattened to a 500: a 401 means
/// the session has lapsed and the user should sign in again, while a 400 means
/// the record was wrong and signing in will not help. Collapsing them would
/// make every write failure look the same.
fn pds_refused(what: &str, status: u16, body: &str) -> XrpcError {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .or_else(|| value.get("error"))
                .and_then(|text| text.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(200).collect());

    tracing::warn!(what, status, detail = %detail, "the PDS refused a write");

    match status {
        401 | 403 => {
            XrpcError::auth_required("This account's PDS rejected the write. Sign in again.")
        }
        400 => XrpcError::invalid_request(format!("The PDS rejected the record: {detail}")),
        _ => XrpcError::with_message(
            crate::error::ResponseType::UpstreamFailure,
            format!("The PDS could not store the record: {detail}"),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A lapsed session and a malformed record must not look the same: one is
    /// fixed by signing in, the other is not.
    #[test]
    fn a_refusal_keeps_the_distinction_the_status_makes() {
        let unauthorized = pds_refused("write", 401, r#"{"error":"ExpiredToken"}"#);
        assert_eq!(unauthorized.kind.status(), 401);
        assert!(unauthorized.body().message.contains("Sign in again"));

        let bad_record = pds_refused("write", 400, r#"{"message":"Invalid record"}"#);
        assert_eq!(bad_record.kind.status(), 400);
        assert!(
            bad_record.body().message.contains("Invalid record"),
            "the PDS's own reason must survive: {}",
            bad_record.body().message
        );

        // Anything else is the PDS's problem, not the caller's.
        let broken = pds_refused("write", 502, "upstream is down");
        assert_eq!(broken.kind.status(), 502);
    }

    /// A non-JSON body must still produce a readable message rather than an
    /// empty one — a PDS behind a proxy often answers HTML.
    #[test]
    fn a_non_json_refusal_is_still_readable() {
        let error = pds_refused("write", 500, "<html><body>Bad Gateway</body></html>");
        assert!(
            error.body().message.contains("Bad Gateway"),
            "{}",
            error.body().message
        );
    }

    /// And an enormous body is truncated, so one bad response cannot fill the
    /// log or the reply.
    #[test]
    fn a_huge_refusal_is_truncated() {
        let error = pds_refused("write", 500, &"x".repeat(10_000));
        assert!(error.body().message.len() < 300, "{}", error.body().message);
    }
}
