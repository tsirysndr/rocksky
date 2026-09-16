//! What actually happens to a real audio file on its way into the library.
//!
//! The unit tests in `uploads::audio` build `Tags` by hand, which checks the
//! rules but not the readers. These walk the fixtures — genuine MP3 and FLAC
//! files with genuine tags — through the same calls the upload route makes, so
//! a change of tag-crate field name or a broken ReplayGain write shows up as a
//! failure rather than as silently empty metadata in production.
//!
//! The fixtures are one second of a 440 Hz sine, generated with ffmpeg. Their
//! reference figures, measured by ffmpeg's own `ebur128` and `astats`:
//!
//! | fixture     | integrated loudness | sample peak |
//! |-------------|---------------------|-------------|
//! | tagged.mp3  | -22.2 LUFS          | -18.50 dB   |
//! | tagged.flac | -21.8 LUFS          | -18.06 dB   |
//!
//! Both are quiet, so the gain to the -18 LUFS reference comes out positive.

use rocksky_appview::uploads::audio;
use std::path::{Path, PathBuf};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/audio")
        .join(name)
}

/// Copies a fixture somewhere writable, since tagging rewrites in place.
fn staged(name: &str, dir: &Path) -> PathBuf {
    let path = dir.join(name);
    std::fs::copy(fixture(name), &path).unwrap();
    path
}

#[test]
fn an_mp3_is_identified_from_its_bytes_and_read_in_full() {
    let bytes = std::fs::read(fixture("tagged.mp3")).unwrap();
    assert_eq!(audio::detect_mime(&bytes), Some("audio/mpeg"));
    assert_eq!(audio::extension_for("audio/mpeg"), "mp3");

    let tags = audio::read_tags(&fixture("tagged.mp3")).unwrap();

    assert_eq!(tags.title, "Fixture Song");
    assert_eq!(tags.artist, "Fixture Artist");
    assert_eq!(tags.album, "Fixture Album");
    assert_eq!(tags.album_artist, "Fixture Album Artist");
    assert_eq!(tags.track_number, Some(2));
    assert_eq!(tags.disc(), 1);
    assert_eq!(tags.year, Some(2021));
    assert_eq!(tags.genre.as_deref(), Some("Test Genre"));
    assert_eq!(tags.composer.as_deref(), Some("Fixture Composer"));
    assert_eq!(tags.sample_rate, Some(44100));

    // One second, within the granularity of an MPEG frame.
    assert!(
        (900..=1100).contains(&tags.duration_ms),
        "duration was {}",
        tags.duration_ms
    );

    // The cover comes back decoded, which is the job lofty does here that
    // rockbox-metadata does not.
    let (mime, data) = tags.picture.as_ref().expect("the fixture embeds a cover");
    assert_eq!(mime, "image/png");
    assert!(data.starts_with(b"\x89PNG"), "the art is a real PNG");

    audio::validate(&tags).expect("a fully tagged file is accepted");
}

#[test]
fn a_flac_is_read_the_same_way() {
    let bytes = std::fs::read(fixture("tagged.flac")).unwrap();
    assert_eq!(audio::detect_mime(&bytes), Some("audio/flac"));

    let tags = audio::read_tags(&fixture("tagged.flac")).unwrap();

    assert_eq!(tags.title, "Fixture Song");
    assert_eq!(tags.album_artist, "Fixture Album Artist");
    assert_eq!(tags.track_number, Some(2));
    assert_eq!(tags.year, Some(2021));
    assert_eq!(tags.sample_rate, Some(44100));
    assert_eq!(tags.duration_ms, 1000);

    audio::validate(&tags).expect("a fully tagged file is accepted");
}

/// A file with nothing at all in it is told to be tagged, rather than handed a
/// list of every field it is missing.
#[test]
fn a_completely_untagged_file_is_told_to_be_tagged() {
    let tags = audio::read_tags(&fixture("untagged.mp3")).unwrap();
    let rejection = audio::validate(&tags).unwrap_err();

    assert_eq!(rejection.code(), "NO_TAGS");
    assert!(rejection.message().contains("tag your file"));
}

/// The tags an upload is refused for are the tags the lexicon requires — and
/// no more: art is optional.
#[test]
fn a_partly_tagged_file_names_what_it_is_missing() {
    let tags = audio::read_tags(&fixture("partial.mp3")).unwrap();
    assert_eq!(tags.title, "Only A Title");

    let rejection = audio::validate(&tags).unwrap_err();

    assert_eq!(rejection.code(), "INCOMPLETE_METADATA");
    let missing = rejection.missing_fields();
    for field in ["artist", "album"] {
        assert!(missing.contains(&field.to_string()), "{missing:?}");
    }
    // The one tag it does have is not complained about.
    assert!(!missing.contains(&"title".to_string()), "{missing:?}");
    // It has a readable duration, so that is not among the complaints.
    assert!(!missing.contains(&"duration".to_string()), "{missing:?}");
    assert!(
        !missing.iter().any(|field| field.contains("album art")),
        "art is not required: {missing:?}"
    );
}

/// Measured against ffmpeg's own ebur128, which is the same library.
#[test]
fn loudness_agrees_with_ffmpeg() {
    // ffmpeg: -22.2 LUFS integrated, peak -18.50 dB (= 0.1191 linear).
    let mp3 = std::fs::read(fixture("tagged.mp3")).unwrap();
    let gain = audio::measure_replay_gain(&mp3, "mp3").expect("a real MP3 measures");
    let loudness = -18.0 - gain.gain_db;
    assert!(
        (loudness - -22.2).abs() < 0.5,
        "measured {loudness:.2} LUFS, ffmpeg says -22.2"
    );
    assert!(
        (gain.peak - 0.1191).abs() < 0.01,
        "peak was {:.4}, ffmpeg says 0.1191",
        gain.peak
    );

    // ffmpeg: -21.8 LUFS, peak -18.06 dB (= 0.1251 linear).
    let flac = std::fs::read(fixture("tagged.flac")).unwrap();
    let gain = audio::measure_replay_gain(&flac, "flac").expect("a real FLAC measures");
    let loudness = -18.0 - gain.gain_db;
    assert!(
        (loudness - -21.8).abs() < 0.5,
        "measured {loudness:.2} LUFS, ffmpeg says -21.8"
    );
    assert!(
        (gain.peak - 0.1251).abs() < 0.01,
        "peak was {:.4}, ffmpeg says 0.1251",
        gain.peak
    );
}

/// The point of writing the tag is that a player can read it back, and the
/// player's reader is `rockbox-metadata` — so that is what has to see it.
#[test]
fn a_written_gain_is_read_back_by_the_players_own_parser() {
    let dir = tempfile::tempdir().unwrap();

    for (name, extension) in [("tagged.mp3", "mp3"), ("tagged.flac", "flac")] {
        let path = staged(name, dir.path());

        let before = audio::read_tags(&path).unwrap();
        assert!(!before.has_replay_gain, "{name} starts untagged");

        audio::ensure_replay_gain(&path, extension, before.has_replay_gain);

        let after = audio::read_tags(&path).unwrap();
        assert!(after.has_replay_gain, "{name} carries a gain afterwards");

        // And the rest of the tags survived the rewrite, which is the thing
        // that quietly breaks when a tag writer is handed the wrong format.
        assert_eq!(after.title, before.title, "{name}");
        assert_eq!(after.album_artist, before.album_artist, "{name}");
        assert_eq!(after.track_number, before.track_number, "{name}");
        assert_eq!(
            after.picture.is_some(),
            before.picture.is_some(),
            "{name} keeps its art"
        );
    }
}

/// A file that already has a gain is not re-measured, so a value a user tagged
/// deliberately is not overwritten by ours.
#[test]
fn an_existing_gain_is_left_alone() {
    let dir = tempfile::tempdir().unwrap();
    let path = staged("tagged.flac", dir.path());

    audio::ensure_replay_gain(&path, "flac", false);
    let ours = std::fs::read(&path).unwrap();

    // Second pass, now told the file is already tagged.
    audio::ensure_replay_gain(&path, "flac", true);
    assert_eq!(
        std::fs::read(&path).unwrap(),
        ours,
        "the file was untouched"
    );
}

/// WAV has no standard place for a ReplayGain tag, so writing one would be
/// write-only. Nothing should change.
#[test]
fn a_container_that_cannot_hold_a_gain_is_skipped() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sample.wav");
    std::fs::copy(fixture("tagged.mp3"), &path).unwrap();
    let before = std::fs::read(&path).unwrap();

    audio::ensure_replay_gain(&path, "wav", false);
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

/// Key and BPM come from `rocksky-analysis`, called directly rather than
/// through the Neon binding.
///
/// The fixture is one second long, which is below what tempo and key detection
/// need, so both come back empty — and that is the point worth pinning: a file
/// too short to analyse returns `None`, not an error, so the upload it belongs
/// to is unaffected. The decode itself is what is being checked, and the
/// duration coming back right proves it ran.
#[test]
fn a_real_file_reaches_the_analyser() {
    let bytes = std::fs::read(fixture("tagged.flac")).unwrap();
    let analysis = audio::analyze(&bytes, "flac").expect("a real FLAC decodes");

    assert!(
        (analysis.duration - 1.0).abs() < 0.05,
        "the analyser saw {} seconds, not 1",
        analysis.duration
    );
    if let Some(bpm) = analysis.bpm {
        assert!((20.0..=300.0).contains(&bpm), "implausible tempo {bpm}");
    }
}

/// Bytes that are not audio are `None` rather than a panic or an error the
/// spawned task would have to handle.
#[test]
fn the_analyser_declines_non_audio_without_failing() {
    assert!(audio::analyze(b"this is not audio at all", "flac").is_none());
}

/// Two different files that share every tag must not share a storage key, or
/// the second upload would overwrite the first.
#[test]
fn the_storage_hash_follows_the_bytes_not_the_tags() {
    let mp3 = std::fs::read(fixture("tagged.mp3")).unwrap();
    let flac = std::fs::read(fixture("tagged.flac")).unwrap();

    let mp3_tags = audio::read_tags(&fixture("tagged.mp3")).unwrap();
    let flac_tags = audio::read_tags(&fixture("tagged.flac")).unwrap();

    // Same release, so the same catalogue identity...
    assert_eq!(
        audio::metadata_hash(&mp3_tags.title, &mp3_tags.artist, &mp3_tags.album),
        audio::metadata_hash(&flac_tags.title, &flac_tags.artist, &flac_tags.album),
    );
    // ...but different bytes, so different objects.
    assert_ne!(audio::content_hash(&mp3), audio::content_hash(&flac));
}
