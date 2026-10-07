//! Read embedded tags only. Scanning must never identify audio online.
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::tag::{Accessor, ItemKey, ItemValue};
use serde_json::{json, Value};
use std::path::Path;

/// Called only for a private upload copy, never the user's original file.
pub fn write_upload(path: &Path, metadata: &Value, art_path: Option<&Path>) -> Result<(), String> {
    use lofty::config::WriteOptions;
    use lofty::tag::Tag;
    let text = |key: &str| metadata[key].as_str().unwrap_or("").trim();
    for (field, limit) in [("title", 512), ("artist", 256), ("album", 256)] {
        let value = text(field);
        if value.is_empty() || value.chars().count() > limit {
            return Err(format!("Complete the {field} metadata before uploading"));
        }
    }
    let mut file = lofty::probe::Probe::open(path)
        .and_then(|p| p.read())
        .map_err(|e| e.to_string())?;
    if file.primary_tag().is_none() {
        file.insert_tag(Tag::new(file.primary_tag_type()));
    }
    let tag = file
        .primary_tag_mut()
        .ok_or("This audio format cannot be tagged for upload")?;
    tag.set_title(text("title").to_owned());
    tag.set_artist(text("artist").to_owned());
    tag.set_album(text("album").to_owned());
    let album_artist = if text("albumArtist").is_empty() {
        text("artist")
    } else {
        text("albumArtist")
    };
    tag.insert_text(ItemKey::AlbumArtist, album_artist.to_owned());
    if metadata.get("genre").is_some() {
        tag.remove_genre();
        if !text("genre").is_empty() {
            tag.set_genre(text("genre").to_owned());
        }
    }
    for field in ["year", "trackNumber", "discNumber"] {
        if metadata.get(field).is_none() {
            continue;
        }
        let value = metadata[field]
            .as_u64()
            .and_then(|n| u32::try_from(n).ok())
            .filter(|n| *n > 0);
        match field {
            "year" => {
                tag.remove_year();
                if let Some(n) = value {
                    tag.set_year(n);
                }
            }
            "trackNumber" => {
                tag.remove_track();
                if let Some(n) = value {
                    tag.set_track(n);
                }
            }
            _ => {
                tag.remove_disk();
                if let Some(n) = value {
                    tag.set_disk(n);
                }
            }
        }
    }
    if !text("mbId").is_empty() {
        tag.insert_text(ItemKey::MusicBrainzRecordingId, text("mbId").to_owned());
    }
    if metadata.get("albumArt").is_some() {
        while !tag.pictures().is_empty() {
            tag.remove_picture(0);
        }
    }
    if let Some(art_path) = art_path {
        let mut input = std::fs::File::open(art_path).map_err(|e| e.to_string())?;
        let mut picture =
            lofty::picture::Picture::from_reader(&mut input).map_err(|e| e.to_string())?;
        picture.set_pic_type(PictureType::CoverFront);
        tag.push_picture(picture);
    }
    file.save_to_path(path, WriteOptions::default())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../crates/audio/tests/fixtures")
            .join(name)
    }

    #[test]
    fn upload_copy_contains_corrected_tags_and_art_without_changing_original() {
        let dir = tempfile::tempdir().unwrap();
        let art = dir.path().join("cover.png");
        read(&fixture("tagged.mp3"), &art).unwrap();
        for name in ["partial.mp3", "tagged.flac", "untagged.mp3"] {
            let original = std::fs::read(fixture(name)).unwrap();
            let copy = dir.path().join(name);
            std::fs::copy(fixture(name), &copy).unwrap();
            write_upload(&copy, &json!({"title":"Correct title","artist":"Correct artist","album":"Correct album","albumArtist":"Album artist","genre":"Pop","year":2024,"trackNumber":7,"discNumber":2,"albumArt":"cover"}), Some(&art)).unwrap();
            let result = read(&copy, &dir.path().join(format!("{name}.art"))).unwrap();
            assert_eq!(result["title"], "Correct title");
            assert_eq!(result["artist"], "Correct artist");
            assert_eq!(result["album"], "Correct album");
            assert_eq!(result["year"], 2024);
            assert_eq!(result["trackNumber"], 7);
            assert_eq!(result["discNumber"], 2);
            assert!(result["albumArt"].as_str().is_some());
            assert_eq!(std::fs::read(fixture(name)).unwrap(), original);
        }
    }

    #[test]
    fn upload_rejects_missing_core_metadata() {
        assert!(write_upload(
            &fixture("partial.mp3"),
            &json!({"title":"Only title"}),
            None
        )
        .is_err());
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
