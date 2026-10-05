# Android scrobbling

Account → Scrobbling controls the native Android listener. Scrobbling and newly
detected players are enabled by default. The user must sign in and grant Android
notification access; the normal notification permission only controls Rocksky's
ongoing service notification. Each supported/detected source has its own switch.

The Expo module is independent of the JavaScript runtime. An Android
`NotificationListenerService` observes authorized media sessions. An ongoing
`specialUse` foreground notification and a bounded partial wake lock during
playback support screen-off tracking. Rocksky (`app.rocksky`), Rocksky Test
(`app.rocksky.test`), and the current application package are always excluded.
The existing in-app player scrobbler is unchanged.

## Metadata and timing

- Reads title, artist, album, album artist, duration and playback state/position
  from Android media metadata. It does not scrape arbitrary notifications.
- Default: 50% of a track or 240 seconds of actual listening, whichever comes
  first; known durations below 30 seconds are excluded. Unknown duration uses
  the configured seconds. Pauses/buffering do not contribute listening time.
- Position mode intentionally allows seeking to the selected position to qualify.
  Changing metadata, pausing, and repeated notifications cannot multiply a listen.
  A return to the beginning from the end is treated as repeat playback.
- Album enrichment does not reset a listen. Because the current Rocksky API
  requires album and albumArtist, absent values fall back to title and artist
  respectively; the local detected-track UI preserves whether an album was known.
- Shazam/Auto Shazam and Audile use their recognition-result notification channels.
  Recognition results have no playback position and qualify immediately. Legacy
  Pixel Now Playing / Ambient Music Mod notifications wait 15 seconds and cancel
  if removed. Recognitions have a five-minute duplicate cooldown.
- Legacy Pixel titles support `by`, `par`, `von`, `de`, `di`, and `por` delimiters.
  Unsupported/ambiguous layouts are skipped. New Pixel Now Playing (March 2026
  onward) hides data on unmodified devices; this module does not add root/Xposed.

The timing defaults and known notification-channel formats were checked against
[Pano's preferences](https://github.com/kawaiiDango/pano-scrobbler/blob/main/composeApp/src/commonMain/kotlin/com/arn/scrobble/pref/MainPrefs.kt),
[notification listener](https://github.com/kawaiiDango/pano-scrobbler/blob/main/composeApp/src/androidMain/kotlin/com/arn/scrobble/media/NLService.kt),
and [FAQ](https://github.com/kawaiiDango/pano-scrobbler/blob/main/faq.md).
Implementation is independent; this is not a port of Pano's complete feature set.

## Offline queue and duplicate protection

SQLite in Android's no-backup directory stores account-scoped pending listens,
playback checkpoints, recognition cooldowns, and durable duplicate receipts.
The receipt key includes DID, normalized title/artist, and the original Unix
timestamp in seconds. Album and source are excluded so two apps cannot submit
the same listen twice. Queue insertion and its receipt commit atomically.
Receipts survive successful upload; a genuine replay at a different timestamp
gets a new identity. Checkpoints never count time when the process was absent.

The network-constrained, persisted `JobScheduler` job uploads without React
Native, retaining original timestamps. A periodic reconciliation job recovers
enqueue/completion races and pending work after reboot. Network/server errors
retry with exponential backoff. Unauthorized listens remain queued until sign-in;
invalid requests remain available for manual retry. Master-off suspends new
collection and uploads without deleting pending history; per-app switches stop
new collection. Saved history is only uploaded by its original account.

Native credentials are encrypted with Android Keystore AES-GCM. Logout cancels
jobs and removes credentials. A request already in flight can still complete.
Transport is at-least-once: after an ambiguous response, retries retain the same
timestamp and rely on the API's existing timestamp-window duplicate protection.
The API currently acknowledges ingestion before its asynchronous downstream
pipeline completes; the client cannot guarantee downstream publication on a 2xx.

## Validation

```sh
cd android
./gradlew :rocksky-scrobbler:testDebugUnitTest :rocksky-scrobbler:lintDebug
```

On a device, enable notification access and test:

1. Play Spotify/Tidal/Deezer: title/artist and any provided album appear in settings.
2. Pause/resume and seek forward: listening-time mode counts only played time.
3. Replay a track: one listen per qualifying playback; no duplicate on late album updates.
4. Disable one source and then the master switch: collection stops immediately.
5. Enable airplane mode, qualify tracks, close the screen, reconnect: queue drains
   with original times. Reboot with queued data and verify account-scoped recovery.
6. Repeat the same track/timestamp from multiple sources and restart: one receipt.
7. Sign out/in with another account: previous history must not upload to that account.
8. Play either Rocksky variant: neither appears as a source or creates extra listens.

Notification access, OEM battery restrictions, and Android force-stop remain
platform constraints. Allow unrestricted battery use on devices that suppress
background listeners. Permission revocation stops session access. A native build
is required; Expo Go cannot run the listener.
