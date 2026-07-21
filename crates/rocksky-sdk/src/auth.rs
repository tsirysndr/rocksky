//! Identity + session helpers: the locally-cached [`Profile`], the Rocksky OAuth
//! scope set, and a best-effort public-profile lookup used at login time.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{auth_err, Result};

/// A tiny locally-cached identity, written on login so `whoami`-style calls and
/// personalized reads work without a network round-trip.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub did: String,
    pub handle: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub pds: Option<String>,
    /// `"password"` | `"oauth"`.
    #[serde(default)]
    pub method: String,
}

impl Profile {
    /// `"Display Name (@handle)"` when a display name is known, else `"@handle"`.
    pub fn label(&self) -> String {
        match self
            .display_name
            .as_deref()
            .filter(|d| !d.trim().is_empty())
        {
            Some(name) => format!("{name} (@{})", self.handle),
            None => format!("@{}", self.handle),
        }
    }

    /// True when this session was created via the browser OAuth flow.
    pub fn is_oauth(&self) -> bool {
        self.method == "oauth"
    }

    fn path(session_path: &Path) -> PathBuf {
        session_path.with_file_name("profile.json")
    }

    pub fn load(session_path: &Path) -> Option<Profile> {
        let bytes = std::fs::read(Self::path(session_path)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub fn save(&self, session_path: &Path) -> Result<()> {
        let p = Self::path(session_path);
        if let Some(dir) = p.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(p, serde_json::to_vec_pretty(self)?)?;
        Ok(())
    }

    pub fn clear(session_path: &Path) {
        let _ = std::fs::remove_file(Self::path(session_path));
    }
}

/// The OAuth scope set the SDK requests: atproto + write to every `app.rocksky.*`
/// collection the platform writes on the user's behalf. Shared by login and
/// write-resume. Mirrors the `SCOPES` list in `apps/api/src/auth/client.ts`.
pub(crate) fn rocksky_scopes() -> Result<jacquard::oauth::scopes::Scopes<smol_str::SmolStr>> {
    jacquard::oauth::scopes::Scopes::builder()
        .atproto()
        .repo_collection("app.rocksky.album")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.artist")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.song")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.scrobble")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.like")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.graph.follow")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.shout")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.playlist")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.feed.generator")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.actor.status")
        .map_err(auth_err)?
        .repo_collection("app.rocksky.rockbox.audio.settings")
        .map_err(auth_err)?
        .build()
        .map_err(auth_err)
}

/// Best-effort lookup of an actor's handle + display name from the public
/// Bluesky AppView. Returns `None` on any failure so login never blocks on it.
/// `actor` may be a DID or a handle.
pub(crate) async fn fetch_profile(actor: &str) -> Option<(Option<String>, Option<String>)> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ProfileOut {
        #[serde(default)]
        handle: Option<String>,
        #[serde(default)]
        display_name: Option<String>,
    }
    let url = format!("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={actor}");
    let out: ProfileOut = reqwest::get(&url).await.ok()?.json().await.ok()?;
    let clean = |s: Option<String>| s.filter(|v| !v.trim().is_empty());
    Some((clean(out.handle), clean(out.display_name)))
}
