//! AAC-LC encoder backed by `fdk-aac` (vendored C, built with `cc`).
//! Emits raw AAC access units wrapped in fMP4 via an `mp4a`/`esds` sample entry.

use anyhow::{Result, anyhow};
use fdk_aac::enc::{
    AudioObjectType, BitRate, ChannelMode, Encoder as Fdk, EncoderParams, Transport,
};

use super::{AudioEncoder, Packet, SampleEntry, aac_lc_asc, esds_box};

/// AAC-LC always uses 1024 samples per frame.
const FRAME_LEN: usize = 1024;

pub struct AacEncoder {
    enc: Fdk,
    sample_rate: u32,
    channels: u16,
    bitrate: u32,
    frame_samples: usize, // 1024 * channels
    buf: Vec<i16>,
    scratch: Vec<u8>,
}

impl AacEncoder {
    pub fn new(sample_rate: u32, channels: u16, bitrate: u32) -> Result<Self> {
        let channel_mode = match channels {
            1 => ChannelMode::Mono,
            2 => ChannelMode::Stereo,
            n => return Err(anyhow!("AAC supports 1 or 2 channels, got {n}")),
        };
        let enc = Fdk::new(EncoderParams {
            bit_rate: BitRate::Cbr(bitrate),
            sample_rate,
            transport: Transport::Raw,
            channels: channel_mode,
            audio_object_type: AudioObjectType::Mpeg4LowComplexity,
        })
        .map_err(|e| anyhow!("initializing AAC encoder: {e:?}"))?;
        Ok(Self {
            enc,
            sample_rate,
            channels,
            bitrate,
            frame_samples: FRAME_LEN * channels as usize,
            buf: Vec::new(),
            scratch: vec![0u8; 8192],
        })
    }

    fn drain_frame(&mut self, input: &[i16]) -> Result<Option<Packet>> {
        let info = self
            .enc
            .encode(input, &mut self.scratch)
            .map_err(|e| anyhow!("AAC encode: {e:?}"))?;
        let consumed = info.input_consumed;
        // Remove consumed samples from the front of the buffer.
        if consumed > 0 {
            self.buf.drain(0..consumed.min(self.buf.len()));
        }
        if info.output_size > 0 {
            Ok(Some(Packet {
                data: self.scratch[..info.output_size].to_vec(),
                sample_count: FRAME_LEN as u32,
            }))
        } else {
            Ok(None)
        }
    }
}

impl AudioEncoder for AacEncoder {
    fn encode(&mut self, interleaved: &[i16]) -> Result<Vec<Packet>> {
        self.buf.extend_from_slice(interleaved);
        let mut packets = Vec::new();
        while self.buf.len() >= self.frame_samples {
            let before = self.buf.len();
            let frame: Vec<i16> = self.buf[..self.frame_samples].to_vec();
            if let Some(p) = self.drain_frame(&frame)? {
                packets.push(p);
            }
            if self.buf.len() == before {
                break; // no samples consumed — avoid spinning
            }
        }
        Ok(packets)
    }

    fn flush(&mut self) -> Result<Vec<Packet>> {
        let mut packets = Vec::new();
        // Encode any remaining whole/partial buffer, then drain encoder delay.
        if !self.buf.is_empty() {
            let frame: Vec<i16> = std::mem::take(&mut self.buf);
            if let Some(p) = self.drain_frame(&frame)? {
                packets.push(p);
            }
        }
        loop {
            match self.drain_frame(&[])? {
                Some(p) => packets.push(p),
                None => break,
            }
        }
        Ok(packets)
    }

    fn sample_entry(&self) -> SampleEntry {
        let asc = aac_lc_asc(self.sample_rate, self.channels);
        SampleEntry {
            fourcc: *b"mp4a",
            config_boxes: esds_box(0x40, self.bitrate, Some(&asc)),
            channels: self.channels,
            sample_rate: self.sample_rate,
            sample_size: 16,
        }
    }

    fn rfc6381_codec(&self) -> String {
        "mp4a.40.2".to_string()
    }

    fn name(&self) -> &'static str {
        "AAC-LC"
    }
}
