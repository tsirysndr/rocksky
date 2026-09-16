//! Reading and preparing an uploaded audio file.
//!
//! Its own crate because of what it pulls in: `symphonia` decodes, `ebur128`
//! measures loudness, `lofty` writes tags and `rocksky-analysis` finds the key
//! and tempo. None of that belongs in the dependency graph of an HTTP server,
//! and all of it is equally useful to the cloud-drive scanners and the
//! players.
//!
//! Three things happen to a file before it is stored, and each reuses the
//! crate the rest of the workspace already uses for that job:
//!
//! | step               | crate              | also used by                      |
//! |--------------------|--------------------|-----------------------------------|
//! | format detection   | magic bytes        | `apps/api`'s own `detectMime`     |
//! | core tags          | `rockbox-metadata` | `playerd`, the desktop app        |
//! | art and extras     | `lofty`            | `crates/dropbox`, `crates/googledrive` |
//! | loudness           | `ebur128`          | `playerd/src/analysis`            |
//! | key and BPM        | `rocksky-analysis` | the Neon binding `apps/api` loads |
//!
//! Using `rockbox-metadata` for the core tags is not arbitrary: it is the
//! parser the rockbox engine itself uses, so the tags accepted at upload are
//! exactly the tags a player will later show — including whether ReplayGain is
//! already present.
//!
//! `lofty` covers what that parser does not hand back: decoded cover-art bytes
//! (it resolves ID3 unsynchronisation and Vorbis base64, where
//! `rockbox-metadata` reports only an offset and size), a few optional text
//! fields, and tag *writing*, which `rockbox-metadata` does not do at all.

use anyhow::{anyhow, Result};
use std::path::Path;

/// Audio types the upload route accepts, mapped to the extension used for the
/// storage key.
///
/// The extension matters beyond tidiness: `rocksky-analysis` and the players
/// both take it as a container hint.
pub const ALLOWED: &[(&str, &str)] = &[
    ("audio/mpeg", "mp3"),
    ("audio/flac", "flac"),
    ("audio/mp4", "m4a"),
    ("audio/x-m4a", "m4a"),
    ("audio/ogg", "ogg"),
    ("audio/wav", "wav"),
    ("audio/x-wav", "wav"),
    ("audio/aiff", "aiff"),
    ("audio/x-aiff", "aiff"),
];

/// Extension for an accepted MIME type.
pub fn extension_for(mime: &str) -> &'static str {
    ALLOWED
        .iter()
        .find(|(candidate, _)| *candidate == mime)
        .map(|(_, ext)| *ext)
        .unwrap_or("bin")
}

/// Containers ReplayGain tags can be written into and read back out of.
///
/// Deliberately not WAV or AIFF: neither has a standard place to put them, so
/// tagging would be written and then never read.
const REPLAYGAIN_EXTS: &[&str] = &["mp3", "flac", "m4a", "ogg"];

/// Identifies the container from its leading bytes.
///
/// The `Content-Type` a browser sends is not trusted — it is whatever the OS
/// guessed from the filename, and a `.mp3` that is really a JPEG would
/// otherwise be accepted and then fail to decode for everyone.
pub fn detect_mime(bytes: &[u8]) -> Option<&'static str> {
    const SIGNATURES: &[(&[u8], &str)] = &[
        (b"ID3", "audio/mpeg"),        // an ID3 tag, so MP3
        (&[0xff, 0xfb], "audio/mpeg"), // MPEG frame sync
        (&[0xff, 0xf3], "audio/mpeg"),
        (&[0xff, 0xf2], "audio/mpeg"),
        (b"fLaC", "audio/flac"),
        (b"OggS", "audio/ogg"),
        (b"RIFF", "audio/wav"),
        (b"FORM", "audio/aiff"),
    ];

    for (signature, mime) in SIGNATURES {
        if bytes.starts_with(signature) {
            return Some(mime);
        }
    }

    // MP4/M4A: the `ftyp` box starts at byte 4, not 0.
    if bytes.len() > 8 && &bytes[4..8] == b"ftyp" {
        return Some("audio/mp4");
    }

    None
}

/// The tags an upload needs, as read from the file.
#[derive(Debug, Clone, Default)]
pub struct Tags {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub duration_ms: i64,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub composer: Option<String>,
    pub lyrics: Option<String>,
    pub copyright_message: Option<String>,
    pub label: Option<String>,
    pub isrc: Option<String>,
    pub mb_id: Option<String>,
    /// Only stored when it is a full date; see [`Tags::release_date`].
    pub release_date: Option<String>,
    /// Embedded cover art, with its MIME type.
    pub picture: Option<(String, Vec<u8>)>,
    /// Whether the file already carries a ReplayGain track gain, in which case
    /// it is left alone.
    pub has_replay_gain: bool,
    pub sample_rate: Option<i64>,
}

fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// Reads the tags from a file on disk.
///
/// `rockbox-metadata` reads the core tags, so what is accepted here is what
/// the players will show. `lofty` then fills what that parser does not hand
/// back: decoded cover art, ISRC, lyrics, copyright, label and release date.
pub fn read_tags(path: &Path) -> Result<Tags> {
    let meta =
        rockbox_metadata::read(path).map_err(|err| anyhow!("could not read audio tags: {err}"))?;

    let mut tags = Tags {
        title: meta.title.trim().to_string(),
        artist: meta.artist.trim().to_string(),
        album: meta.album.trim().to_string(),
        album_artist: meta.albumartist.trim().to_string(),
        duration_ms: meta.duration.as_millis() as i64,
        track_number: meta.track_number.map(|n| n as i64).filter(|n| *n > 0),
        disc_number: meta.disc_number.map(|n| n as i64).filter(|n| *n > 0),
        year: meta.year.map(|y| y as i64).filter(|y| *y > 0),
        genre: non_empty(&meta.genre),
        composer: non_empty(&meta.composer),
        lyrics: None,
        copyright_message: None,
        label: None,
        isrc: None,
        mb_id: non_empty(&meta.mb_track_id),
        release_date: None,
        picture: None,
        // The players read gain from the stream, so this is the parser whose
        // opinion decides whether tagging is needed.
        has_replay_gain: meta.replaygain.track_gain_db.is_some(),
        sample_rate: Some(meta.sample_rate as i64).filter(|f| *f > 0),
    };

    // Everything `rockbox-metadata` does not surface comes from lofty. A
    // failure here is not fatal: the fields it fills are all optional, and the
    // required ones are already read above.
    if let Ok(tagged) = lofty::probe::Probe::open(path).and_then(|probe| probe.read()) {
        use lofty::file::TaggedFileExt;
        use lofty::tag::{Accessor, ItemKey};

        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            let get = |key: &ItemKey| tag.get_string(key).and_then(non_empty);

            tags.lyrics = get(&ItemKey::Lyrics);
            tags.copyright_message = get(&ItemKey::CopyrightMessage);
            tags.label = get(&ItemKey::Label);
            tags.isrc = get(&ItemKey::Isrc);
            if tags.mb_id.is_none() {
                tags.mb_id = get(&ItemKey::MusicBrainzTrackId)
                    .or_else(|| get(&ItemKey::MusicBrainzRecordingId));
            }

            // A year-only date is already in `year`; storing "1998" as a
            // release date would claim a precision the file does not have.
            tags.release_date = get(&ItemKey::OriginalReleaseDate)
                .or_else(|| get(&ItemKey::RecordingDate))
                .filter(|date| date.contains('-'));

            if tags.genre.is_none() {
                tags.genre = tag.genre().as_deref().and_then(non_empty);
            }

            if let Some(picture) = tag.pictures().first() {
                if let Some(mime) = picture.mime_type() {
                    tags.picture = Some((mime.to_string(), picture.data().to_vec()));
                }
            }
        }
    }

    Ok(tags)
}

/// Why a file cannot be accepted.
///
/// These map onto the error codes the UI branches on, and the messages are
/// shown to the person uploading — so they name the fix, not the internals.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rejection {
    /// Not audio, or not a container this accepts.
    InvalidFormat,
    /// No tag block at all.
    NoTags,
    /// Tagged, but missing fields the lexicon requires.
    Incomplete(Vec<String>),
}

impl Rejection {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidFormat => "INVALID_FORMAT",
            Self::NoTags => "NO_TAGS",
            Self::Incomplete(_) => "INCOMPLETE_METADATA",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::InvalidFormat => {
                "Only audio files are accepted (MP3, FLAC, M4A, OGG, WAV, AIFF)".to_string()
            }
            Self::NoTags => "No audio tags found in this file. \
                 Please tag your file before uploading."
                .to_string(),
            Self::Incomplete(missing) => format!(
                "Missing required tags: {}. Please tag your file before uploading.",
                missing.join(", ")
            ),
        }
    }

    pub fn missing_fields(&self) -> Vec<String> {
        match self {
            Self::Incomplete(missing) => missing.clone(),
            _ => Vec::new(),
        }
    }
}

/// Checks the tags against what `app.rocksky.song` requires.
///
/// The lexicon declares `[title, artist, album, albumArtist, duration,
/// createdAt]` as required with length limits, and `createdAt` is server-set.
///
/// Album art is deliberately *not* required: an untagged cover falls back to
/// the placeholder, which is what `apps/api` does and what the cloud-drive
/// scanners rely on.
pub fn validate(tags: &Tags) -> Result<(), Rejection> {
    if tags.title.is_empty() && tags.artist.is_empty() && tags.album.is_empty() {
        return Err(Rejection::NoTags);
    }

    let mut missing = Vec::new();
    let mut check = |value: &str, field: &str, limit: usize| {
        if value.is_empty() {
            missing.push(field.to_string());
        } else if value.chars().count() > limit {
            missing.push(format!("{field} (too long, max {limit} chars)"));
        }
    };

    check(&tags.title, "title", 512);
    check(&tags.artist, "artist", 256);
    check(&tags.album, "album", 256);

    // `albumArtist` falls back to the track artist, so it is only checked for
    // length — but the fallback happens in `album_artist()`, not here.
    if tags.album_artist.chars().count() > 256 {
        missing.push("albumArtist (too long, max 256 chars)".to_string());
    }

    if tags.duration_ms < 1 {
        missing.push("duration".to_string());
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(Rejection::Incomplete(missing))
    }
}

impl Tags {
    /// The album artist, falling back to the track artist.
    pub fn album_artist(&self) -> &str {
        if self.album_artist.is_empty() {
            &self.artist
        } else {
            &self.album_artist
        }
    }

    /// The disc number, defaulting to 1.
    ///
    /// Matches the cloud-drive crates: a single-disc release usually has no
    /// disc tag, and treating that as "unknown" would sort it apart from the
    /// discs that are numbered.
    pub fn disc(&self) -> i64 {
        self.disc_number.filter(|d| *d > 0).unwrap_or(1)
    }
}

/// A measured ReplayGain figure.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ReplayGain {
    /// Gain in dB to reach the reference loudness.
    pub gain_db: f64,
    /// Linear sample peak, 0–1.
    pub peak: f64,
}

/// Reference loudness for the written gain.
///
/// -18 LUFS is the ReplayGain 2.0 reference, which is what `lofty`'s
/// `REPLAYGAIN_TRACK_GAIN` and the rockbox metadata parser both expect.
/// `playerd` targets -14 LUFS instead, but that is a *playback* preference
/// applied on top of the tag, not the tag's own reference — writing -14 here
/// would make every file play 4 dB loud in any other player.
const REFERENCE_LUFS: f64 = -18.0;

/// Measures track loudness with `ebur128`, the same way
/// `playerd/src/analysis/decode.rs` does.
///
/// Returns `None` when the file cannot be decoded, which is not an error: the
/// file is then stored untagged and simply plays at mastered loudness.
pub fn measure_replay_gain(bytes: &[u8], extension: &str) -> Option<ReplayGain> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::probe::Hint;

    let source = MediaSourceStream::new(
        Box::new(std::io::Cursor::new(bytes.to_vec())),
        Default::default(),
    );
    let mut hint = Hint::new();
    hint.with_extension(extension);

    let probed = symphonia::default::get_probe()
        .format(&hint, source, &Default::default(), &Default::default())
        .ok()?;
    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .ok()?;

    let mut meter: Option<ebur128::EbuR128> = None;
    let mut peak = 0.0f64;
    let mut buffer: Option<SampleBuffer<f32>> = None;

    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        // A single undecodable packet is not worth abandoning the whole
        // measurement for.
        let Ok(decoded) = decoder.decode(&packet) else {
            continue;
        };

        let spec = *decoded.spec();
        let target =
            buffer.get_or_insert_with(|| SampleBuffer::<f32>::new(decoded.capacity() as u64, spec));
        target.copy_interleaved_ref(decoded);
        let samples = target.samples();

        if meter.is_none() {
            meter = ebur128::EbuR128::new(
                spec.channels.count() as u32,
                spec.rate,
                ebur128::Mode::I | ebur128::Mode::SAMPLE_PEAK,
            )
            .ok();
        }
        let Some(meter) = meter.as_mut() else {
            return None;
        };

        meter.add_frames_f32(samples).ok()?;
        for sample in samples {
            let magnitude = sample.abs() as f64;
            if magnitude.is_finite() && magnitude > peak {
                peak = magnitude;
            }
        }
    }

    let meter = meter?;
    let loudness = meter.loudness_global().ok()?;
    if !loudness.is_finite() {
        return None;
    }

    Some(ReplayGain {
        gain_db: REFERENCE_LUFS - loudness,
        // A silent track has no peak; report a nominal 1.0 rather than 0,
        // which a player would read as "clip at any gain".
        peak: if peak > 0.0 { peak } else { 1.0 },
    })
}

/// Writes ReplayGain tags into the file at `path`, in place.
///
/// The container decides where they land — ID3 `TXXX` frames, vorbis
/// comments, or iTunes freeform atoms — and `lofty` handles all three. The
/// reason to bother: the rockbox engine reads gain from the stream's own tags,
/// so an untagged file plays at mastered loudness no matter what the listener
/// set.
pub fn write_replay_gain(path: &Path, gain: ReplayGain) -> Result<()> {
    use lofty::config::WriteOptions;
    use lofty::file::TaggedFileExt;
    use lofty::tag::{ItemKey, TagExt};

    let mut tagged = lofty::probe::Probe::open(path)?.read()?;

    let tag = match tagged.primary_tag_mut() {
        Some(tag) => tag,
        None => {
            // No tag block to extend. `first_tag_mut` covers a file whose tags
            // live somewhere other than the primary slot.
            tagged
                .first_tag_mut()
                .ok_or_else(|| anyhow!("no writable tag block"))?
        }
    };

    // The standard spellings, which is what every reader looks for.
    tag.insert_text(
        ItemKey::ReplayGainTrackGain,
        format!("{:.2} dB", gain.gain_db),
    );
    tag.insert_text(ItemKey::ReplayGainTrackPeak, format!("{:.6}", gain.peak));

    tag.save_to_path(path, WriteOptions::default())?;
    Ok(())
}

/// Measures and tags a file in place, returning whether tags were written.
///
/// Every failure is swallowed: a file that cannot be measured or tagged is
/// still a perfectly good upload, it just will not be loudness-normalised.
pub fn ensure_replay_gain(path: &Path, extension: &str, already_tagged: bool) -> bool {
    if already_tagged || !REPLAYGAIN_EXTS.contains(&extension) {
        return false;
    }

    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) => {
            tracing::warn!(error = %err, "could not re-read the upload for loudness analysis");
            return false;
        }
    };

    let Some(gain) = measure_replay_gain(&bytes, extension) else {
        tracing::info!("loudness could not be measured; storing the file untagged");
        return false;
    };

    match write_replay_gain(path, gain) {
        Ok(()) => {
            tracing::info!(
                gain_db = format!("{:.2}", gain.gain_db),
                peak = format!("{:.6}", gain.peak),
                "wrote ReplayGain tags"
            );
            true
        }
        Err(err) => {
            tracing::warn!(error = %err, "could not write ReplayGain tags; storing untagged");
            false
        }
    }
}

/// Key and BPM, via the crate behind the Neon binding `apps/api` loads.
///
/// Calling it directly means there is no native module to build and nothing to
/// be unavailable at runtime — the analysis either works or reports why.
pub fn analyze(bytes: &[u8], extension: &str) -> Option<rocksky_analysis::Analysis> {
    match rocksky_analysis::analyze(bytes, Some(extension)) {
        Ok(analysis) => Some(analysis),
        Err(err) => {
            tracing::warn!(error = %err, "key/bpm analysis failed");
            None
        }
    }
}

/// `sha256(lower("{title} - {artist} - {album}"))` — the identity every
/// ingestion source agrees on, so the same song uploaded here and scrobbled
/// from Spotify is one `tracks` row.
pub fn metadata_hash(title: &str, artist: &str, album: &str) -> String {
    rocksky_core::identity::track_hash(title, artist, album)
}

/// Hash of the stored bytes, used for the object key.
///
/// Distinct from [`metadata_hash`]: two different files can describe the same
/// song, and they must not overwrite each other in the bucket.
pub fn content_hash(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(bytes))
}

/// Cover art filename: `md5(lower("{albumArtist} - {album}"))`.
///
/// MD5 and this exact string are the convention the cloud-drive crates use, so
/// the same album uploaded twice — or scanned from Dropbox — reuses one cover
/// object instead of duplicating it.
pub fn cover_id(album_artist: &str, album: &str) -> String {
    rocksky_core::identity::cover_id(album_artist, album)
}

/// Extension for an embedded picture's MIME type, when it is one that can be
/// served.
pub fn picture_extension(mime: &str) -> Option<&'static str> {
    match mime {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/bmp" => Some("bmp"),
        "image/tiff" => Some("tiff"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_are_identified_by_their_leading_bytes() {
        // Not by Content-Type: a browser sends whatever the OS guessed.
        assert_eq!(detect_mime(b"ID3\x04\x00\x00"), Some("audio/mpeg"));
        assert_eq!(detect_mime(&[0xff, 0xfb, 0x90, 0x00]), Some("audio/mpeg"));
        assert_eq!(detect_mime(b"fLaC\x00\x00\x00\x22"), Some("audio/flac"));
        assert_eq!(detect_mime(b"OggS\x00\x02\x00\x00"), Some("audio/ogg"));
        assert_eq!(detect_mime(b"RIFF\x24\x08\x00\x00WAVE"), Some("audio/wav"));
        assert_eq!(detect_mime(b"FORM\x00\x00\x00\x00AIFF"), Some("audio/aiff"));
        // The ftyp box starts at byte 4.
        assert_eq!(detect_mime(b"\x00\x00\x00\x20ftypM4A "), Some("audio/mp4"));
    }

    #[test]
    fn non_audio_is_rejected() {
        // A JPEG renamed to .mp3 must not be accepted.
        assert_eq!(detect_mime(&[0xff, 0xd8, 0xff, 0xe0]), None);
        assert_eq!(detect_mime(b"%PDF-1.4"), None);
        assert_eq!(detect_mime(b""), None);
        assert_eq!(detect_mime(b"ftyp"), None, "too short to hold the box");
    }

    #[test]
    fn extensions_map_from_mime() {
        assert_eq!(extension_for("audio/mpeg"), "mp3");
        assert_eq!(extension_for("audio/x-m4a"), "m4a");
        assert_eq!(extension_for("audio/mp4"), "m4a");
        assert_eq!(extension_for("application/zip"), "bin");
    }

    fn complete() -> Tags {
        Tags {
            title: "Roygbiv".into(),
            artist: "Boards of Canada".into(),
            album: "Music Has the Right to Children".into(),
            album_artist: "Boards of Canada".into(),
            duration_ms: 151_000,
            picture: Some(("image/jpeg".into(), vec![0xff, 0xd8])),
            ..Default::default()
        }
    }

    #[test]
    fn a_complete_file_validates() {
        assert!(validate(&complete()).is_ok());
    }

    #[test]
    fn an_untagged_file_is_told_to_be_tagged() {
        let rejection = validate(&Tags::default()).unwrap_err();
        assert_eq!(rejection, Rejection::NoTags);
        assert_eq!(rejection.code(), "NO_TAGS");
        assert!(rejection.message().contains("tag your file"));
    }

    #[test]
    fn missing_fields_are_named_individually() {
        let mut tags = complete();
        tags.title = String::new();
        tags.duration_ms = 0;
        tags.picture = None;

        let rejection = validate(&tags).unwrap_err();
        assert_eq!(rejection.code(), "INCOMPLETE_METADATA");
        let missing = rejection.missing_fields();
        assert!(missing.contains(&"title".to_string()), "{missing:?}");
        assert!(missing.contains(&"duration".to_string()), "{missing:?}");
        // And the message lists them, since the UI shows it verbatim.
        assert!(rejection.message().contains("title"), "{rejection:?}");
    }

    /// A file with no embedded cover still uploads — it gets the placeholder,
    /// the same as one scanned from a cloud drive.
    #[test]
    fn art_is_not_required() {
        let mut tags = complete();
        tags.picture = None;
        assert!(validate(&tags).is_ok());
    }

    #[test]
    fn over_long_tags_are_rejected_with_their_limit() {
        let mut tags = complete();
        tags.title = "x".repeat(513);
        let missing = validate(&tags).unwrap_err().missing_fields();
        assert_eq!(missing, vec!["title (too long, max 512 chars)"]);

        let mut tags = complete();
        tags.artist = "x".repeat(257);
        assert!(validate(&tags)
            .unwrap_err()
            .missing_fields()
            .iter()
            .any(|m| m.starts_with("artist (too long")));

        // The limits are in characters, not bytes: a 300-character title of
        // multi-byte text is fine even though it is over 512 bytes.
        let mut tags = complete();
        tags.title = "é".repeat(300);
        assert!(validate(&tags).is_ok());
    }

    #[test]
    fn the_album_artist_falls_back_to_the_track_artist() {
        let mut tags = complete();
        tags.album_artist = String::new();
        assert_eq!(tags.album_artist(), "Boards of Canada");
        // And a missing album artist is not itself a rejection.
        assert!(validate(&tags).is_ok());
    }

    #[test]
    fn the_disc_number_defaults_to_one() {
        let mut tags = complete();
        assert_eq!(tags.disc(), 1, "absent means the only disc");
        tags.disc_number = Some(0);
        assert_eq!(tags.disc(), 1, "zero is not a disc number");
        tags.disc_number = Some(2);
        assert_eq!(tags.disc(), 2);
    }

    #[test]
    fn the_metadata_hash_agrees_with_the_indexer() {
        // The whole point: a song uploaded here and one scrobbled from
        // elsewhere must resolve to the same `tracks` row.
        assert_eq!(
            metadata_hash("Roygbiv", "Boards of Canada", "MHTRTC"),
            rocksky_core::identity::track_hash("Roygbiv", "Boards of Canada", "MHTRTC")
        );
        // Case cannot change identity.
        assert_eq!(
            metadata_hash("ROYGBIV", "BOARDS OF CANADA", "MHTRTC"),
            metadata_hash("roygbiv", "boards of canada", "mhtrtc")
        );
    }

    #[test]
    fn the_content_hash_distinguishes_files_with_the_same_tags() {
        let first = content_hash(b"one file");
        let second = content_hash(b"another file");
        assert_ne!(first, second, "or one would overwrite the other");
        assert_eq!(first.len(), 64);
        assert_eq!(content_hash(b"one file"), first, "and is stable");
    }

    #[test]
    fn cover_ids_follow_the_cloud_drive_convention() {
        // md5 of the lowercased "albumArtist - album", so the same album
        // reuses one cover object however it arrived.
        let expected = format!("{:x}", md5::compute("boards of canada - mhtrtc"));
        assert_eq!(cover_id("Boards of Canada", "MHTRTC"), expected);
        assert_eq!(
            cover_id("BOARDS OF CANADA", "mhtrtc"),
            cover_id("Boards of Canada", "MHTRTC")
        );
    }

    #[test]
    fn picture_extensions_cover_what_can_be_served() {
        assert_eq!(picture_extension("image/jpeg"), Some("jpg"));
        assert_eq!(picture_extension("image/png"), Some("png"));
        assert_eq!(picture_extension("image/webp"), None);
        assert_eq!(picture_extension("text/html"), None);
    }

    #[test]
    fn replay_gain_is_only_written_where_it_can_be_read_back() {
        // WAV and AIFF have no standard place for these tags, so writing them
        // would be work nothing ever reads.
        assert!(REPLAYGAIN_EXTS.contains(&"mp3"));
        assert!(REPLAYGAIN_EXTS.contains(&"flac"));
        assert!(REPLAYGAIN_EXTS.contains(&"m4a"));
        assert!(REPLAYGAIN_EXTS.contains(&"ogg"));
        assert!(!REPLAYGAIN_EXTS.contains(&"wav"));
        assert!(!REPLAYGAIN_EXTS.contains(&"aiff"));
    }

    #[test]
    fn an_already_tagged_file_is_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("audio.mp3");
        std::fs::write(&path, b"not really audio").unwrap();

        // Already tagged: no measurement is attempted at all.
        assert!(!ensure_replay_gain(&path, "mp3", true));
        // An unsupported container likewise.
        assert!(!ensure_replay_gain(&path, "wav", false));
    }

    #[test]
    fn undecodable_audio_degrades_to_storing_untagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("audio.mp3");
        std::fs::write(&path, b"ID3\x04\x00\x00\x00\x00\x00\x00 not audio").unwrap();

        // No panic, no error — the file is simply stored as it arrived.
        assert!(!ensure_replay_gain(&path, "mp3", false));
        assert!(measure_replay_gain(b"garbage", "mp3").is_none());
    }

    #[test]
    fn the_written_gain_uses_the_replaygain_reference() {
        // -18 LUFS, not playerd's -14 playback target: writing -14 would make
        // every file play 4 dB loud in any other player.
        assert_eq!(REFERENCE_LUFS, -18.0);
    }

    #[test]
    fn reading_tags_from_a_non_audio_file_is_an_error_not_a_panic() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nope.mp3");
        std::fs::write(&path, b"this is not audio at all").unwrap();
        assert!(read_tags(&path).is_err());
    }
}
