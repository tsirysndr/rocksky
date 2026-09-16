//! `app.rocksky.equalizer.*` and `app.rocksky.rockbox.*` — player settings.
//!
//! These have **no database table**. The record in the user's repository *is*
//! the setting, and this instance only reads and writes it. That is deliberate
//! rather than an omission: settings follow the account, so a user who signs in
//! on another Rocksky instance — or another client entirely — finds their
//! presets already there, and a self-hosted instance that loses its database
//! loses no settings at all.
//!
//! It also means reads work for accounts this instance has never seen. A
//! repository is public, so [`rocksky_atproto::records::get_record`] needs no
//! session; only writes do.
//!
//! | method                        | record                                    |
//! |-------------------------------|-------------------------------------------|
//! | `equalizer.listPresets`       | every `app.rocksky.equalizer`             |
//! | `equalizer.putPreset`         | one, keyed on a slug of the name          |
//! | `equalizer.deletePreset`      | removes one by rkey                       |
//! | `rockbox.getAudioSettings`    | `app.rocksky.rockbox.audio.settings/self` |
//! | `rockbox.putAudioSettings`    | the same, replaced wholesale              |
//!
//! The audio settings record is keyed `self` — there is exactly one per
//! account, the way a profile record works.

use crate::atproto::writer::Writer;
use crate::auth::{Auth, AuthDid};
use crate::error::{XrpcError, XrpcResult};
use crate::state::AppState;
use crate::xrpc::{json, ok_empty};
use crate::{xrpc_procedure, xrpc_query};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.equalizer.listPresets", list_presets);
    xrpc_procedure!(cfg, "app.rocksky.equalizer.putPreset", put_preset);
    xrpc_procedure!(cfg, "app.rocksky.equalizer.deletePreset", delete_preset);
    xrpc_query!(
        cfg,
        "app.rocksky.rockbox.getAudioSettings",
        get_audio_settings
    );
    xrpc_procedure!(
        cfg,
        "app.rocksky.rockbox.putAudioSettings",
        put_audio_settings
    );
}

const EQUALIZER_COLLECTION: &str = "app.rocksky.equalizer";
const AUDIO_SETTINGS_COLLECTION: &str = "app.rocksky.rockbox.audio.settings";

/// The rkey every audio-settings record uses.
///
/// One per account, so a fixed key rather than a TID — the same convention
/// `app.bsky.actor.profile` uses.
const AUDIO_SETTINGS_RKEY: &str = "self";

/// Most presets anyone sensibly has. Bounds the walk over a repository.
const MAX_PRESETS: usize = 500;

// ---------------------------------------------------------------- equalizer

/// One band of an equalizer curve.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Band {
    /// Centre frequency in hertz.
    pub frequency: i64,
    /// Gain in decibels. Fractional, so a float.
    pub gain: f64,
    /// Bandwidth. Absent for the shelf filters at either end.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub q: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetView {
    pub name: String,
    /// The rkey, so a client can delete or replace it.
    pub rkey: String,
    pub uri: String,
    /// Overall attenuation applied before the bands, to leave headroom for
    /// their boosts. Negative decibels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub precut: Option<f64>,
    pub bands: Vec<Band>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct PresetsOutput {
    pub presets: Vec<PresetView>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DidParams {
    #[serde(default)]
    pub did: Option<String>,
}

/// `app.rocksky.equalizer.listPresets`
///
/// Reads the caller's own presets by default, or anyone's if a `did` is given
/// — a repository is public, so no session is needed for someone else's.
async fn list_presets(
    state: web::Data<AppState>,
    params: web::Query<DidParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let Some(did) = params
        .did
        .clone()
        .or_else(|| auth.did().map(str::to_string))
    else {
        return Err(XrpcError::invalid_request(
            "did is required when not signed in",
        ));
    };

    let pds = resolve(&state, &did).await?;
    let records = rocksky_atproto::records::list_records(
        state.http(),
        &pds,
        &did,
        EQUALIZER_COLLECTION,
        MAX_PRESETS,
    )
    .await
    .map_err(|err| {
        tracing::warn!(did = %did, error = %err, "could not list equalizer presets");
        XrpcError::with_message(
            crate::error::ResponseType::UpstreamFailure,
            "Could not read presets from that account's PDS",
        )
    })?;

    let presets = records
        .iter()
        .filter_map(|record| {
            // A record that does not parse is skipped rather than failing the
            // list: one malformed preset must not hide the rest.
            let bands = record.value.get("bands")?;
            let bands: Vec<Band> = serde_json::from_value(bands.clone()).ok()?;
            Some(PresetView {
                name: record
                    .value
                    .get("name")
                    .and_then(|name| name.as_str())
                    .unwrap_or("Untitled")
                    .to_string(),
                rkey: rkey_of(&record.uri)?,
                uri: record.uri.clone(),
                precut: record
                    .value
                    .get("precut")
                    .and_then(|precut| precut.as_f64()),
                bands,
            })
        })
        .collect();

    json(PresetsOutput { presets })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PutPresetInput {
    pub name: Option<String>,
    #[serde(default)]
    pub precut: Option<f64>,
    #[serde(default)]
    pub bands: Option<Vec<Band>>,
}

/// An `app.rocksky.equalizer` record.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresetRecord {
    #[serde(rename = "$type")]
    record_type: &'static str,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    precut: Option<f64>,
    bands: Vec<Band>,
    created_at: String,
}

/// `app.rocksky.equalizer.putPreset`
///
/// Keyed on a slug of the name, so saving a preset twice replaces it rather
/// than accumulating duplicates the user then has to clean up. `putRecord`
/// rather than `createRecord` for the same reason.
async fn put_preset(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<PutPresetInput>,
) -> XrpcResult<HttpResponse> {
    let name = body
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("name is required"))?
        .to_string();

    let rkey = preset_rkey(&name).ok_or_else(|| {
        XrpcError::invalid_request(format!(
            "\"{name}\" has no characters that can form a record key"
        ))
    })?;

    let bands = body
        .bands
        .clone()
        .filter(|bands| !bands.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("bands is required"))?;

    let writer = Writer::for_did(&state, &auth.did).await?;
    let written = writer
        .put(
            EQUALIZER_COLLECTION,
            &rkey,
            &PresetRecord {
                record_type: EQUALIZER_COLLECTION,
                name: name.clone(),
                precut: body.precut,
                bands: bands.clone(),
                created_at: crate::views::timestamp::to_iso8601(&chrono::Utc::now()),
            },
        )
        .await?;

    tracing::info!(did = %auth.did, name = %name, rkey = %rkey, "saved an equalizer preset");

    json(PresetView {
        name,
        rkey,
        uri: written.uri,
        precut: body.precut,
        bands,
    })
}

#[derive(Debug, Clone, Deserialize)]
pub struct RkeyParams {
    #[serde(default)]
    pub rkey: Option<String>,
}

/// `app.rocksky.equalizer.deletePreset`
async fn delete_preset(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<RkeyParams>,
) -> XrpcResult<HttpResponse> {
    let rkey = params
        .rkey
        .as_deref()
        .map(str::trim)
        .filter(|rkey| !rkey.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("rkey is required"))?;

    let writer = Writer::for_did(&state, &auth.did).await?;
    writer.delete(EQUALIZER_COLLECTION, rkey).await?;

    tracing::info!(did = %auth.did, rkey, "deleted an equalizer preset");
    ok_empty()
}

/// A record key derived from a preset's name.
///
/// Lowercased, non-alphanumerics collapsed to `-`, and truncated: an rkey has
/// a 512-character limit and a restricted alphabet, so a name with spaces or
/// punctuation cannot be used directly. Deriving it rather than using a TID is
/// what makes saving the same preset twice a replacement.
///
/// Returns `None` for a name with nothing usable in it — better to refuse than
/// to write a record at a key like `---`.
pub fn preset_rkey(name: &str) -> Option<String> {
    let slug: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();

    // Collapse runs and trim the edges, so "Rock & Roll" is `rock-roll` rather
    // than `rock---roll`.
    let mut collapsed = String::with_capacity(slug.len());
    for c in slug.chars() {
        if c == '-' && collapsed.ends_with('-') {
            continue;
        }
        collapsed.push(c);
    }
    let trimmed = collapsed.trim_matches('-');

    // An rkey may be at most 512 characters; 64 is more than any preset name
    // needs and keeps the key readable.
    let key: String = trimmed.chars().take(64).collect();
    let key = key.trim_end_matches('-').to_string();

    (!key.is_empty()).then_some(key)
}

fn rkey_of(uri: &str) -> Option<String> {
    let rkey = uri.rsplit('/').next()?;
    (!rkey.is_empty() && rkey != uri).then(|| rkey.to_string())
}

// ----------------------------------------------------------- audio settings

/// The audio settings record, passed through rather than modelled.
///
/// Four sections — crossfade, equalizer, replay gain and tone — each a nested
/// object whose fields track what the rockbox engine accepts. Modelling them
/// here would mean this crate needed changing every time the engine gained a
/// setting, and it has no reason to interpret any of them: the players read
/// the record, and per the sync design the record is the source of truth.
/// Anything the lexicon declares therefore travels through untouched.
#[derive(Debug, Clone, Deserialize)]
pub struct PutAudioSettingsInput {
    #[serde(default)]
    pub crossfade: Option<serde_json::Value>,
    #[serde(default)]
    pub equalizer: Option<serde_json::Value>,
    #[serde(default, rename = "replayGain")]
    pub replay_gain: Option<serde_json::Value>,
    #[serde(default)]
    pub tone: Option<serde_json::Value>,
}

/// `app.rocksky.rockbox.getAudioSettings`
///
/// Answers `{}` when the account has saved none, which is what a client
/// showing defaults expects.
async fn get_audio_settings(
    state: web::Data<AppState>,
    params: web::Query<DidParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let Some(did) = params
        .did
        .clone()
        .or_else(|| auth.did().map(str::to_string))
    else {
        return Err(XrpcError::invalid_request(
            "did is required when not signed in",
        ));
    };

    let pds = resolve(&state, &did).await?;
    let record = rocksky_atproto::records::get_record(
        state.http(),
        &pds,
        &did,
        AUDIO_SETTINGS_COLLECTION,
        AUDIO_SETTINGS_RKEY,
    )
    .await
    .map_err(|err| {
        tracing::warn!(did = %did, error = %err, "could not read audio settings");
        XrpcError::with_message(
            crate::error::ResponseType::UpstreamFailure,
            "Could not read settings from that account's PDS",
        )
    })?;

    match record {
        Some(record) => json(record.value),
        None => json(serde_json::json!({})),
    }
}

/// `app.rocksky.rockbox.putAudioSettings`
///
/// Replaces the whole record. Not a patch: the record is the source of truth
/// and every applier diffs it section by section, so a partial write would
/// leave the client and the record disagreeing about what was intended.
async fn put_audio_settings(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<PutAudioSettingsInput>,
) -> XrpcResult<HttpResponse> {
    let body = body.into_inner();

    let mut record = serde_json::Map::new();
    record.insert(
        "$type".to_string(),
        serde_json::Value::String(AUDIO_SETTINGS_COLLECTION.to_string()),
    );
    for (key, value) in [
        ("crossfade", body.crossfade),
        ("equalizer", body.equalizer),
        ("replayGain", body.replay_gain),
        ("tone", body.tone),
    ] {
        // A section the caller omitted is left out rather than nulled: the
        // lexicon declares them optional-absent, and a null would fail
        // validation on a PDS that checks.
        if let Some(value) = value {
            record.insert(key.to_string(), value);
        }
    }
    record.insert(
        "createdAt".to_string(),
        serde_json::Value::String(crate::views::timestamp::to_iso8601(&chrono::Utc::now())),
    );

    let record = serde_json::Value::Object(record);
    let writer = Writer::for_did(&state, &auth.did).await?;
    writer
        .put(AUDIO_SETTINGS_COLLECTION, AUDIO_SETTINGS_RKEY, &record)
        .await?;

    tracing::info!(did = %auth.did, "saved audio settings");
    json(record)
}

/// The PDS holding an account's repository.
async fn resolve(state: &AppState, did: &str) -> Result<String, XrpcError> {
    crate::atproto::resolve_pds(state.http(), &state.config().plc_directory_url, did)
        .await
        .map_err(|err| {
            tracing::warn!(did, error = %err, "could not resolve a PDS");
            XrpcError::invalid_request(format!("Could not resolve {did} to a PDS"))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The slug is what makes saving twice a replacement, so its shape
    /// matters.
    #[test]
    fn a_preset_name_becomes_a_usable_record_key() {
        assert_eq!(preset_rkey("Rock").as_deref(), Some("rock"));
        assert_eq!(preset_rkey("Bass Boost").as_deref(), Some("bass-boost"));
        // Runs collapse rather than repeating.
        assert_eq!(preset_rkey("Rock & Roll").as_deref(), Some("rock-roll"));
        assert_eq!(preset_rkey("  Jazz  ").as_deref(), Some("jazz"));
        // Case is folded, so "Rock" and "rock" are the same preset.
        assert_eq!(preset_rkey("ROCK"), preset_rkey("rock"));
    }

    /// A name with nothing usable must be refused, not written at a key of
    /// dashes.
    #[test]
    fn a_name_with_no_usable_characters_is_refused() {
        for name in ["", "   ", "---", "!!!", "…", "🎵"] {
            assert_eq!(preset_rkey(name), None, "{name:?}");
        }
    }

    /// An rkey has a length limit, and a long name must still produce a valid
    /// one — not a truncation ending in a dash.
    #[test]
    fn a_long_name_is_truncated_cleanly() {
        let key = preset_rkey(&"a".repeat(200)).expect("a key");
        assert_eq!(key.len(), 64);
        assert!(!key.ends_with('-'));

        // A truncation that would land on a separator trims it.
        let awkward = preset_rkey(&format!("{} boost", "a".repeat(63))).expect("a key");
        assert!(!awkward.ends_with('-'), "{awkward}");
    }

    #[test]
    fn an_rkey_is_read_off_a_record_uri() {
        assert_eq!(
            rkey_of("at://did:plc:alice/app.rocksky.equalizer/rock").as_deref(),
            Some("rock")
        );
        assert_eq!(rkey_of("rock"), None);
    }

    /// Omitted sections must be absent, not null: the lexicon declares them
    /// optional-absent and a PDS that validates would reject a null.
    #[test]
    fn an_omitted_settings_section_is_absent() {
        let input = PutAudioSettingsInput {
            crossfade: Some(serde_json::json!({ "enabled": true })),
            equalizer: None,
            replay_gain: None,
            tone: None,
        };

        let mut record = serde_json::Map::new();
        for (key, value) in [
            ("crossfade", input.crossfade),
            ("equalizer", input.equalizer),
            ("replayGain", input.replay_gain),
            ("tone", input.tone),
        ] {
            if let Some(value) = value {
                record.insert(key.to_string(), value);
            }
        }

        assert!(record.contains_key("crossfade"));
        for absent in ["equalizer", "replayGain", "tone"] {
            assert!(!record.contains_key(absent), "{absent} should be absent");
        }
    }

    /// The settings record is keyed `self`, because there is one per account.
    #[test]
    fn audio_settings_use_a_fixed_record_key() {
        assert_eq!(AUDIO_SETTINGS_RKEY, "self");
    }

    /// A band's `q` is omitted for the shelf filters at either end of the
    /// curve, so it must not serialize as null.
    #[test]
    fn a_band_without_a_q_omits_it() {
        let band = Band {
            frequency: 60,
            gain: 3.5,
            q: None,
        };
        let value = serde_json::to_value(&band).unwrap();
        assert_eq!(value["frequency"], 60);
        assert_eq!(value["gain"], 3.5);
        assert!(value.get("q").is_none(), "{value}");
    }
}
