//! Read embedded tags only. Scanning must never identify audio online.
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::tag::{Accessor, ItemKey, ItemValue};
use serde_json::{json, Value};
use std::path::Path;

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../crates/audio/tests/fixtures")
            .join(name)
    }

    #[test]
    fn embedded_tags_and_decoded_art_are_extracted() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["tagged.mp3", "tagged.flac"] {
            let art = dir.path().join(format!("{name}.art"));
            let tags = read(&fixture(name), &art).unwrap();
            assert_eq!(tags["title"], "Fixture Song");
            assert_eq!(tags["artist"], "Fixture Artist");
            assert_eq!(tags["albumArtist"], "Fixture Album Artist");
            assert_eq!(tags["trackNumber"], 2);
            assert!(tags["durationMs"].as_u64().unwrap() > 900);
            if name == "tagged.mp3" {
                assert!(std::fs::read(&art).unwrap().starts_with(b"\x89PNG"));
            }
        }
    }

    #[test]
    fn missing_tags_are_not_fabricated_from_filenames() {
        let dir = tempfile::tempdir().unwrap();
        let tags = read(&fixture("untagged.mp3"), &dir.path().join("art")).unwrap();
        assert_eq!(tags["title"], "");
        assert_eq!(tags["artist"], "");
        assert_eq!(tags["album"], "");
        let partial = read(&fixture("partial.mp3"), &dir.path().join("art")).unwrap();
        assert_eq!(partial["title"], "Only A Title");
        assert_eq!(partial["artist"], "");
    }
}

pub fn read(path: &Path, art_path: &Path) -> Result<Value, String> {
    let rockbox = rockbox_metadata::read(path).ok();
    let lofty = lofty::probe::Probe::open(path)
        .and_then(|p| Ok(p.guess_file_type()?))
        .and_then(|p| p.read())
        .ok();
    if rockbox.is_none() && lofty.is_none() {
        return Err("Could not read this audio format".into());
    }
    let mut result = json!({"title":"", "artist":"", "album":"", "albumArtist":"",
        "durationMs":0, "albumArt":null, "tags":{}});
    if let Some(m) = rockbox {
        result["title"] = json!(m.title.trim());
        result["artist"] = json!(m.artist.trim());
        result["album"] = json!(m.album.trim());
        result["albumArtist"] = json!(m.albumartist.trim());
        result["durationMs"] = json!(m.duration.as_millis() as u64);
        result["trackNumber"] = json!(m.track_number);
        result["discNumber"] = json!(m.disc_number);
        result["year"] = json!(m.year);
        result["genre"] = json!(m.genre);
        result["composer"] = json!(m.composer);
        result["mbId"] = json!(m.mb_track_id);
        result["sampleRate"] = json!(m.sample_rate);
        result["replayGainTrackDb"] = json!(m.replaygain.track_gain_db);
        result["replayGainAlbumDb"] = json!(m.replaygain.album_gain_db);
    }
    if let Some(file) = lofty {
        if result["durationMs"].as_u64().unwrap_or(0) == 0 {
            result["durationMs"] = json!(file.properties().duration().as_millis() as u64);
        }
        result["bitrate"] = json!(file.properties().audio_bitrate());
        result["channels"] = json!(file.properties().channels());
        // Prefer the primary tag, but retain fields from secondary tag blocks.
        let primary = file.primary_tag().or_else(|| file.first_tag());
        let tags = primary.into_iter().chain(
            file.tags()
                .iter()
                .filter(|t| primary.is_none_or(|p| !std::ptr::eq(p, *t))),
        );
        let mut artwork = None;
        for tag in tags {
            for (field, value) in [
                ("title", tag.title().map(|v| v.into_owned())),
                ("artist", tag.artist().map(|v| v.into_owned())),
                ("album", tag.album().map(|v| v.into_owned())),
                (
                    "albumArtist",
                    tag.get_string(&ItemKey::AlbumArtist).map(str::to_owned),
                ),
                ("genre", tag.genre().map(|v| v.into_owned())),
                (
                    "mbId",
                    tag.get_string(&ItemKey::MusicBrainzRecordingId)
                        .map(str::to_owned),
                ),
            ] {
                if result[field].as_str().unwrap_or("").trim().is_empty() {
                    if let Some(v) = value {
                        result[field] = json!(v.trim());
                    }
                }
            }
            for (field, value) in [
                ("trackNumber", tag.track()),
                ("discNumber", tag.disk()),
                ("year", tag.year()),
            ] {
                if result[field].as_u64().unwrap_or(0) == 0 {
                    result[field] = json!(value);
                }
            }
            for item in tag.items() {
                let value = match item.value() {
                    ItemValue::Text(v) | ItemValue::Locator(v) => v,
                    ItemValue::Binary(_) => continue,
                };
                let key = format!("{:?}", item.key());
                let values = result["tags"]
                    .as_object_mut()
                    .unwrap()
                    .entry(key)
                    .or_insert(json!([]));
                if !values.as_array().unwrap().contains(&json!(value)) {
                    values.as_array_mut().unwrap().push(json!(value));
                }
            }
            let picture = tag
                .pictures()
                .iter()
                .find(|p| p.pic_type() == PictureType::CoverFront)
                .or_else(|| tag.pictures().first());
            if artwork.is_none() {
                artwork = picture;
            }
        }
        if let Some(picture) = artwork {
            // Bound artwork storage; malformed files cannot fill internal storage.
            if picture.data().len() <= 20 * 1024 * 1024
                && std::fs::write(art_path, picture.data()).is_ok()
            {
                result["albumArt"] = json!(format!("file://{}", art_path.display()));
            }
        }
    }
    Ok(result)
}
