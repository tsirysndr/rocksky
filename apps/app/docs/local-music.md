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

## Edit and identify one track

Open a track's **⋯ → Edit / identify this track**. Edit manually, search
MusicBrainz, or request identification by audio. Identification fingerprints at
most the opening 120 seconds locally with Symphonia and `rusty-chromaprint`,
queries AcoustID, and presents MusicBrainz release candidates for review.
Choose a suggestion and press **Save metadata** to apply it.

**Identification is only an explicit single-track action.** It never runs in
the scanner, in batches, on playback, or during automatic background work.
Concurrent identification is rejected. Only the fingerprint and duration are
sent to AcoustID; audio files are not uploaded. Search sends the entered query
to MusicBrainz. Failed or empty lookups leave the library unchanged.

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
tests for incomplete metadata, single-track identification, and queue persistence.
On a device, also check permission denial/revocation, a rescan after changing
files, locked-screen playback, mixed queues, editing a playing track, and
AcoustID matches with real music.
