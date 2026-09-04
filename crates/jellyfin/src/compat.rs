//! Making request paths behave the way the reference server's do.
//!
//! Jellyfin runs on ASP.NET Core, whose routing is **case-insensitive**, tolerant
//! of stray slashes, and — through Jellyfin's own legacy rewrite — happy to
//! answer a path prefixed with `/emby` or `/mediabrowser`. actix matches
//! literally, so without this a client that spells a path any other way than we
//! registered it gets a 404 for every single request and never gets past the
//! connect screen.
//!
//! Rather than registering every casing of every route, one middleware puts the
//! path into canonical form before the router sees it:
//!
//! - a leading `/emby` or `/mediabrowser` segment is dropped;
//! - empty segments are dropped, which collapses `//` and any trailing slash;
//! - each segment that names a route literal is respelled the way the route
//!   table spells it.
//!
//! A segment that isn't a route literal — an id, an artist name, a genre — is
//! passed through untouched, so nothing that carries user data is case-folded.

use std::collections::HashMap;
use std::sync::OnceLock;

use actix_web::{
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    http::uri::{PathAndQuery, Uri},
    middleware::Next,
    Error,
};

/// Every literal segment the route table uses, spelled canonically.
///
/// `route_literals_are_all_canonical` keeps this honest: it re-reads the route
/// table and fails if a literal appears there that isn't listed here, or is
/// spelled differently.
const LITERAL_SEGMENTS: &[&str] = &[
    "AlbumArtists",
    "Albums",
    "Ancestors",
    "Artists",
    "Audio",
    "AuthenticateByName",
    "Branding",
    "Capabilities",
    "Configuration",
    "Counts",
    "Css",
    "DisplayPreferences",
    "Download",
    "Enabled",
    "Endpoint",
    "Episodes",
    "FavoriteItems",
    "File",
    "Filters",
    "Filters2",
    "Full",
    "Genres",
    "Hints",
    "Images",
    "Info",
    "InstantMix",
    "Intros",
    "Items",
    "Latest",
    "Library",
    "Lyrics",
    "Me",
    "MediaFolders",
    "MediaSegments",
    "Move",
    "MusicGenres",
    "NextUp",
    "Persons",
    "Ping",
    "PlaybackInfo",
    "PlayedItems",
    "Playing",
    "Playlists",
    "Prefixes",
    "Progress",
    "Public",
    "QuickConnect",
    "Rating",
    "Refresh",
    "RemoteSearch",
    "Resume",
    "Running",
    "ScheduledTasks",
    "Search",
    "Seasons",
    "Sessions",
    "Shows",
    "Similar",
    "Songs",
    "SpecialFeatures",
    "Stopped",
    "Studios",
    "Suggestions",
    "System",
    "ThemeMedia",
    "Triggers",
    "Upcoming",
    "UserData",
    "UserFavoriteItems",
    "UserItems",
    "UserPlayedItems",
    "UserViews",
    "Users",
    "Views",
    "VirtualFolders",
    "Years",
    "socket",
    "stream",
    "universal",
];

/// Prefixes Emby-era clients still put in front of every path. Jellyfin strips
/// these itself before routing, so a client configured against an Emby-style
/// base URL works there and must work here.
const LEGACY_PREFIXES: [&str; 2] = ["emby", "mediabrowser"];

fn canonical() -> &'static HashMap<String, &'static str> {
    static MAP: OnceLock<HashMap<String, &'static str>> = OnceLock::new();
    MAP.get_or_init(|| {
        LITERAL_SEGMENTS
            .iter()
            .map(|s| (s.to_ascii_lowercase(), *s))
            .collect()
    })
}

/// Respell one path segment the way the route table spells it, or leave it
/// alone when it isn't a route literal.
fn canonical_segment(segment: &str) -> Option<&'static str> {
    canonical().get(&segment.to_ascii_lowercase()).copied()
}

/// The canonical form of `path`.
///
/// Operates on the raw, still-percent-encoded path: segments are only ever
/// compared and rejoined, never decoded, so an encoded name survives untouched.
pub fn canonical_path(path: &str) -> String {
    let mut segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    if let Some(first) = segments.first() {
        if LEGACY_PREFIXES
            .iter()
            .any(|p| first.eq_ignore_ascii_case(p))
        {
            segments.remove(0);
        }
    }

    let mut out = String::with_capacity(path.len() + 8);
    for segment in segments {
        out.push('/');
        match canonical_segment(segment) {
            Some(canonical) => out.push_str(canonical),
            // `/Audio/{id}/stream.mp3` — the literal is the part before the
            // extension, which the route matches as `stream.{ext}`.
            None => match segment.split_once('.') {
                Some((head, ext)) => match canonical_segment(head) {
                    Some(canonical) => {
                        out.push_str(canonical);
                        out.push('.');
                        out.push_str(ext);
                    }
                    None => out.push_str(segment),
                },
                None => out.push_str(segment),
            },
        }
    }

    if out.is_empty() {
        out.push('/');
    }
    out
}

/// Rewrite the request path into canonical form before the router sees it.
pub async fn normalize_path(
    mut req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let path = req.path().to_string();
    let canonical = canonical_path(&path);

    if canonical != path {
        // Rebuilding is deliberately a splice into the existing URI parts
        // rather than a parse of the path alone, so scheme and authority
        // survive.
        let mut parts = req.head().uri.clone().into_parts();
        let target = match parts.path_and_query.as_ref().and_then(|pq| pq.query()) {
            Some(query) => format!("{canonical}?{query}"),
            None => canonical.clone(),
        };

        // A path assembled from segments we were just handed is always a valid
        // URI; if it somehow isn't, routing the original beats a 500.
        if let Ok(pq) = target.parse::<PathAndQuery>() {
            parts.path_and_query = Some(pq);
            if let Ok(uri) = Uri::from_parts(parts) {
                tracing::debug!(from = %path, to = %canonical, "jellyfin: path normalized");
                // Both halves matter: the router matches on `match_info`, while
                // handlers and extractors read the head. Updating only the head
                // rewrites what handlers see and changes nothing about which
                // one of them runs.
                req.match_info_mut().get_mut().update(&uri);
                req.head_mut().uri = uri;
            }
        }
    }

    next.call(req).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn case_is_normalized_to_the_route_spelling() {
        for path in [
            "/system/info/public",
            "/SYSTEM/INFO/PUBLIC",
            "/System/Info/Public",
            "/sYsTeM/iNfO/pUbLiC",
        ] {
            assert_eq!(canonical_path(path), "/System/Info/Public", "{path}");
        }
        assert_eq!(
            canonical_path("/users/authenticatebyname"),
            "/Users/AuthenticateByName"
        );
    }

    #[test]
    fn stray_slashes_collapse() {
        for path in [
            "//System/Info/Public",
            "/System/Info/Public/",
            "/System//Info///Public//",
        ] {
            assert_eq!(canonical_path(path), "/System/Info/Public", "{path}");
        }
        assert_eq!(canonical_path("/"), "/");
        assert_eq!(canonical_path(""), "/");
    }

    #[test]
    fn legacy_emby_prefixes_are_stripped() {
        assert_eq!(
            canonical_path("/emby/System/Info/Public"),
            "/System/Info/Public"
        );
        assert_eq!(
            canonical_path("/MediaBrowser/Users/Public"),
            "/Users/Public"
        );
        // Only the leading segment, and only when it is the whole segment.
        assert_eq!(canonical_path("/Items/emby"), "/Items/emby");
    }

    #[test]
    fn dynamic_segments_are_left_alone() {
        // Ids, names and encoded values must survive byte for byte.
        assert_eq!(
            canonical_path("/Artists/Daft%20Punk"),
            "/Artists/Daft%20Punk"
        );
        assert_eq!(canonical_path("/Genres/rock"), "/Genres/rock");
        assert_eq!(
            canonical_path("/items/AbCdEf12-3456-7890-abcd-ef1234567890/Images/Primary"),
            "/Items/AbCdEf12-3456-7890-abcd-ef1234567890/Images/Primary"
        );
    }

    #[test]
    fn stream_extension_keeps_its_suffix() {
        assert_eq!(
            canonical_path("/audio/abc/STREAM.mp3"),
            "/Audio/abc/stream.mp3"
        );
        assert_eq!(
            canonical_path("/audio/abc/universal"),
            "/Audio/abc/universal"
        );
    }

    /// The canonical list and the route table have to agree: a literal the
    /// routes use but this module doesn't know would never be case-corrected,
    /// and one spelled differently here would be rewritten into a 404.
    #[test]
    fn route_literals_are_all_canonical() {
        let table = include_str!("handlers/mod.rs");
        let mut missing: Vec<String> = Vec::new();

        for line in table.lines() {
            let Some(rest) = line.split(".route(\"").nth(1) else {
                continue;
            };
            let Some(path) = rest.split('"').next() else {
                continue;
            };
            for segment in path.split('/').filter(|s| !s.is_empty()) {
                if segment.starts_with('{') {
                    continue;
                }
                let literal = segment.split('.').next().unwrap_or(segment);
                if literal.starts_with('{') {
                    continue;
                }
                match canonical_segment(literal) {
                    Some(canonical) if canonical == literal => {}
                    Some(canonical) => missing.push(format!(
                        "{literal:?} in {path:?} is spelled {canonical:?} in LITERAL_SEGMENTS"
                    )),
                    None => missing.push(format!("{literal:?} in {path:?} is not listed")),
                }
            }
        }

        assert!(
            missing.is_empty(),
            "route table drifted:\n  {}",
            missing.join("\n  ")
        );
    }
}
