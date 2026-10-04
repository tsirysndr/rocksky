# rockbox-playback 0.7.0

Vendored from the published crates.io package (GPL-2.0-or-later).
The mobile app patches `Engine::remove_track` to publish the changed current
index after removing a preceding track. Upstream only publishes that index
when installing a decoder, so removing history made status point at the wrong
song until the next track. The regression test covers paused playback and
preservation of the current position. The app also preloads the next finite HTTP track into a temporary disk cache
at 50% playback. A single background worker downloads the file; the engine
reuses it for both automatic gapless transitions and crossfades. Queue changes
are checked by URL before reuse, and failed/incomplete preloads fall back to
the existing streaming path. Unknown-duration/live streams are not preloaded.
Remove this vendor override once upstream contains these fixes.
