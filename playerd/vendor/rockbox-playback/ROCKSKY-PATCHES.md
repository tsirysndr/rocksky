Vendored from crates.io rockbox-playback 0.6.0 (GPL-2.0-or-later).

Local patch: publish the actual next automatic track through `Player::next_track()`.
The playback engine computes this from its private shuffle order and repeat mode;
playerd uses it for waveform prefetching without changing queue or transport.
Android carries the same patch in its existing 0.7.0 vendor copy.

HTTP recovery: retry interrupted finite range reads, validate range boundaries and
body length, and handle a server switching from 206 to 200 without corrupting the
cache. Decoder exits before the advertised duration now produce diagnostics.
