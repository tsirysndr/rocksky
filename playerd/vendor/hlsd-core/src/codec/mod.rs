//! Audio codec abstraction. Every encoder turns interleaved i16 PCM into a
//! sequence of self-contained frames (`Packet`s) plus an fMP4 sample-entry
//! description so the muxer can wrap them into CMAF segments.

use anyhow::Result;

use crate::config::{CodecKind, Config};

mod flac;

#[cfg(feature = "aac")]
mod aac;
#[cfg(feature = "mp3")]
mod mp3;
#[cfg(feature = "opus")]
mod opus;

/// One encoded, independently-muxable audio frame.
pub struct Packet {
    /// Raw codec frame bytes (no container framing).
    pub data: Vec<u8>,
    /// Number of PCM samples *per channel* this frame represents.
    pub sample_count: u32,
}

/// Everything the muxer needs to describe the audio track in the fMP4 `stsd`.
pub struct SampleEntry {
    /// Sample-entry FourCC, e.g. `mp4a`, `fLaC`, `Opus`.
    pub fourcc: [u8; 4],
    /// Codec-specific child boxes (already serialized), e.g. `esds`/`dfLa`/`dOps`.
    pub config_boxes: Vec<u8>,
    pub channels: u16,
    pub sample_rate: u32,
    pub sample_size: u16,
}

/// A streaming audio encoder.
pub trait AudioEncoder: Send {
    /// Feed interleaved i16 samples (channel-interleaved). Returns any whole
    /// frames that became available; partial trailing samples may be buffered.
    fn encode(&mut self, interleaved: &[i16]) -> Result<Vec<Packet>>;

    /// Flush any buffered samples as a final (possibly padded) frame.
    fn flush(&mut self) -> Result<Vec<Packet>>;

    /// fMP4 sample-entry description for this stream.
    fn sample_entry(&self) -> SampleEntry;

    /// RFC 6381 codec string for the HLS `CODECS` attribute / DASH `codecs`.
    fn rfc6381_codec(&self) -> String;

    /// Human-readable codec name.
    fn name(&self) -> &'static str;
}

/// Build the configured encoder, or fail with a helpful message when the codec
/// was not compiled in.
pub fn build(config: &Config) -> Result<Box<dyn AudioEncoder>> {
    let sr = config.input.sample_rate;
    let ch = config.input.channels;
    match config.encoder.codec {
        CodecKind::Flac => Ok(Box::new(flac::FlacEncoder::new(
            sr,
            ch,
            config.encoder.flac_compression,
        )?)),
        CodecKind::Aac => build_aac(config, sr, ch),
        CodecKind::Mp3 => build_mp3(config, sr, ch),
        CodecKind::Opus => build_opus(config, sr, ch),
    }
}

#[cfg(feature = "aac")]
fn build_aac(config: &Config, sr: u32, ch: u16) -> Result<Box<dyn AudioEncoder>> {
    Ok(Box::new(aac::AacEncoder::new(
        sr,
        ch,
        config.encoder.bitrate_bps()?,
    )?))
}
#[cfg(not(feature = "aac"))]
fn build_aac(_: &Config, _: u32, _: u16) -> Result<Box<dyn AudioEncoder>> {
    anyhow::bail!("codec 'aac' not compiled in — rebuild with `--features aac`")
}

#[cfg(feature = "mp3")]
fn build_mp3(config: &Config, sr: u32, ch: u16) -> Result<Box<dyn AudioEncoder>> {
    Ok(Box::new(mp3::Mp3Encoder::new(
        sr,
        ch,
        config.encoder.bitrate_bps()?,
    )?))
}
#[cfg(not(feature = "mp3"))]
fn build_mp3(_: &Config, _: u32, _: u16) -> Result<Box<dyn AudioEncoder>> {
    anyhow::bail!("codec 'mp3' not compiled in — rebuild with `--features mp3`")
}

#[cfg(feature = "opus")]
fn build_opus(config: &Config, sr: u32, ch: u16) -> Result<Box<dyn AudioEncoder>> {
    Ok(Box::new(opus::OpusEncoder::new(
        sr,
        ch,
        config.encoder.bitrate_bps()?,
    )?))
}
#[cfg(not(feature = "opus"))]
fn build_opus(_: &Config, _: u32, _: u16) -> Result<Box<dyn AudioEncoder>> {
    anyhow::bail!("codec 'opus' not compiled in — rebuild with `--features opus`")
}

// ---------------------------------------------------------------------------
// Shared MPEG-4 descriptor helpers (used by AAC and MP3 sample entries).
// ---------------------------------------------------------------------------

/// The MPEG-4 sampling-frequency index for common rates, or `None` if the rate
/// must be signalled explicitly.
#[cfg(any(feature = "aac", feature = "mp3"))]
pub(crate) fn sampling_frequency_index(sample_rate: u32) -> Option<u8> {
    const TABLE: [(u32, u8); 13] = [
        (96_000, 0),
        (88_200, 1),
        (64_000, 2),
        (48_000, 3),
        (44_100, 4),
        (32_000, 5),
        (24_000, 6),
        (22_050, 7),
        (16_000, 8),
        (12_000, 9),
        (11_025, 10),
        (8_000, 11),
        (7_350, 12),
    ];
    TABLE
        .iter()
        .find(|(r, _)| *r == sample_rate)
        .map(|(_, i)| *i)
}

/// Encode an MPEG-4 descriptor: `tag(1) + length(1) + payload`. Our descriptors
/// are all well under 128 bytes, so a single length byte is sufficient.
#[cfg(any(feature = "aac", feature = "mp3"))]
fn descriptor(tag: u8, payload: &[u8]) -> Vec<u8> {
    assert!(payload.len() < 128, "descriptor too long for 1-byte length");
    let mut out = Vec::with_capacity(2 + payload.len());
    out.push(tag);
    out.push(payload.len() as u8);
    out.extend_from_slice(payload);
    out
}

/// Build an `esds` full box wrapping an ES_Descriptor for the given object type
/// and optional DecoderSpecificInfo (AudioSpecificConfig for AAC; none for MP3).
#[cfg(any(feature = "aac", feature = "mp3"))]
pub(crate) fn esds_box(
    object_type_indication: u8,
    avg_bitrate: u32,
    dsi: Option<&[u8]>,
) -> Vec<u8> {
    use crate::boxes::{Buf, full_box};

    // DecoderConfigDescriptor (tag 0x04).
    let mut dcd = Buf::new();
    dcd.u8(object_type_indication)
        .u8((0x05 << 2) | 0x01) // streamType=audio(0x05), upStream=0, reserved=1
        .u8(0)
        .u16(0) // bufferSizeDB (24 bits) = 0
        .u32(avg_bitrate) // maxBitrate
        .u32(avg_bitrate); // avgBitrate
    if let Some(dsi) = dsi {
        // DecoderSpecificInfo (tag 0x05).
        dcd.bytes(&descriptor(0x05, dsi));
    }
    let dcd = descriptor(0x04, &dcd.take());

    // SLConfigDescriptor (tag 0x06): predefined = MP4 (0x02).
    let sl = descriptor(0x06, &[0x02]);

    // ES_Descriptor (tag 0x03): ES_ID(2)=0, flags(1)=0, then DCD + SL.
    let mut es = Buf::new();
    es.u16(0).u8(0).bytes(&dcd).bytes(&sl);
    let es = descriptor(0x03, &es.take());

    full_box(b"esds", 0, 0, &es)
}

/// Build the 2-byte AudioSpecificConfig for AAC-LC at the given rate/channels.
#[cfg(feature = "aac")]
pub(crate) fn aac_lc_asc(sample_rate: u32, channels: u16) -> Vec<u8> {
    // audioObjectType=2 (AAC LC), 5 bits; samplingFrequencyIndex 4 bits;
    // channelConfiguration 4 bits; GASpecificConfig 3 bits (all zero).
    let freq_index = sampling_frequency_index(sample_rate).unwrap_or(0x0F);
    let aot: u16 = 2;
    let chan = channels as u16;
    let bits: u16 = (aot << 11) | ((freq_index as u16) << 7) | (chan << 3);
    bits.to_be_bytes().to_vec()
}
