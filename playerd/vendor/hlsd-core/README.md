# hlsd-core

Vendored from `../hlsd` 0.2.0 (https://github.com/tsirysndr/hlsd), under
its MIT license. Encoders, CMAF boxes/muxing, and playlist generation are
reused directly. The config is reduced to pipeline fields; playerd owns input,
HTTP serving and shutdown. The PCM reader limits each read to the remaining
segment size, preserving every sample across segment boundaries.
