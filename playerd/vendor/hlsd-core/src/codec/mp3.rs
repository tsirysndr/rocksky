//! MP3 encoder backed by `mp3lame-encoder` (vendored LAME, built with `cc`).
//!
//! LAME emits a raw MP3 byte stream; for fMP4 we split it into individual MPEG
//! audio frames (each a decodable sample) and describe the track with an
//! `mp4a`/`esds` sample entry using object type 0x6B (MPEG-1 audio).

use anyhow::{Result, anyhow};
use mp3lame_encoder::{Bitrate, Builder, FlushNoGap, InterleavedPcm, Mode, Quality};

use super::{AudioEncoder, Packet, SampleEntry, esds_box};

pub struct Mp3Encoder {
    enc: mp3lame_encoder::Encoder,
    sample_rate: u32,
    channels: u16,
    bitrate: u32,
    /// Undelimited MP3 bytes awaiting frame splitting.
    pending: Vec<u8>,
}

impl Mp3Encoder {
    pub fn new(sample_rate: u32, channels: u16, bitrate: u32) -> Result<Self> {
        let mut builder = Builder::new().ok_or_else(|| anyhow!("allocating LAME encoder"))?;
        builder
            .set_num_channels(channels as u8)
            .map_err(|e| anyhow!("LAME channels: {e:?}"))?;
        builder
            .set_sample_rate(sample_rate)
            .map_err(|e| anyhow!("LAME sample rate: {e:?}"))?;
        builder
            .set_brate(nearest_bitrate(bitrate))
            .map_err(|e| anyhow!("LAME bitrate: {e:?}"))?;
        builder
            .set_quality(Quality::Good)
            .map_err(|e| anyhow!("LAME quality: {e:?}"))?;
        let mode = if channels == 1 {
            Mode::Mono
        } else {
            Mode::JointStereo
        };
        builder
            .set_mode(mode)
            .map_err(|e| anyhow!("LAME mode: {e:?}"))?;
        let enc = builder
            .build()
            .map_err(|e| anyhow!("building LAME encoder: {e:?}"))?;
        Ok(Self {
            enc,
            sample_rate,
            channels,
            bitrate,
            pending: Vec::new(),
        })
    }

    /// Split complete MPEG audio frames out of `pending`, leaving any partial
    /// trailing frame buffered.
    fn split_frames(&mut self) -> Vec<Packet> {
        let mut packets = Vec::new();
        let mut pos = 0usize;
        let buf = &self.pending;
        while pos + 4 <= buf.len() {
            // Resync to a frame header.
            if !(buf[pos] == 0xFF && (buf[pos + 1] & 0xE0) == 0xE0) {
                pos += 1;
                continue;
            }
            let Some((len, samples)) = frame_info(&buf[pos..pos + 4]) else {
                pos += 1;
                continue;
            };
            if pos + len > buf.len() {
                break; // incomplete frame; wait for more bytes
            }
            packets.push(Packet {
                data: buf[pos..pos + len].to_vec(),
                sample_count: samples,
            });
            pos += len;
        }
        self.pending.drain(0..pos);
        packets
    }
}

impl AudioEncoder for Mp3Encoder {
    fn encode(&mut self, interleaved: &[i16]) -> Result<Vec<Packet>> {
        let max_out = interleaved.len() / self.channels.max(1) as usize * 5 / 4 + 7200;
        let mut out: Vec<u8> = Vec::with_capacity(max_out);
        let n = self
            .enc
            .encode(InterleavedPcm(interleaved), out.spare_capacity_mut())
            .map_err(|e| anyhow!("MP3 encode: {e:?}"))?;
        unsafe { out.set_len(n) };
        self.pending.extend_from_slice(&out);
        Ok(self.split_frames())
    }

    fn flush(&mut self) -> Result<Vec<Packet>> {
        let mut out: Vec<u8> = Vec::with_capacity(7200);
        let n = self
            .enc
            .flush::<FlushNoGap>(out.spare_capacity_mut())
            .map_err(|e| anyhow!("MP3 flush: {e:?}"))?;
        unsafe { out.set_len(n) };
        self.pending.extend_from_slice(&out);
        Ok(self.split_frames())
    }

    fn sample_entry(&self) -> SampleEntry {
        SampleEntry {
            fourcc: *b"mp4a",
            // Object type 0x6B = MPEG-1 Audio (MP3); no DecoderSpecificInfo.
            config_boxes: esds_box(0x6B, self.bitrate, None),
            channels: self.channels,
            sample_rate: self.sample_rate,
            sample_size: 16,
        }
    }

    fn rfc6381_codec(&self) -> String {
        "mp4a.6B".to_string()
    }

    fn name(&self) -> &'static str {
        "MP3"
    }
}

/// Map a target bitrate (bits/s) to the nearest LAME CBR bitrate.
fn nearest_bitrate(bps: u32) -> Bitrate {
    let kbps = bps / 1000;
    let table = [
        (8, Bitrate::Kbps8),
        (16, Bitrate::Kbps16),
        (24, Bitrate::Kbps24),
        (32, Bitrate::Kbps32),
        (40, Bitrate::Kbps40),
        (48, Bitrate::Kbps48),
        (64, Bitrate::Kbps64),
        (80, Bitrate::Kbps80),
        (96, Bitrate::Kbps96),
        (112, Bitrate::Kbps112),
        (128, Bitrate::Kbps128),
        (160, Bitrate::Kbps160),
        (192, Bitrate::Kbps192),
        (224, Bitrate::Kbps224),
        (256, Bitrate::Kbps256),
        (320, Bitrate::Kbps320),
    ];
    table
        .iter()
        .min_by_key(|(k, _)| (*k as i64 - kbps as i64).abs())
        .map(|(_, b)| *b)
        .unwrap_or(Bitrate::Kbps128)
}

/// Parse an MPEG audio frame header, returning `(frame_len_bytes, samples)`.
fn frame_info(h: &[u8]) -> Option<(usize, u32)> {
    if h.len() < 4 || h[0] != 0xFF || (h[1] & 0xE0) != 0xE0 {
        return None;
    }
    let version_bits = (h[1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    let layer_bits = (h[1] >> 1) & 0x03; // 1 = Layer III
    if layer_bits != 0b01 {
        return None; // only Layer III
    }
    let bitrate_index = (h[2] >> 4) & 0x0F;
    let samplerate_index = (h[2] >> 2) & 0x03;
    let padding = ((h[2] >> 1) & 0x01) as usize;
    if bitrate_index == 0 || bitrate_index == 0x0F || samplerate_index == 0x03 {
        return None;
    }

    let mpeg1 = version_bits == 0b11;
    let bitrate_kbps = if mpeg1 {
        const T: [u32; 15] = [
            0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
        ];
        T[bitrate_index as usize]
    } else {
        const T: [u32; 15] = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
        T[bitrate_index as usize]
    };
    let sample_rate = match (version_bits, samplerate_index) {
        (0b11, i) => [44100, 48000, 32000][i as usize],
        (0b10, i) => [22050, 24000, 16000][i as usize],
        (0b00, i) => [11025, 12000, 8000][i as usize],
        _ => return None,
    };
    let samples_per_frame: u32 = if mpeg1 { 1152 } else { 576 };
    let bitrate = bitrate_kbps * 1000;
    let coef = if mpeg1 { 144 } else { 72 };
    let len = (coef * bitrate as usize / sample_rate as usize) + padding;
    if len < 4 {
        return None;
    }
    Some((len, samples_per_frame))
}
