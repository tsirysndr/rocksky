//! FLAC encoder backed by the pure-Rust `flacenc` crate. Always available.
//!
//! Each `encode()` call encodes the supplied PCM as one FLAC stream and emits
//! its frames (which are individually decodable and byte-aligned) as packets.
//! For fMP4 we advertise the codec via a `dfLa` box holding STREAMINFO.

use anyhow::{Result, anyhow};
use flacenc::bitsink::ByteSink;
use flacenc::component::BitRepr;
use flacenc::error::Verify;
use flacenc::source::MemSource;

use super::{AudioEncoder, Packet, SampleEntry};
use crate::boxes::{Buf, full_box};

pub struct FlacEncoder {
    sample_rate: u32,
    channels: u16,
    block_size: usize,
    config: flacenc::config::Encoder,
}

impl FlacEncoder {
    pub fn new(sample_rate: u32, channels: u16, compression: u8) -> Result<Self> {
        let block_size = 4096usize;
        let mut config = flacenc::config::Encoder::default();
        config.block_size = block_size;
        // Encode deterministically inside our own pipeline thread.
        config.multithread = false;
        // Map the 0..=8 level onto the LPC search: level 0 uses fixed predictors
        // only (fastest), higher levels raise the LPC order (smaller, slower).
        if compression == 0 {
            config.subframe_coding.use_lpc = false;
        } else {
            config.subframe_coding.qlpc.lpc_order = (compression as usize * 4).clamp(1, 32);
        }
        // Validate once up front so per-segment encodes can't fail on config.
        config
            .clone()
            .into_verified()
            .map_err(|(_, e)| anyhow!("invalid FLAC encoder config: {e:?}"))?;
        Ok(Self {
            sample_rate,
            channels,
            block_size,
            config,
        })
    }
}

impl AudioEncoder for FlacEncoder {
    fn encode(&mut self, interleaved: &[i16]) -> Result<Vec<Packet>> {
        if interleaved.is_empty() {
            return Ok(Vec::new());
        }
        let samples: Vec<i32> = interleaved.iter().map(|&s| s as i32).collect();
        let source = MemSource::from_samples(
            &samples,
            self.channels as usize,
            16,
            self.sample_rate as usize,
        );
        // Safe: config was validated in `new`.
        let config = self
            .config
            .clone()
            .into_verified()
            .map_err(|(_, e)| anyhow!("invalid FLAC encoder config: {e:?}"))?;
        let stream = flacenc::encode_with_fixed_block_size(&config, source, self.block_size)
            .map_err(|e| anyhow!("FLAC encode failed: {e:?}"))?;

        let total_samples = samples.len() / self.channels as usize;
        let frame_count = stream.frame_count();
        let mut packets = Vec::with_capacity(frame_count);
        for i in 0..frame_count {
            let frame = stream
                .frame(i)
                .ok_or_else(|| anyhow!("missing FLAC frame {i}"))?;
            let mut sink = ByteSink::new();
            frame
                .write(&mut sink)
                .map_err(|e| anyhow!("serializing FLAC frame: {e:?}"))?;
            let sample_count = if i + 1 < frame_count {
                self.block_size as u32
            } else {
                (total_samples - (frame_count - 1) * self.block_size) as u32
            };
            packets.push(Packet {
                data: sink.into_inner(),
                sample_count,
            });
        }
        Ok(packets)
    }

    fn flush(&mut self) -> Result<Vec<Packet>> {
        Ok(Vec::new())
    }

    fn sample_entry(&self) -> SampleEntry {
        SampleEntry {
            fourcc: *b"fLaC",
            config_boxes: self.dfla_box(),
            channels: self.channels,
            sample_rate: self.sample_rate,
            sample_size: 16,
        }
    }

    fn rfc6381_codec(&self) -> String {
        "fLaC".to_string()
    }

    fn name(&self) -> &'static str {
        "FLAC"
    }
}

impl FlacEncoder {
    /// `dfLa` box carrying a STREAMINFO metadata block (34-byte body).
    fn dfla_box(&self) -> Vec<u8> {
        let mut si = Buf::new();
        // min/max block size (16-bit each).
        si.u16(self.block_size as u16).u16(self.block_size as u16);
        // min/max frame size (24-bit each), 0 = unknown.
        si.u8(0).u16(0).u8(0).u16(0);
        // sample_rate (20 bits) | channels-1 (3 bits) | bps-1 (5 bits) | total_samples (36 bits)
        let sr = self.sample_rate & 0x0F_FFFF;
        let ch = (self.channels as u32 - 1) & 0x07;
        let bps = (16u32 - 1) & 0x1F;
        let packed: u64 = ((sr as u64) << 44) | ((ch as u64) << 41) | ((bps as u64) << 36);
        si.u64(packed); // total_samples = 0 (streaming, unknown)
        // MD5 signature: 16 zero bytes = disabled.
        si.zeros(16);
        let stream_info = si.take();
        debug_assert_eq!(stream_info.len(), 34);

        // FLAC metadata block: header byte (last-metadata-block=1, type=0) + 24-bit length.
        let mut block = Vec::with_capacity(4 + stream_info.len());
        block.push(0x80); // last block, type 0 (STREAMINFO)
        block.extend_from_slice(&(stream_info.len() as u32).to_be_bytes()[1..]);
        block.extend_from_slice(&stream_info);

        full_box(b"dfLa", 0, 0, &block)
    }
}
