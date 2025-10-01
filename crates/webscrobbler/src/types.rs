use serde::{Deserialize, Serialize};

use crate::{
    musicbrainz::{self, normalize_date},
    spotify, xata,
};

#[derive(Deserialize, Debug, Clone)]
pub struct Connector {
    pub id: String,
    pub js: String,
    pub label: String,
    pub matches: Vec<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IsRegrexEditedByUser {
    pub album: bool,
    pub album_artist: bool,
    pub artist: bool,
    pub track: bool,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Flags {
    pub finished_processing: bool,
    pub has_blocked_tag: bool,
    pub is_album_fetched: bool,
    pub is_corrected_by_user: bool,
    pub is_loved_in_service: Option<bool>,
    pub is_marked_as_playing: bool,
    pub is_regex_edited_by_user: IsRegrexEditedByUser,
    pub is_replaying: bool,
    pub is_scrobbled: bool,
    pub is_skipped: bool,
    pub is_valid: bool,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub album_url: Option<String>,
    pub artist_url: Option<String>,
    pub label: String,
    pub start_timestamp: u64,
    pub track_url: Option<String>,
    pub user_play_count: Option<u32>,
    pub userloved: Option<bool>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoRegex {
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub artist: String,
    pub duration: Option<u32>,
    pub track: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Parsed {
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub artist: String,
    pub current_time: Option<u32>,
    pub duration: Option<u32>,
    pub is_playing: bool,
    pub is_podcast: bool,
    pub origin_url: Option<String>,
    pub scrobbling_disallowed_reason: Option<String>,
    pub track: String,
    pub track_art: Option<String>,
    #[serde(rename = "uniqueID")]
    pub unique_id: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub connector: Connector,
    pub controller_tab_id: u64,
    pub flags: Flags,
    pub metadata: Metadata,
    pub no_regex: NoRegex,
    pub parsed: Parsed,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Processed {
    pub album: String,
    pub album_artist: Option<String>,
    pub artist: String,
    pub duration: u32,
    pub track: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Scrobble {
    pub song: Song,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleRequest {
    pub data: Scrobble,
    pub event_name: String,
    pub time: u64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub title: String,
    pub album: String,
    pub artist: String,
    pub album_artist: Option<String>,
    pub duration: u32,
    pub mbid: Option<String>,
    pub track_number: u32,
    pub release_date: Option<String>,
    pub year: Option<u32>,
    pub disc_number: u32,
    pub album_art: Option<String>,
    pub spotify_link: Option<String>,
    pub label: Option<String>,
    pub artist_picture: Option<String>,
    pub timestamp: Option<u64>,
    pub genres: Option<Vec<String>>,
}

impl From<xata::track::Track> for Track {
    fn from(track: xata::track::Track) -> Self {
        Track {
            title: track.title,
            album: track.album,
            artist: track.artist,
            album_artist: Some(track.album_artist),
            album_art: track.album_art,
            spotify_link: track.spotify_link,
            label: track.label,
            artist_picture: None,
            timestamp: None,
            duration: track.duration as u32,
            mbid: track.mb_id,
            track_number: track.track_number as u32,
            disc_number: track.disc_number as u32,
            year: None,
            release_date: None,
            genres: None,
        }
    }
}

impl From<musicbrainz::recording::Recording> for Track {
    fn from(recording: musicbrainz::recording::Recording) -> Self {
        let artist_credit = recording
            .artist_credit
            .unwrap_or_default()
            .first()
            .map(|credit| credit.name.clone())
            .unwrap_or_default();
        let releases = recording.releases.unwrap_or_default();
        let release_date = releases
            .first()
            .and_then(|release| release.date.clone())
            .and_then(|date| normalize_date(Some(&date)).unwrap_or(None));
        tracing::info!(release_date = ?release_date, "Normalized release date:");
        let album_artist = releases
            .first()
            .and_then(|release| {
                let credits = release.artist_credit.clone().unwrap_or_default();
                credits.first().map(|credit| credit.clone())
            })
            .map(|credit| credit.name.clone());
        let album = releases
            .first()
            .map(|release| release.title.clone())
            .unwrap_or_default();
        Track {
            title: recording.title.clone(),
            album,
            artist: artist_credit,
            album_artist,
            duration: recording.length.unwrap_or_default(),
            year: release_date
                .as_ref()
                .and_then(|date| date.split('-').next())
                .and_then(|year| year.parse::<u32>().ok()),
            release_date: release_date.clone(),
            track_number: releases
                .first()
                .and_then(|release| {
                    release
                        .media
                        .as_ref()
                        .and_then(|media| media.first())
                        .and_then(|media| {
                            media
                                .track
                                .as_ref()
                                .and_then(|tracks| tracks.first())
                                .map(|track| track.number.parse::<u32>().unwrap())
                        })
                })
                .unwrap_or_default(),
            disc_number: releases
                .first()
                .and_then(|release| {
                    release
                        .media
                        .as_ref()
                        .and_then(|media| media.first())
                        .map(|media| media.position.unwrap_or(1) as u32)
                })
                .unwrap_or_default(),
            ..Default::default()
        }
    }
}

impl From<&spotify::types::Track> for Track {
    fn from(track: &spotify::types::Track) -> Self {
        Track {
            title: track.name.clone(),
            album: track.album.name.clone(),
            artist: track
                .artists
                .iter()
                .map(|artist| artist.name.clone())
                .collect::<Vec<_>>()
                .join(", "),
            album_artist: track
                .album
                .artists
                .first()
                .map(|artist| artist.name.clone()),
            duration: track.duration_ms as u32,
            album_art: track.album.images.first().map(|image| image.url.clone()),
            spotify_link: Some(track.external_urls.spotify.clone()),
            artist_picture: track.album.artists.first().and_then(|artist| {
                artist
                    .images
                    .as_ref()
                    .and_then(|images| images.first().map(|image| image.url.clone()))
            }),
            track_number: track.track_number,
            disc_number: track.disc_number,
            release_date: match track.album.release_date_precision.as_str() {
                "day" => Some(track.album.release_date.clone()),
                _ => None,
            },
            year: match track.album.release_date_precision.as_str() {
                "day" => Some(
                    track
                        .album
                        .release_date
                        .split('-')
                        .next()
                        .unwrap()
                        .parse::<u32>()
                        .unwrap(),
                ),
                "year" => Some(track.album.release_date.parse::<u32>().unwrap()),
                _ => None,
            },
            label: track.album.label.clone(),
            genres: track
                .album
                .artists
                .first()
                .and_then(|artist| artist.genres.clone()),
            ..Default::default()
        }
    }
}

impl From<spotify::types::Track> for Track {
    fn from(track: spotify::types::Track) -> Self {
        Track::from(&track)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tidal_scrobble_request() {
        let json = r#"
       {
          "data": {
            "song": {
              "connector": {
                "id": "tidal",
                "js": "tidal.js",
                "label": "Tidal",
                "matches": [
                  "*://listen.tidalhifi.com/*",
                  "*://listen.tidal.com/*"
                ]
              },
              "controllerTabId": 2105806618,
              "flags": {
                "finishedProcessing": true,
                "hasBlockedTag": false,
                "isAlbumFetched": false,
                "isCorrectedByUser": false,
                "isLovedInService": null,
                "isMarkedAsPlaying": true,
                "isRegexEditedByUser": {
                  "album": false,
                  "albumArtist": false,
                  "artist": false,
                  "track": false
                },
                "isReplaying": false,
                "isScrobbled": false,
                "isSkipped": false,
                "isValid": true
              },
              "metadata": {
                "albumUrl": "https://www.last.fm/music/Tee+Grizzley/Forever+My+Moment+%5BClean%5D+%5BClean%5D",
                "artistUrl": "https://www.last.fm/music/Tee+Grizzley",
                "label": "Tidal",
                "startTimestamp": 1747766980,
                "trackUrl": "https://www.last.fm/music/Tee+Grizzley/_/Forever+My+Moment",
                "userPlayCount": 0,
                "userloved": false
              },
              "noRegex": {
                "album": "FOREVER MY MOMENT",
                "albumArtist": null,
                "artist": "Tee Grizzley",
                "duration": null,
                "track": "Forever My Moment"
              },
              "parsed": {
                "album": "FOREVER MY MOMENT",
                "albumArtist": null,
                "artist": "Tee Grizzley",
                "currentTime": 17,
                "duration": 182,
                "isPlaying": false,
                "isPodcast": false,
                "originUrl": "https://listen.tidal.com/",
                "scrobblingDisallowedReason": null,
                "track": "Forever My Moment",
                "trackArt": "https://resources.tidal.com/images/275251bf/9f03/46bf/9e46/3a3b0a67abe6/80x80.jpg",
                "uniqueID": "434750253"
              },
              "processed": {
                "album": "FOREVER MY MOMENT",
                "albumArtist": null,
                "artist": "Tee Grizzley",
                "duration": 182,
                "track": "Forever My Moment"
              }
            }
          },
          "eventName": "paused",
          "time": 1747766997907
        }
        "#;

        let result = serde_json::from_str::<ScrobbleRequest>(json);
        assert!(result.is_ok(), "Failed to parse JSON: {:?}", result.err());
    }

    #[test]
    fn test_spotify_nowplaying_request() {
        let json = r#"
        {
          "data": {
            "song": {
              "connector": {
                "hasNativeScrobbler": true,
                "id": "spotify",
                "js": "spotify.js",
                "label": "Spotify",
                "matches": [
                  "*://open.spotify.com/*"
                ]
              },
              "controllerTabId": 2105804433,
              "flags": {
                "finishedProcessing": true,
                "hasBlockedTag": false,
                "isAlbumFetched": false,
                "isCorrectedByUser": false,
                "isLovedInService": null,
                "isMarkedAsPlaying": true,
                "isRegexEditedByUser": {
                  "album": false,
                  "albumArtist": false,
                  "artist": false,
                  "track": false
                },
                "isReplaying": false,
                "isScrobbled": false,
                "isSkipped": false,
                "isValid": true
              },
              "metadata": {
                "albumUrl": "https://www.last.fm/music/The+Weeknd/Hurry+Up+Tomorrow+(First+Press)",
                "artistUrl": "https://www.last.fm/music/The+Weeknd",
                "label": "Spotify",
                "startTimestamp": 1747753805,
                "trackArtUrl": "https://lastfm.freetls.fastly.net/i/u/300x300/eadb0529b2c5066ebe7f53c52e329def.png",
                "trackUrl": "https://www.last.fm/music/The+Weeknd/_/Given+Up+on+Me",
                "userPlayCount": 0,
                "userloved": false
              },
              "noRegex": {
                "album": "Hurry Up Tomorrow",
                "albumArtist": null,
                "artist": "The Weeknd",
                "duration": null,
                "track": "Given Up On Me"
              },
              "parsed": {
                "album": "Hurry Up Tomorrow",
                "albumArtist": null,
                "artist": "The Weeknd",
                "currentTime": null,
                "duration": 354,
                "isPlaying": true,
                "isPodcast": false,
                "originUrl": null,
                "scrobblingDisallowedReason": null,
                "track": "Given Up On Me",
                "trackArt": "https://i.scdn.co/image/ab67616d00001e02982320da137d0de34410df61",
                "uniqueID": null
              },
              "processed": {
                "album": "Hurry Up Tomorrow",
                "albumArtist": null,
                "artist": "The Weeknd",
                "duration": 354,
                "track": "Given Up on Me"
              }
            }
          },
          "eventName": "nowplaying",
          "time": 1747753806195
        }
        "#;

        let result = serde_json::from_str::<ScrobbleRequest>(json);
        assert!(result.is_ok(), "Failed to parse JSON: {:?}", result.err());
    }

    #[test]
    fn test_spotify_scrobble_request() {
        let json = r#"
       {
        "data": {
          "currentlyPlaying": true,
          "song": {
            "connector": {
              "hasNativeScrobbler": true,
              "id": "spotify",
              "js": "spotify.js",
              "label": "Spotify",
              "matches": [
                "*://open.spotify.com/*"
              ]
            },
            "controllerTabId": 2105804433,
            "flags": {
              "finishedProcessing": true,
              "hasBlockedTag": false,
              "isAlbumFetched": false,
              "isCorrectedByUser": false,
              "isLovedInService": null,
              "isMarkedAsPlaying": true,
              "isRegexEditedByUser": {
                "album": false,
                "albumArtist": false,
                "artist": false,
                "track": false
              },
              "isReplaying": false,
              "isScrobbled": false,
              "isSkipped": false,
              "isValid": true
            },
            "metadata": {
              "artistUrl": "https://www.last.fm/music/VIZE,+Tom+Gregory",
              "label": "Spotify",
              "startTimestamp": 1747753624,
              "trackUrl": "https://www.last.fm/music/VIZE,+Tom+Gregory/_/Never+Let+Me+Down",
              "userPlayCount": 0,
              "userloved": false
            },
            "noRegex": {
              "album": "Never Let Me Down",
              "albumArtist": null,
              "artist": "VIZE, Tom Gregory",
              "duration": null,
              "track": "Never Let Me Down"
            },
            "parsed": {
              "album": "Never Let Me Down",
              "albumArtist": null,
              "artist": "VIZE, Tom Gregory",
              "currentTime": 76,
              "duration": 153,
              "isPlaying": true,
              "isPodcast": false,
              "originUrl": null,
              "scrobblingDisallowedReason": null,
              "track": "Never Let Me Down",
              "trackArt": "https://i.scdn.co/image/ab67616d00001e02e33c4ba1bf5eecbbc7dddc85",
              "uniqueID": null
            },
            "processed": {
              "album": "Never Let Me Down",
              "albumArtist": null,
              "artist": "VIZE, Tom Gregory",
              "duration": 153,
              "track": "Never Let Me Down"
            }
          },
          "songs": [
            {
              "connector": {
                "hasNativeScrobbler": true,
                "id": "spotify",
                "js": "spotify.js",
                "label": "Spotify",
                "matches": [
                  "*://open.spotify.com/*"
                ]
              },
              "controllerTabId": 2105804433,
              "flags": {
                "finishedProcessing": true,
                "hasBlockedTag": false,
                "isAlbumFetched": false,
                "isCorrectedByUser": false,
                "isLovedInService": null,
                "isMarkedAsPlaying": true,
                "isRegexEditedByUser": {
                  "album": false,
                  "albumArtist": false,
                  "artist": false,
                  "track": false
                },
                "isReplaying": false,
                "isScrobbled": false,
                "isSkipped": false,
                "isValid": true
              },
              "metadata": {
                "artistUrl": "https://www.last.fm/music/VIZE,+Tom+Gregory",
                "label": "Spotify",
                "startTimestamp": 1747753624,
                "trackUrl": "https://www.last.fm/music/VIZE,+Tom+Gregory/_/Never+Let+Me+Down",
                "userPlayCount": 0,
                "userloved": false
              },
              "noRegex": {
                "album": "Never Let Me Down",
                "albumArtist": null,
                "artist": "VIZE, Tom Gregory",
                "duration": null,
                "track": "Never Let Me Down"
              },
              "parsed": {
                "album": "Never Let Me Down",
                "albumArtist": null,
                "artist": "VIZE, Tom Gregory",
                "currentTime": 76,
                "duration": 153,
                "isPlaying": true,
                "isPodcast": false,
                "originUrl": null,
                "scrobblingDisallowedReason": null,
                "track": "Never Let Me Down",
                "trackArt": "https://i.scdn.co/image/ab67616d00001e02e33c4ba1bf5eecbbc7dddc85",
                "uniqueID": null
              },
              "processed": {
                "album": "Never Let Me Down",
                "albumArtist": null,
                "artist": "VIZE, Tom Gregory",
                "duration": 153,
                "track": "Never Let Me Down"
              }
            }
          ]
        },
        "eventName": "scrobble",
        "time": 1747753702338
      }
        "#;

        let result = serde_json::from_str::<ScrobbleRequest>(json);
        assert!(result.is_ok(), "Failed to parse JSON: {:?}", result.err());
    }

    #[test]
    fn test_youtube_scrobble_request() {
        let json = r#"
      {
  "eventName": "nowplaying",
  "time": 1747899797294,
  "data": {
    "song": {
      "parsed": {
        "track": "Let It Talk To Me",
        "artist": "Sean Paul x INNA",
        "albumArtist": null,
        "album": null,
        "duration": 155,
        "uniqueID": "nkRyAVQdqAA",
        "currentTime": 11,
        "isPlaying": true,
        "isPodcast": false,
        "originUrl": "https://youtu.be/nkRyAVQdqAA",
        "scrobblingDisallowedReason": null,
        "trackArt": null
      },
      "processed": {
        "track": "Let It Talk To Me",
        "artist": "Sean Paul x INNA",
        "albumArtist": null,
        "duration": 154.661
      },
      "noRegex": {
        "track": "Let It Talk To Me",
        "artist": "Sean Paul x INNA",
        "albumArtist": null,
        "duration": null
      },
      "flags": {
        "isScrobbled": false,
        "isCorrectedByUser": false,
        "isRegexEditedByUser": {
          "track": false,
          "artist": false,
          "album": false,
          "albumArtist": false
        },
        "isAlbumFetched": true,
        "isValid": true,
        "isMarkedAsPlaying": true,
        "isSkipped": false,
        "isReplaying": false,
        "hasBlockedTag": false,
        "isLovedInService": null,
        "finishedProcessing": true
      },
      "metadata": {
        "userloved": false,
        "startTimestamp": 1747899788,
        "label": "YouTube",
        "trackArtUrl": "https://coverartarchive.org/release/b74fe4b2-d633-4607-af93-b277b8b6a6b6/front-500",
        "artistUrl": "https://www.last.fm/music/Sean+Paul+x+INNA",
        "trackUrl": "https://www.last.fm/music/Sean+Paul+x+INNA/_/Let+It+Talk+To+Me",
        "userPlayCount": 0
      },
      "connector": {
        "label": "YouTube",
        "matches": [
          "*://www.youtube.com/*",
          "*://m.youtube.com/*"
        ],
        "js": "youtube.js",
        "id": "youtube",
        "usesBlocklist": true
      },
      "controllerTabId": 2105807456
    }
  }
}
      "#;

        let result = serde_json::from_str::<ScrobbleRequest>(json);
        assert!(result.is_ok(), "Failed to parse JSON: {:?}", result.err());
    }

    #[test]
    fn test_artists_parsing() {
        let track = "Let It Talk To Me";
        let artist = " Sean Paul x INNA";
        let query = match artist.contains(" x ") {
            true => {
                let artists = artist
                    .split(" x ")
                    .map(|a| format!(r#"artist:"{}""#, a.trim()))
                    .collect::<Vec<_>>()
                    .join(" ");
                format!(r#"track:"{}" {}"#, track, artists)
            }
            false => format!(r#"track:"{}" artist:"{}""#, track, artist.trim()),
        };

        assert_eq!(
            query,
            r#"track:"Let It Talk To Me" artist:"Sean Paul" artist:"INNA""#
        );

        let artist = "Sean Paul, INNA";
        let track = "Let It Talk To Me";
        match artist.contains(", ") {
            true => {
                let artists = artist
                    .split(", ")
                    .map(|a| format!(r#"artist:"{}""#, a.trim()))
                    .collect::<Vec<_>>()
                    .join(" ");
                format!(r#"track:"{}" {}"#, track, artists)
            }
            false => format!(r#"track:"{}" artist:"{}""#, track, artist.trim()),
        };

        assert_eq!(
            query,
            r#"track:"Let It Talk To Me" artist:"Sean Paul" artist:"INNA""#
        );
    }

    #[test]
    fn test_kexp_scrobble_request() {
        let json = r#"
        {
  "eventName": "nowplaying",
  "time": 1749848844651,
  "data": {
    "song": {
      "parsed": {
        "track": "ENERGY",
        "artist": "Disclosure",
        "albumArtist": null,
        "album": "ENERGY",
        "duration": null,
        "uniqueID": null,
        "currentTime": null,
        "isPlaying": true,
        "trackArt": "https://ia803209.us.archive.org/7/items/mbid-6f1db1e3-71b3-4524-b0fe-c1e29f361dfe/mbid-6f1db1e3-71b3-4524-b0fe-c1e29f361dfe-26365923265_thumb250.jpg",
        "isPodcast": false,
        "originUrl": "https://www.kexp.org/",
        "scrobblingDisallowedReason": null
      },
      "processed": {
        "track": "ENERGY",
        "artist": "Disclosure",
        "albumArtist": null,
        "album": "ENERGY",
        "duration": null
      },
      "noRegex": {
        "track": "ENERGY",
        "artist": "Disclosure",
        "albumArtist": null,
        "album": "ENERGY",
        "duration": null
      },
      "flags": {
        "isScrobbled": false,
        "isCorrectedByUser": false,
        "isRegexEditedByUser": {
          "track": false,
          "artist": false,
          "album": false,
          "albumArtist": false
        },
        "isAlbumFetched": false,
        "isValid": true,
        "isMarkedAsPlaying": true,
        "isSkipped": false,
        "isReplaying": true,
        "hasBlockedTag": false,
        "isLovedInService": null,
        "finishedProcessing": true
      },
      "metadata": {
        "userloved": false,
        "startTimestamp": 1749848842,
        "label": "KEXP",
        "trackArtUrl": "https://lastfm.freetls.fastly.net/i/u/300x300/a18f5dadcc38ad3d264e74ce51d9cf08.png",
        "artistUrl": "https://www.last.fm/music/Disclosure",
        "trackUrl": "https://www.last.fm/music/Disclosure/_/ENERGY",
        "albumUrl": "https://www.last.fm/music/Various+Artists/Festival+Dance",
        "userPlayCount": 0
      },
      "connector": {
        "label": "KEXP",
        "matches": [
          "*://*.kexp.org/*"
        ],
        "js": "kexp.js",
        "id": "kexp"
      },
      "controllerTabId": 943739308
    }
  }
}
      "#;

        let result = serde_json::from_str::<ScrobbleRequest>(json);
        assert!(result.is_ok(), "Failed to parse JSON: {:?}", result.err());
    }

    #[test]
    fn test_deezer_scrobble_request() {
        let json = r#"
      {
  "eventName": "nowplaying",
  "time": 1747899797294,
  "data": {
    "song": {
        "parsed": {
          "track": "Exile Is A Habit",
          "artist": "Fox Stevenson",
          "albumArtist": null,
          "album": "Sunk Cost Fallacy",
          "duration": 261,
          "uniqueID": "3382194151",
          "currentTime": null,
          "isPlaying": true,
          "trackArt": "https://cdn-images.dzcdn.net/images/cover/f8f25df28395fcc1b036982ad1475737/500x500.jpg",
          "isPodcast": false,
          "originUrl": "https://www.deezer.com/en/album/761728451",
          "scrobblingDisallowedReason": null
        },
        "processed": {
          "track": "Exile Is A Habit",
          "artist": "Fox Stevenson",
          "albumArtist": null,
          "album": "Sunk Cost Fallacy",
          "duration": 258
        },
        "noRegex": {
          "track": "Exile Is A Habit",
          "artist": "Fox Stevenson",
          "albumArtist": null,
          "album": "Sunk Cost Fallacy",
          "duration": null
        },
        "flags": {
          "isScrobbled": false,
          "isCorrectedByUser": false,
          "isRegexEditedByUser": {
            "track": false,
            "artist": false,
            "album": false,
            "albumArtist": false
          },
          "isAlbumFetched": false,
          "isValid": true,
          "isMarkedAsPlaying": false,
          "isSkipped": false,
          "isReplaying": false,
          "hasBlockedTag": false,
          "isLovedInService": null,
          "finishedProcessing": true
        },
        "metadata": {
          "startTimestamp": 1754673593,
          "label": "Deezer",
          "trackArtUrl": "https://lastfm.freetls.fastly.net/i/u/300x300/b3eee782a80469085b2105fc63f0e534.png",
          "artistUrl": "https://www.last.fm/music/Fox+Stevenson",
          "trackUrl": "https://www.last.fm/music/Fox+Stevenson/_/Exile+Is+A+Habit",
          "albumUrl": "https://www.last.fm/music/Fox+Stevenson/Exile+Is+A+Habit",
          "userPlayCount": 0
        },
        "connector": {
          "label": "Deezer",
          "matches": [
            "*://www.deezer.com/*"
          ],
          "js": "deezer.js",
          "id": "deezer"
        },
      "controllerTabId": 2105807456
    }
  }
}
      "#;

        let result = serde_json::from_str::<ScrobbleRequest>(json);
        assert!(result.is_ok(), "Failed to parse JSON: {:?}", result.err());
    }
}
