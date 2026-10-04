# rockbox-playback 0.7.0

Vendored from the published crates.io package (GPL-2.0-or-later).
The mobile app patches `Engine::remove_track` to publish the changed current
index after removing a preceding track. Upstream only publishes that index
when installing a decoder, so removing history made status point at the wrong
song until the next track. The regression test covers paused playback and
preservation of the current position. The app also preloads the next finite HTTP track into a temporary disk cache
at 50% playback. Explicit Play next insertions start preloading immediately,
including while paused. Replacing the next track cancels obsolete work between
512 KiB requests; preload HTTP requests have a 30-second timeout. The engine
reuses the cached file for gapless transitions and crossfades. Queue changes
are checked by URL before reuse, and failed/incomplete preloads fall back to
the existing streaming path. Automatic preloading waits for a known duration; explicit Play next can preload
a finite file even before duration is known. Live streams are not preloaded.
Remove this vendor override once upstream contains these fixes.
