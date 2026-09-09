//! One decode pass over a track, producing everything the analysis needs.
//!
//! Symphonia rather than the rockbox codecs the player itself uses: those keep
//! global codec state behind a process-wide gate, so a decode here would block
//! until the track being *played* finished — the exact opposite of analysing
//! the next track while the current one plays.
//!
//! The pass yields three things at once, because decoding is the expensive part
//! and doing it three times would be three times the cost:
//!
//! - interleaved frames fed straight to EBU R128 (never retained);
//! - a full-rate magnitude envelope, for the waveform and the music edges;
//! - a decimated mono signal, which is what the MIR detectors run on.

use anyhow::{anyhow, bail, Result};
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;

/// MIR detectors run on a decimated signal — tempo, mood and key all work off
/// onset/chroma features well below this rate, and it keeps a five-minute
/// track's mono buffer around 25 MB instead of 50 on a Raspberry-Pi-class box.
pub const MIR_RATE: u32 = 22_050;

/// Envelope resolution for the music-edge search: 20 ms is short enough to
/// place a fade start precisely and long enough to ignore a single click.
const ENVELOPE_HOP_MS: u64 = 20;

pub struct Decoded {
    pub sample_rate: u32,
    pub channels: u32,
    pub duration_ms: u64,
    /// EBU R128 state, already fed every frame.
    pub loudness: ebur128::EbuR128,
    /// Largest absolute sample seen, as a true-peak fallback.
    pub sample_peak: f64,
    /// Per-hop peak magnitude over the whole track, `ENVELOPE_HOP_MS` apart.
    pub envelope: Vec<f32>,
    pub envelope_hop_ms: u64,
    /// Mono signal at [`MIR_RATE`] (approximately — see `mir_rate`).
    pub mono: Vec<f32>,
    pub mir_rate: f32,
}

/// Decode `bytes` completely. `hint` is a file extension or MIME type when the
/// caller knows one; symphonia probes the container either way.
pub fn decode(bytes: Vec<u8>, hint: Option<&str>) -> Result<Decoded> {
    if bytes.is_empty() {
        bail!("empty audio");
    }
    let source = MediaSourceStream::new(
        Box::new(std::io::Cursor::new(bytes)),
        MediaSourceStreamOptions::default(),
    );

    let mut probe_hint = Hint::new();
    if let Some(hint) = hint.map(str::trim).filter(|h| !h.is_empty()) {
        if let Some(ext) = hint.rsplit('/').next() {
            probe_hint.with_extension(ext.trim_start_matches('.'));
        }
        if hint.contains('/') {
            probe_hint.mime_type(hint);
        }
    }

    let mut format = symphonia::default::get_probe()
        .probe(
            &probe_hint,
            source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|e| anyhow!("unsupported or corrupt audio: {e}"))?;

    let track = format
        .default_track(TrackType::Audio)
        .or_else(|| format.tracks().first())
        .ok_or_else(|| anyhow!("no audio track"))?;
    let track_id = track.id;
    let codec_params = track
        .codec_params
        .as_ref()
        .and_then(|p| p.audio())
        .ok_or_else(|| anyhow!("track carries no audio parameters"))?
        .clone();

    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(&codec_params, &AudioDecoderOptions::default())
        .map_err(|e| anyhow!("no decoder for this format: {e}"))?;

    let mut state: Option<PassState> = None;
    let mut samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            // A damaged packet mid-file is worth skipping; the analysis is
            // statistical and one dropped frame changes nothing.
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(SymphoniaError::ResetRequired) => break,
            Err(_) => break,
        };
        if packet.track_id != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(buf) => buf,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(SymphoniaError::ResetRequired) => break,
            Err(_) => break,
        };

        let spec = decoded.spec();
        let channels = spec.channels().count() as u32;
        let rate = spec.rate();
        if channels == 0 || rate == 0 {
            continue;
        }
        let state = match state.as_mut() {
            Some(state) => state,
            None => {
                let _ = state.insert(PassState::new(channels, rate)?);
                state.as_mut().expect("just inserted")
            }
        };
        // A mid-file spec change would invalidate the R128 state; every format
        // we play is fixed-spec, so treat it as the end of usable audio.
        if channels != state.channels || rate != state.rate {
            break;
        }

        decoded.copy_to_vec_interleaved(&mut samples);
        state.feed(&samples)?;
    }

    let Some(state) = state else {
        bail!("no decodable audio frames");
    };
    state.finish()
}

struct PassState {
    channels: u32,
    rate: u32,
    loudness: ebur128::EbuR128,
    sample_peak: f64,
    envelope: Vec<f32>,
    /// Frames per envelope hop, and the peak accumulated in the current hop.
    hop_frames: u64,
    hop_seen: u64,
    hop_peak: f32,
    /// Box-filter decimation towards [`MIR_RATE`].
    decim: u64,
    decim_seen: u64,
    decim_acc: f32,
    mono: Vec<f32>,
    frames: u64,
}

impl PassState {
    fn new(channels: u32, rate: u32) -> Result<Self> {
        let loudness = ebur128::EbuR128::new(
            channels,
            rate,
            ebur128::Mode::I | ebur128::Mode::TRUE_PEAK | ebur128::Mode::LRA,
        )
        .map_err(|e| anyhow!("loudness init failed ({channels} ch @ {rate} Hz): {e}"))?;
        Ok(PassState {
            channels,
            rate,
            loudness,
            sample_peak: 0.0,
            envelope: Vec::new(),
            hop_frames: (rate as u64 * ENVELOPE_HOP_MS / 1000).max(1),
            hop_seen: 0,
            hop_peak: 0.0,
            decim: ((rate as f64 / MIR_RATE as f64).round() as u64).max(1),
            decim_seen: 0,
            decim_acc: 0.0,
            mono: Vec::new(),
            frames: 0,
        })
    }

    fn feed(&mut self, interleaved: &[f32]) -> Result<()> {
        let channels = self.channels as usize;
        if interleaved.len() < channels {
            return Ok(());
        }
        self.loudness
            .add_frames_f32(interleaved)
            .map_err(|e| anyhow!("loudness pass failed: {e}"))?;

        for frame in interleaved.chunks_exact(channels) {
            let mut sum = 0.0f32;
            for &sample in frame {
                sum += sample;
                let magnitude = sample.abs() as f64;
                if magnitude.is_finite() && magnitude > self.sample_peak {
                    self.sample_peak = magnitude;
                }
            }
            let mono = sum / channels as f32;
            if !mono.is_finite() {
                continue;
            }

            let magnitude = mono.abs();
            if magnitude > self.hop_peak {
                self.hop_peak = magnitude;
            }
            self.hop_seen += 1;
            if self.hop_seen >= self.hop_frames {
                self.envelope.push(self.hop_peak);
                self.hop_peak = 0.0;
                self.hop_seen = 0;
            }

            self.decim_acc += mono;
            self.decim_seen += 1;
            if self.decim_seen >= self.decim {
                self.mono.push(self.decim_acc / self.decim as f32);
                self.decim_acc = 0.0;
                self.decim_seen = 0;
            }

            self.frames += 1;
        }
        Ok(())
    }

    fn finish(mut self) -> Result<Decoded> {
        if self.hop_seen > 0 {
            self.envelope.push(self.hop_peak);
        }
        if self.frames == 0 {
            bail!("no decodable audio frames");
        }
        Ok(Decoded {
            sample_rate: self.rate,
            channels: self.channels,
            duration_ms: self.frames * 1000 / self.rate as u64,
            loudness: self.loudness,
            sample_peak: self.sample_peak,
            envelope: self.envelope,
            envelope_hop_ms: ENVELOPE_HOP_MS,
            mir_rate: self.rate as f32 / self.decim as f32,
            mono: self.mono,
        })
    }
}
