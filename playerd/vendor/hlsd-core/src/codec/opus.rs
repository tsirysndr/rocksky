//! Opus encoder backed by `audiopus` (vendored libopus, built with `cc`).
//!
//! Opus only accepts a handful of sample rates; hlsd requires 48 kHz input for
//! this codec. Frames are 20 ms (960 samples/channel) and are wrapped in fMP4
//! via an `Opus`/`dOps` sample entry.

use anyhow::{Result, anyhow};
use audiopus::coder::Encoder as Opus;
use audiopus::{Application, Bitrate, Channels, SampleRate};

use super::{AudioEncoder, Packet, SampleEntry};
use crate::boxes::{Buf, mp4_box};

/// 20 ms at 48 kHz.
const FRAME_LEN: usize = 960;

pub struct OpusEncoder {
    enc: Opus,
    channels: u16,
    frame_samples: usize, // 960 * channels
    buf: Vec<i16>,
    scratch: Vec<u8>,
}

impl OpusEncoder {
    pub fn new(sample_rate: u32, channels: u16, bitrate: u32) -> Result<Self> {
        if sample_rate != 48_000 {
            return Err(anyhow!(
                "Opus requires 48000 Hz input (got {sample_rate}); feed 48 kHz PCM or pick another codec"
            ));
        }
        let ch = match channels {
            1 => Channels::Mono,
            2 => Channels::Stereo,
            n => return Err(anyhow!("Opus supports 1 or 2 channels, got {n}")),
        };
        let mut enc = Opus::new(SampleRate::Hz48000, ch, Application::Audio)
            .map_err(|e| anyhow!("initializing Opus encoder: {e}"))?;
        enc.set_bitrate(Bitrate::BitsPerSecond(bitrate as i32))
            .map_err(|e| anyhow!("setting Opus bitrate: {e}"))?;
        Ok(Self {
            enc,
            channels,
            frame_samples: FRAME_LEN * channels as usize,
            buf: Vec::new(),
            scratch: vec![0u8; 4000],
        })
    }

    fn encode_one(&mut self, frame: &[i16]) -> Result<Packet> {
        let n = self
            .enc
            .encode(frame, &mut self.scratch)
            .map_err(|e| anyhow!("Opus encode: {e}"))?;
        Ok(Packet {
            data: self.scratch[..n].to_vec(),
            sample_count: FRAME_LEN as u32,
        })
    }
}

impl AudioEncoder for OpusEncoder {
    fn encode(&mut self, interleaved: &[i16]) -> Result<Vec<Packet>> {
        self.buf.extend_from_slice(interleaved);
        let mut packets = Vec::new();
        while self.buf.len() >= self.frame_samples {
            let frame: Vec<i16> = self.buf.drain(0..self.frame_samples).collect();
            packets.push(self.encode_one(&frame)?);
        }
        Ok(packets)
    }

    fn flush(&mut self) -> Result<Vec<Packet>> {
        if self.buf.is_empty() {
            return Ok(Vec::new());
        }
        // Zero-pad the final partial frame to a whole 20 ms block.
        let mut frame: Vec<i16> = std::mem::take(&mut self.buf);
        frame.resize(self.frame_samples, 0);
        Ok(vec![self.encode_one(&frame)?])
    }

    fn sample_entry(&self) -> SampleEntry {
        SampleEntry {
            fourcc: *b"Opus",
            config_boxes: self.dops_box(),
            channels: self.channels,
            sample_rate: 48_000,
            sample_size: 16,
        }
    }

    fn rfc6381_codec(&self) -> String {
        "opus".to_string()
    }

    fn name(&self) -> &'static str {
        "Opus"
    }
}

impl OpusEncoder {
    /// `dOps` (OpusSpecificBox). All multi-byte fields are big-endian here
    /// (unlike the little-endian Ogg `OpusHead`).
    fn dops_box(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.u8(0) // Version
            .u8(self.channels as u8) // OutputChannelCount
            .u16(0) // PreSkip: 0 so no real audio is trimmed at start
            .u32(48_000) // InputSampleRate
            .u16(0) // OutputGain (Q7.8, signed) = 0
            .u8(0); // ChannelMappingFamily = 0 (mono/stereo)
        mp4_box(b"dOps", &b.take())
    }
}
