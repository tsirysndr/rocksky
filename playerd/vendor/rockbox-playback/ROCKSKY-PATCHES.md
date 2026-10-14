Vendored from crates.io rockbox-playback 0.6.0 (GPL-2.0-or-later).

Local patch: publish the actual next automatic track through `Player::next_track()`.
The playback engine computes this from its private shuffle order and repeat mode;
playerd uses it for waveform prefetching without changing queue or transport.
Android carries the same patch in its existing 0.7.0 vendor copy.

HTTP recovery: retry interrupted finite range reads, validate range boundaries and
body length, and handle a server switching from 206 to 200 without corrupting the
cache. Decoder exits before the advertised duration now produce diagnostics.

Gapless HTTP handoff: prefetch the next automatic track's compressed data on
a background worker while the current decoder continues feeding the output
buffer. Reuse the prepared source for automatic and manual transitions,
including M4A files that require a complete cache before opening. Select the
target through the engine's shuffle/repeat order and refresh it during queue
edits. Only one prefetch runs at a time; stale results are discarded, requests
have timeouts, and failures fall back to normal loading. No concurrent Rockbox
decoder is opened. Live/adaptive streams retain their existing loading path.

The socket-output regression captures PCM across a deliberately slow HTTP
handoff and compares it with local playback for WAV and HE-AAC. Prefetch removes
loading-induced silence; it does not trim silence or codec padding in the
source, and a download that cannot finish in time can still exhaust the buffer.
