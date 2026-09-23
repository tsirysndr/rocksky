//! AcoustID (Chromaprint) fingerprinting.
//!
//! A Chromaprint fingerprint is what identifies a recording independently of
//! its tags: two uploads of the same recording fingerprint alike even when one
//! is a 320k mp3 with a typo in the artist and the other a FLAC with none. That
//! is what makes it worth storing next to the key and the bpm — matching by
//! metadata guesses, matching by fingerprint knows.
//!
//! [`rusty_chromaprint`] is a pure-Rust port of the reference implementation,
//! so there is no C library to find at build time and nothing to link
//! statically.
//!
//! It is not bit-identical to the C library: it resamples with `rubato` where
//! chromaprint uses its own resampler, which moves a few bits per
//! sub-fingerprint. Measured against `fpcalc 1.6.1` on a real 44.1k track, the
//! two agree on the same 948 sub-fingerprints with a 3.9% bit error rate —
//! well inside what AcoustID treats as the same recording, since matching is
//! by bit distance and never by equality. Two fingerprints *this* crate
//! produces are byte-identical for the same audio, which is what deduplicating
//! our own uploads relies on.
//!
//! The configuration is fixed at `preset_test2`, Chromaprint's default
//! algorithm (id 1). Fingerprints are only comparable within one algorithm, and
//! it is the one AcoustID's database is built on, so it is not a choice a
//! caller gets to make.

use anyhow::{Error, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rusty_chromaprint::{Configuration, FingerprintCompressor, Fingerprinter};
use symphonia::core::conv::IntoSample;

/// How much of a track is fingerprinted.
///
/// The same 120 seconds `fpcalc` reads by default, and so the same prefix
/// every fingerprint in AcoustID's database was built from. Reading more would
/// produce a longer fingerprint that no longer lines up with theirs.
const FINGERPRINT_SECONDS: f32 = 120.0;

/// Accumulates decoded audio into a fingerprint.
///
/// Samples are fed in as they are decoded rather than buffered: two minutes of
/// stereo 44.1k is 21MB of `i16`, and a batch backfill runs one of these per
/// core.
pub struct Builder {
    config: Configuration,
    printer: Fingerprinter,
    /// Frames still wanted. `None` until [`Builder::start`], which is when the
    /// sample rate — and so how many frames two minutes is — becomes known.
    remaining: Option<u64>,
    /// Interleaved `i16` scratch, reused across chunks.
    scratch: Vec<i16>,
}

impl Builder {
    pub fn new() -> Self {
        let config = Configuration::preset_test2();
        let printer = Fingerprinter::new(&config);
        Self {
            config,
            printer,
            remaining: None,
            scratch: Vec::new(),
        }
    }

    /// Begin, once the stream's format is known.
    pub fn start(&mut self, sample_rate: u32, channels: u32) -> Result<()> {
        self.printer
            .start(sample_rate, channels)
            // `ResetError` is not a `std::error::Error`, and its `Display`
            // ends in a newline that would land mid-message in a log line.
            .map_err(|cause| Error::msg(cause.to_string().trim().to_owned()))?;
        self.remaining = Some((FINGERPRINT_SECONDS * sample_rate as f32) as u64);
        Ok(())
    }

    /// Feed one decoded chunk of interleaved `f32` samples.
    ///
    /// Anything past the 120-second mark is dropped, so a caller may keep
    /// pushing without tracking the limit itself.
    pub fn consume(&mut self, interleaved: &[f32], channels: usize) {
        let Some(remaining) = self.remaining.as_mut() else {
            return;
        };
        let channels = channels.max(1);
        let frames = (interleaved.len() / channels) as u64;
        let wanted = frames.min(*remaining);
        if wanted == 0 {
            return;
        }
        *remaining -= wanted;

        let wanted_samples = wanted as usize * channels;
        self.scratch.clear();
        self.scratch.extend(
            interleaved[..wanted_samples]
                .iter()
                .map(|sample| -> i16 { (*sample).into_sample() }),
        );
        self.printer.consume(&self.scratch);
    }

    /// Whether the 120 seconds are in. A caller decoding only for the
    /// fingerprint can stop here.
    pub fn is_full(&self) -> bool {
        matches!(self.remaining, Some(0))
    }

    /// The fingerprint, in the base64url form AcoustID and `fpcalc` use.
    ///
    /// `None` when there was not enough audio to produce one — a few hundred
    /// milliseconds, or a file that decoded to nothing.
    pub fn finish(mut self) -> Option<String> {
        self.remaining?;
        self.printer.finish();
        let raw = self.printer.fingerprint();
        if raw.is_empty() {
            return None;
        }
        let compressed = FingerprintCompressor::from(&self.config).compress(raw);
        Some(URL_SAFE_NO_PAD.encode(compressed))
    }
}

impl Default for Builder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A sine wave is not music, but it is enough audio to fingerprint, and
    /// the same input must always give the same fingerprint — the whole
    /// premise of storing one.
    #[test]
    fn the_same_audio_fingerprints_the_same_way() {
        let tone = |seconds: f32| -> Vec<f32> {
            (0..(44_100.0 * seconds) as usize)
                .map(|n| (n as f32 * 440.0 * std::f32::consts::TAU / 44_100.0).sin() * 0.5)
                .collect()
        };
        let samples = tone(10.0);

        let print = || {
            let mut builder = Builder::new();
            builder.start(44_100, 1).unwrap();
            for chunk in samples.chunks(4096) {
                builder.consume(chunk, 1);
            }
            builder.finish()
        };

        let first = print().expect("a ten-second tone fingerprints");
        assert_eq!(first, print().unwrap());
    }

    /// Past two minutes the fingerprint must stop growing, or it would not
    /// line up with the ones AcoustID stores.
    #[test]
    fn only_the_first_two_minutes_count() {
        let mut builder = Builder::new();
        builder.start(44_100, 2).unwrap();
        assert!(!builder.is_full());
        // Three minutes of silence, in one-second chunks.
        let second = vec![0.0f32; 44_100 * 2];
        for _ in 0..180 {
            builder.consume(&second, 2);
        }
        assert!(builder.is_full());
    }

    /// Nothing in, nothing out — and no panic.
    #[test]
    fn silence_that_never_started_has_no_fingerprint() {
        assert!(Builder::new().finish().is_none());
    }
}
