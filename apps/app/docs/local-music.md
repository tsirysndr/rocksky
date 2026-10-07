# Local music on Android

Open **Library → Local music → Scan music**, then grant music/audio access.
The Android job scans MediaStore audio in the background and maintains an
incremental SQLite library. It checks periodically after the initial scan;
Android may defer this maintenance during Doze. **Rescan music** is always
available and rereads every file's tags and artwork, preserving manual edits,
favorites and playlists. If a scan is running, it queues one fresh pass.
Ringtones, alarms and notification sounds are excluded.

Embedded metadata comes from `rockbox-metadata` and `lofty`, including decoded
cover artwork, track/disc numbers, dates, genre, composer, MusicBrainz IDs,
audio properties, ReplayGain and additional text tags. Filenames and unknown
labels are display fallbacks only. Playback requires a readable supported audio
file, not complete tags; scrobbling requires a real title, artist, album and
duration. Album artist may fall back to artist, and artwork is optional.

The Local music tabs provide tracks, albums, artists, playlists and favorites.
Track menus offer Play next and Add to queue; these share the existing uploaded
music queue. Local playlists and favorites remain on the device. Edits are
SQLite overrides, preserved through rescans without rewriting original files.

## Edit and identify selected tracks

Open a track's **⋯ → Edit / identify this track**. Edit manually, search
MusicBrainz, or request identification by audio. Identification fingerprints at
most the opening 120 seconds locally with Symphonia and `rusty-chromaprint`,
queries AcoustID, and presents MusicBrainz release candidates for review.
Choose a suggestion to retrieve extra metadata through Rocksky's
`app.rocksky.song.matchSong`. Cover Art Archive supplies front artwork for the
chosen MusicBrainz release, with Rocksky artwork as a fallback. Release mismatches are not
used to replace the selected album's artwork or track/disc/year fields. You can
also use **Find cover & extra metadata** with manually entered title/artist/album.
Review the cover and fields, then press **Save metadata** to apply them.

For several tracks, tap **Select**, choose tracks, then **Identify selected**.
The app deduplicates the selection and processes one track at a time, with
progress, per-track errors and a stop control. **Keep browsing** hides the
progress screen; its banner brings it back. Results are reviewed individually;
identification never saves suggestions automatically. Leaving the Local music
screen cancels remaining work, and results are held in memory for that screen.

**Identification only runs after an explicit user action.** Scans, rescans,
playback and periodic maintenance never start it. The selected-track queue and
individual searches use the same serialized request lane: at least 1.1 seconds
between request starts, including Rocksky and cover metadata requests. HTTP 429
and 503 responses honor `Retry-After` (seconds or HTTP date), with exponential
backoff and at most three attempts. Cancelling prevents the next track or
request from starting; an in-progress native fingerprint finishes locally.
Only fingerprints and durations are sent to AcoustID, not audio files. Search
sends the entered query to MusicBrainz. Failed/empty lookups do not edit tracks.

Set `ACOUSTIC_ID_API_KEY` in the app's build environment to the AcoustID
**application** client key. `app.config.js` exposes that client identifier to
the app; do not use a personal submission key. `EXPO_PUBLIC_ACOUSTID_API_KEY`
is supported as a fallback. No secret value belongs in source control.

Native rebuild required (not Expo Go or an OTA-only update). iOS device
scanning is not implemented. Android native file access follows the
[shared media API guidance](https://developer.android.com/training/data-storage/shared/media).
Identification uses the [AcoustID lookup API](https://acoustid.org/webservice)
and [MusicBrainz recording API](https://musicbrainz.org/doc/MusicBrainz_API).

Validation: app typecheck, Rust fixture tests, Android SQLite tests, and Bun
tests for incomplete metadata, selected-track identification, rate limiting,
cover matching, and queue persistence.
On a device, also check permission denial/revocation, a rescan after changing
files, locked-screen playback, mixed queues, editing a playing track, and
AcoustID matches with real music.

## Upload and search

Local track and album context menus offer Upload. Every selected album track must have complete metadata; unsupported upload formats are disabled. The queue prepares one private file copy at a time, embeds the current SQLite metadata and cover, uploads it, then removes the copy. Original audio files stay unchanged. For signed-out users, Upload opens Sign In. Once signed in, metadata validation controls whether Upload is enabled.

Search includes on-device tracks by title, artist, album, genre and filename, including when signed out. Tap a local result to play it.
