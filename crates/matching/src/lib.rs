//! Shared recording resolution policy. Providers retrieve evidence; only this
//! module decides whether a candidate is compatible with the request.
pub mod catalog;
pub mod client;
pub mod database;
pub mod providers;
pub mod service;
pub mod spotify_auth;
pub mod startup;

use rocksky_core::credits::fold;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Identifiers {
    pub musicbrainz_recording_id: Option<String>,
    pub musicbrainz_release_id: Option<String>,
    pub isrc: Option<String>,
    pub spotify_track_id: Option<String>,
    pub deezer_track_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MatchRequest {
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub identifiers: Identifiers,
}

impl MatchRequest {
    pub fn validate(&self) -> Result<(), String> {
        fn valid(s: &str) -> bool {
            s.len() <= 1024 && s.chars().any(char::is_alphanumeric)
        }
        if !valid(&self.title) {
            return Err("title must contain text (maximum 1024 bytes)".into());
        }
        if self.artists.is_empty()
            || self.artists.len() > 32
            || self.artists.iter().any(|s| !valid(s))
        {
            return Err("artists must contain 1–32 nonblank names".into());
        }
        for (name, value) in [("album", &self.album), ("albumArtist", &self.album_artist)] {
            if value.as_deref().is_some_and(|s| !valid(s)) {
                return Err(format!("{name} must contain text when supplied"));
            }
        }
        if self.duration_ms == Some(0) {
            return Err("durationMs must be positive".into());
        }
        for (_, value) in self.identifiers.values() {
            if value.is_some_and(|v| {
                v.is_empty()
                    || v.len() > 128
                    || !v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
            }) {
                return Err("identifiers must be nonempty ASCII letters, digits or hyphens (maximum 128 bytes)".into());
            }
        }
        Ok(())
    }
}

impl Identifiers {
    fn values(&self) -> [(&'static str, Option<&str>); 5] {
        [
            (
                "musicbrainzRecordingId",
                self.musicbrainz_recording_id.as_deref(),
            ),
            (
                "musicbrainzReleaseId",
                self.musicbrainz_release_id.as_deref(),
            ),
            ("isrc", self.isrc.as_deref()),
            ("spotifyTrackId", self.spotify_track_id.as_deref()),
            ("deezerTrackId", self.deezer_track_id.as_deref()),
        ]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MusicbrainzArtist {
    pub mbid: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub source: String,
    pub id: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub identifiers: Identifiers,
    pub album_type: Option<String>,
    pub release_status: Option<String>,
    pub release_date: Option<String>,
    pub country: Option<String>,
    pub album_art: Option<String>,
    pub version: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub label: Option<String>,
    pub genres: Option<Vec<String>>,
    pub artist_picture: Option<String>,
    pub musicbrainz_artists: Option<Vec<MusicbrainzArtist>>,
    pub spotify_link: Option<String>,
    /// Provider search score on a 0–100 scale; advisory, never identity evidence.
    pub provider_score: Option<f64>,
    /// Provider popularity rank (Deezer), not the policy rank vector.
    pub provider_rank: Option<i64>,
    pub provider_link: Option<String>,
    pub preview: Option<String>,
    #[serde(skip)]
    pub provider_album_id: Option<String>,
    #[serde(skip)]
    pub provider_artist_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Matched,
    Ambiguous,
    Unmatched,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedCandidate {
    pub track: Candidate,
    /// Ranking evidence, not a calibrated probability.
    pub reasons: Vec<String>,
    pub rank: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rejection {
    pub source: String,
    pub id: String,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResponse {
    pub policy_version: String,
    pub status: Status,
    pub track: Option<Candidate>,
    pub candidates: Vec<RankedCandidate>,
    pub rejected: Vec<Rejection>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// Preserve every word (especially live/remix/edit/remaster). Fold accents and
/// typographic punctuation using the convention already shared by Rocksky.
pub fn normalize(s: &str) -> String {
    fold(s)
        .chars()
        .map(|c| match c {
            '(' | ')' | '[' | ']' | '{' | '}' | '.' | ',' | ':' | ';' | '!' | '?' | '-' => ' ',
            c => c,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn artist_set(names: &[String]) -> BTreeSet<String> {
    names.iter().map(|s| normalize(s)).collect()
}
fn id_normalize(kind: &str, id: &str) -> String {
    if kind == "isrc" {
        id.replace('-', "").to_ascii_uppercase()
    } else if kind.starts_with("musicbrainz") {
        id.to_ascii_lowercase()
    } else {
        id.to_owned()
    }
}

/// Edition words are retained, never stripped for ordinary text matching.
fn editions(value: &str) -> BTreeSet<String> {
    normalize(value)
        .split_whitespace()
        .filter_map(|word| match word {
            "remaster" | "remastered" => Some("remaster"),
            "remix" | "remixed" | "remixes" => Some("remix"),
            "live" => Some("live"),
            "acoustic" => Some("acoustic"),
            "instrumental" => Some("instrumental"),
            "karaoke" => Some("karaoke"),
            "demo" => Some("demo"),
            "mono" => Some("mono"),
            "stereo" => Some("stereo"),
            "edit" | "edited" => Some("edit"),
            "deluxe" => Some("deluxe"),
            "expanded" => Some("expanded"),
            "anniversary" => Some("anniversary"),
            "clean" => Some("clean"),
            "explicit" => Some("explicit"),
            "extended" => Some("extended"),
            "rerecorded" => Some("rerecorded"),
            "slowed" => Some("slowed"),
            "nightcore" => Some("nightcore"),
            _ => None,
        })
        .map(str::to_owned)
        .collect()
}

fn version_base(value: &str) -> String {
    let folded = fold(value);
    for delimiter in [" (", " [", " - "] {
        if let Some((base, suffix)) = folded.split_once(delimiter) {
            if !editions(suffix).is_empty() {
                return normalize(base);
            }
        }
    }
    normalize(value)
}

fn album_editions(album: &str) -> BTreeSet<String> {
    // Preserve legitimate names such as Live Through This. Live/demo/remix
    // count as edition metadata in a decorated suffix or Live at/in prefix.
    let folded = fold(album);
    let mut flags = editions(album);
    for marker in [
        "live",
        "demo",
        "remix",
        "acoustic",
        "instrumental",
        "karaoke",
        "edit",
    ] {
        let annotated = ["(", "[", " - "].iter().any(|delimiter| {
            folded
                .split_once(delimiter)
                .is_some_and(|(_, suffix)| editions(suffix).contains(marker))
        });
        if !annotated
            && !(marker == "live"
                && (folded.starts_with("live at ") || folded.starts_with("live in ")))
        {
            flags.remove(marker);
        }
    }
    flags
}

/// Ported from apps/api/song/albumFilter.ts. This is only a preference AFTER
/// the hard filters; a real title like "Live Through This" is never rejected.
pub fn canonical_score(album: Option<&str>, album_type: Option<&str>) -> i64 {
    let mut score = match album_type {
        Some("album") => 2,
        Some(_) => -1,
        None => 0,
    };
    const MARKERS: &[&str] = &[
        "remaster",
        "remastered",
        "live",
        "deluxe",
        "single",
        "demo",
        "acoustic",
        "instrumental",
        "karaoke",
        "anniversary",
        "expanded",
        "edition",
        "remix",
        "remixes",
        "mono",
        "stereo",
        "reissue",
        "bside",
        "bsides",
    ];
    if album.is_some_and(|s| {
        normalize(
            &s.replace("re-issue", "reissue")
                .replace("b-sides", "bsides"),
        )
        .split_whitespace()
        .any(|w| MARKERS.contains(&w))
    }) {
        score -= 2;
    }
    score
}

/// Conservative matching: all requested artists must be credited exactly after
/// normalization. Extra provider credits are allowed; substring matches are not.
pub fn resolve(
    request: &MatchRequest,
    candidates: Vec<Candidate>,
) -> Result<MatchResponse, String> {
    request.validate()?;
    let mut result = MatchResponse {
        policy_version: "1".into(),
        status: Status::Unmatched,
        track: None,
        candidates: vec![],
        rejected: vec![],
        warnings: vec![],
    };
    let artists = artist_set(&request.artists);
    let mut seen = BTreeSet::new();
    for candidate in candidates {
        let mut reasons = vec![];
        if candidate.source.is_empty() || candidate.id.is_empty() {
            reasons.push("missing_candidate_identity".into());
        }

        if !artists.is_subset(&artist_set(&candidate.artists))
            && normalize(&request.artists.join(", ")) != normalize(&candidate.artists.join(", "))
        {
            reasons.push("artist_mismatch".into());
        }
        if request.album.as_ref().is_some_and(|album| {
            candidate
                .album
                .as_ref()
                .is_none_or(|a| normalize(album) != normalize(a))
        }) {
            reasons.push("album_mismatch".into());
        }
        if request.album_artist.as_ref().is_some_and(|artist| {
            candidate
                .album_artist
                .as_ref()
                .is_some_and(|a| normalize(artist) != normalize(a))
        }) {
            reasons.push("album_artist_mismatch".into());
        }
        let mut id_hits = 0;
        let mut evidence = vec!["title_match".into(), "artist_match".into()];
        if request.album.is_some() {
            evidence.push("album_match".into());
        }
        for ((kind, wanted), (_, actual)) in request
            .identifiers
            .values()
            .into_iter()
            .zip(candidate.identifiers.values())
        {
            if let (Some(wanted), Some(actual)) = (wanted, actual) {
                if id_normalize(kind, wanted) != id_normalize(kind, actual) {
                    reasons.push(format!("{kind}_conflict"));
                } else {
                    id_hits += 1;
                    evidence.push(format!("{kind}_match"));
                }
            }
        }
        let has_explicit_id = request
            .identifiers
            .values()
            .iter()
            .any(|(_, v)| v.is_some());
        if has_explicit_id && id_hits == 0 {
            reasons.push("identifiers_unverified".into());
        }
        let same_title = normalize(&request.title) == normalize(&candidate.title);
        if !same_title
            && !(id_hits > 0 && version_base(&request.title) == version_base(&candidate.title))
        {
            reasons.push("title_mismatch".into());
        }
        let mut wanted_editions = album_editions(&request.title);
        if let Some(album) = &request.album {
            wanted_editions.extend(album_editions(album));
        }
        let mut actual_editions = album_editions(&candidate.title);
        if let Some(version) = &candidate.version {
            actual_editions.extend(editions(version));
        }
        if let Some(album) = &candidate.album {
            actual_editions.extend(album_editions(album));
        }
        if !actual_editions.is_subset(&wanted_editions) && id_hits == 0 {
            reasons.push("unrequested_version".into());
        }
        if id_hits > 0 {
            evidence.push("explicit_identifier_verified".into());
        }
        // A conservative 5s floor / 2% tolerance; zero provider durations mean unknown.
        let mut duration_score = 0;
        if let (Some(wanted), Some(actual)) = (
            request.duration_ms,
            candidate.duration_ms.filter(|n| *n > 0),
        ) {
            if wanted.abs_diff(actual) > 5000.max(wanted / 50) {
                reasons.push("duration_mismatch".into());
            } else {
                duration_score = 1;
                evidence.push("duration_compatible".into());
            }
        }
        if !reasons.is_empty() {
            result.rejected.push(Rejection {
                source: candidate.source,
                id: candidate.id,
                reasons,
            });
            continue;
        }
        // Identical provider records may be returned by both ID and text search.
        // Include metadata so contradictory rows cannot silently replace each other.
        let key = serde_json::to_string(&candidate).map_err(|e| e.to_string())?;
        if !seen.insert(key) {
            continue;
        }
        let canonical =
            canonical_score(candidate.album.as_deref(), candidate.album_type.as_deref());
        // Release ordering from webscrobbler/scrobbler MusicBrainz: official,
        // preferred country. Unknown dates do not manufacture recording certainty.
        let official = match candidate.release_status.as_deref() {
            Some("official") => 2,
            Some("bootleg") => 0,
            _ => 1,
        };
        let country = i64::from(matches!(candidate.country.as_deref(), Some("XW" | "US")));
        let rank = vec![id_hits, duration_score, canonical, official, country];
        result.candidates.push(RankedCandidate {
            track: candidate,
            reasons: evidence,
            rank,
        });
    }
    result.candidates.sort_by(|a, b| {
        b.rank
            .cmp(&a.rank)
            .then_with(|| a.track.source.cmp(&b.track.source))
            .then_with(|| a.track.id.cmp(&b.track.id))
    });
    let mut identities = BTreeSet::new();
    result.candidates.retain(|c| {
        identities.insert((
            c.track.source.clone(),
            c.track.id.clone(),
            normalize(&c.track.title),
            artist_set(&c.track.artists),
            c.track.album.as_deref().map(normalize),
        ))
    });
    if let Some(first) = result.candidates.first() {
        let tied: Vec<_> = result
            .candidates
            .iter()
            .take_while(|c| c.rank == first.rank)
            .collect();
        // Release/territory IDs are not recording IDs. A tie between verified
        // copies of one recording is not ambiguity. Check every pair so missing
        // identifiers cannot bridge two contradictory recordings.
        if tied.iter().enumerate().any(|(i, a)| {
            tied[i + 1..]
                .iter()
                .any(|b| !same_recording(&a.track, &b.track))
        }) {
            result.status = Status::Ambiguous;
        } else {
            result.status = Status::Matched;
            // Choose release metadata only AFTER establishing recording identity.
            // Prefer the artist's own album, then the earliest known release.
            let representative =
                tied.into_iter()
                    .min_by_key(|c| {
                        (
                            std::cmp::Reverse(c.track.album_artist.as_ref().is_some_and(|a| {
                                artist_set(&c.track.artists).contains(&normalize(a))
                            })),
                            c.track.release_date.as_deref().unwrap_or("9999"),
                            &c.track.source,
                            &c.track.id,
                        )
                    })
                    .unwrap();
            result.track = Some(representative.track.clone());
        }
    }
    Ok(result)
}

/// Strong recording evidence cannot override conflicting text, versions,
/// durations or recording identifiers. Provider track/release IDs may differ.
fn same_recording(a: &Candidate, b: &Candidate) -> bool {
    if normalize(&a.title) != normalize(&b.title)
        || artist_set(&a.artists) != artist_set(&b.artists)
        || a.version.as_deref().map(normalize) != b.version.as_deref().map(normalize)
        || album_editions(a.album.as_deref().unwrap_or(""))
            != album_editions(b.album.as_deref().unwrap_or(""))
    {
        return false;
    }
    if let (Some(a), Some(b)) = (
        a.duration_ms.filter(|n| *n > 0),
        b.duration_ms.filter(|n| *n > 0),
    ) {
        if a.abs_diff(b) > 5000.max(a.min(b) / 50) {
            return false;
        }
    }
    let mut shared = false;
    for (kind, a, b) in [
        (
            "musicbrainzRecordingId",
            &a.identifiers.musicbrainz_recording_id,
            &b.identifiers.musicbrainz_recording_id,
        ),
        ("isrc", &a.identifiers.isrc, &b.identifiers.isrc),
    ] {
        if let (Some(a), Some(b)) = (a, b) {
            let a = id_normalize(kind, a);
            let b = id_normalize(kind, b);
            if a != b {
                return false;
            }
            shared |= !a.is_empty() && (kind != "isrc" || a.len() == 12);
        }
    }
    shared
}
