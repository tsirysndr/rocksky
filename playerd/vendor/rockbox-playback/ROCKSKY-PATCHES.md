Vendored from crates.io rockbox-playback 0.9.0 (GPL-2.0-or-later).

Local patch: publish the actual next automatic track through `Player::next_track()`.
The playback engine computes this from its private shuffle order and repeat mode;
playerd uses it for waveform prefetching without changing queue or transport.
Android carries the same patch in its own 0.9.0 vendor copy.

MP4 handling: 0.9.0 upstream grew its own header-window metadata recovery
(extending past a large ID3v2 tag, walking the atom chain to the `moov` box,
and a tail fallback). That path is kept for every other container; only
`m4a`/`mp4`/`m4b` are routed to the complete-cache native `Decoder::open`,
which is what HE-AAC SBR seek correction and gapless trim require.

Pipeline lock: `rockbox_dsp::Dsp` is a handle to one static `dsp_config`, and
the C tone stage keeps its gains in file-scope globals (upstream Rockbox does
this deliberately, so tone controls apply to every stream like hardware ones).
Building a `Dsp` also issues `DSP_RESET`. A local `lock_pipeline()` serializes
`Engine::new` against anything measuring those settings; without it the fork's
own `Engine`-building tests cleared the prescale the tone test was measuring,
and that test failed under parallel `cargo test`. Upstream now carries this as
`rockbox_dsp::lock_pipeline()` — drop the local copy once a rockbox-dsp release
exposes it.

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
