//! Keeping OAuth sessions alive.
//!
//! An access token lasts minutes and is refreshed on demand, so an active user
//! never notices. The problem is the inactive one: a refresh token also
//! expires, and a user who does not visit for long enough comes back signed
//! out even though nothing was wrong.
//!
//! So sessions nearing expiry are refreshed in the background. This is the
//! Rust counterpart of `refreshSessionsAboutToExpire` in `apps/api/src/db.ts`,
//! and it is what "long-lived sessions" actually requires — a confidential
//! client gets long-lived *refresh tokens* from the authorization server, but
//! they still have to be used before they lapse.

use crate::state::AppState;
use std::time::Duration;

/// How often to look for sessions worth refreshing.
const SWEEP_INTERVAL: Duration = Duration::from_secs(60 * 60 * 6);

/// Refresh a session once its access token is within this window of expiring.
/// Generous on purpose: refreshing early costs one request, refreshing too
/// late costs the user their session.
const REFRESH_WINDOW: chrono::Duration = chrono::Duration::days(2);

/// Starts the background sweep. Does nothing without OAuth configured.
pub fn spawn(state: &AppState) -> Option<tokio::task::JoinHandle<()>> {
    if state.oauth().is_none() {
        return None;
    }

    let state = state.clone();
    Some(tokio::spawn(async move {
        // A short initial delay so startup is not competing with the first
        // sweep for the network.
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            match sweep(&state).await {
                Ok(refreshed) if refreshed > 0 => {
                    tracing::info!(refreshed, "refreshed OAuth sessions")
                }
                Ok(_) => tracing::debug!("no OAuth sessions needed refreshing"),
                Err(err) => tracing::warn!(error = ?err, "the session sweep failed"),
            }
            tokio::time::sleep(SWEEP_INTERVAL).await;
        }
    }))
}

/// Refreshes every session close to expiry, returning how many were renewed.
pub async fn sweep(state: &AppState) -> anyhow::Result<usize> {
    let Some(oauth) = state.oauth() else {
        return Ok(0);
    };

    let cutoff = chrono::Utc::now() + REFRESH_WINDOW;
    let dids = sessions_expiring_before(state, cutoff).await?;
    if dids.is_empty() {
        return Ok(0);
    }
    tracing::debug!(candidates = dids.len(), "sessions near expiry");

    let mut refreshed = 0;
    for did in dids {
        let parsed: jacquard_common::types::string::Did = match did.parse() {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        // `restore` refreshes when needed and writes the new token set back
        // through the store, so there is nothing to persist here.
        match oauth
            .client
            .restore(&parsed, crate::oauth::store::DEFAULT_SESSION_ID)
            .await
        {
            Ok(_) => refreshed += 1,
            // A failure here is usually a revoked authorization, which is the
            // user's decision and not something to retry loudly.
            Err(err) => tracing::debug!(did = %did, error = ?err, "could not refresh a session"),
        }
    }

    Ok(refreshed)
}

/// DIDs whose stored session expires before `cutoff`.
///
/// Reads the `expires_at` column rather than parsing every session's JSON —
/// the reason that column is mirrored out of the blob at all.
async fn sessions_expiring_before(
    state: &AppState,
    cutoff: chrono::DateTime<chrono::Utc>,
) -> Result<Vec<String>, sqlx::Error> {
    let cutoff = crate::db::format_timestamp(cutoff);

    sqlx::query_scalar(
        "SELECT key FROM auth_session \
         WHERE key NOT LIKE 'atp:%' \
           AND expires_at IS NOT NULL \
           AND expires_at <> 'NULL' \
           AND expires_at < ? \
         ORDER BY expires_at ASC",
    )
    .bind(cutoff)
    .fetch_all(state.auth_db())
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn insert_session(state: &AppState, key: &str, expires_at: Option<&str>) {
        sqlx::query("INSERT INTO auth_session (key, session, expires_at) VALUES (?, ?, ?)")
            .bind(key)
            .bind("{}")
            .bind(expires_at)
            .execute(state.auth_db())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn only_sessions_near_expiry_are_selected() {
        let state = AppState::for_test().await.unwrap();
        let now = chrono::Utc::now();

        insert_session(
            &state,
            "did:plc:soon",
            Some(&crate::db::format_timestamp(
                now + chrono::Duration::hours(1),
            )),
        )
        .await;
        insert_session(
            &state,
            "did:plc:later",
            Some(&crate::db::format_timestamp(
                now + chrono::Duration::days(30),
            )),
        )
        .await;

        let due = sessions_expiring_before(&state, now + REFRESH_WINDOW)
            .await
            .unwrap();
        assert_eq!(due, vec!["did:plc:soon"]);
    }

    /// App-password sessions have no refresh token to spend and must not be
    /// dragged into the OAuth sweep.
    #[tokio::test]
    async fn app_password_sessions_are_left_alone() {
        let state = AppState::for_test().await.unwrap();
        let soon = crate::db::format_timestamp(chrono::Utc::now() + chrono::Duration::hours(1));

        insert_session(&state, "atp:did:plc:alice", Some(&soon)).await;

        let due = sessions_expiring_before(&state, chrono::Utc::now() + REFRESH_WINDOW)
            .await
            .unwrap();
        assert!(due.is_empty(), "{due:?}");
    }

    /// `apps/api` wrote the literal string "NULL" into this column for a
    /// while, which is neither a date nor SQL NULL.
    #[tokio::test]
    async fn rows_without_a_usable_expiry_are_skipped() {
        let state = AppState::for_test().await.unwrap();

        insert_session(&state, "did:plc:none", None).await;
        insert_session(&state, "did:plc:literal", Some("NULL")).await;

        let due = sessions_expiring_before(&state, chrono::Utc::now() + REFRESH_WINDOW)
            .await
            .unwrap();
        assert!(due.is_empty(), "{due:?}");
    }

    #[tokio::test]
    async fn nothing_is_spawned_without_oauth_configured() {
        let state = AppState::for_test().await.unwrap();
        assert!(state.oauth().is_none());
        assert!(spawn(&state).is_none());
        assert_eq!(sweep(&state).await.unwrap(), 0);
    }
}
