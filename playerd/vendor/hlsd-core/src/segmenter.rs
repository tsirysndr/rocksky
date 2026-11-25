//! The live pipeline: read PCM, encode, mux into CMAF segments, write segment
//! files and manifests, and evict old segments from the sliding window.

use std::collections::VecDeque;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};

use crate::codec::{self, Packet};
use crate::config::Config;
use crate::mux::Mp4Muxer;
use crate::playlist::{self, ManifestParams, SegmentRef};

const INIT_NAME: &str = "init.mp4";
const HLS_MEDIA: &str = "stream.m3u8";
const HLS_MASTER: &str = "master.m3u8";
const DASH_NAME: &str = "stream.mpd";

/// Run the segmenter loop until the input stream ends.
pub fn run(config: &Config, mut reader: Box<dyn Read + Send>) -> Result<()> {
    let dir = &config.output.dir;
    std::fs::create_dir_all(dir)
        .with_context(|| format!("creating output dir {}", dir.display()))?;

    let mut encoder = codec::build(config)?;
    let entry = encoder.sample_entry();
    let sample_rate = entry.sample_rate;
    let channels = entry.channels;
    let codec_str = encoder.rfc6381_codec();
    let muxer = Mp4Muxer::new(entry);
    let timescale = muxer.timescale();

    log::info!(
        "encoding {} ({}), {} ch @ {} Hz, ~{}s segments, window {}",
        encoder.name(),
        codec_str,
        channels,
        sample_rate,
        config.output.segment_duration,
        config.output.playlist_size,
    );

    // Write the (immutable) init segment once.
    write_atomic(&dir.join(INIT_NAME), &muxer.init_segment())?;

    let start_unix = now_unix();
    let samples_per_segment = (sample_rate * config.output.segment_duration) as usize;
    let mut pcm = PcmReader::new(channels);

    let mut sequence: u32 = 1;
    let mut base_ts: u64 = 0;
    let mut window: VecDeque<SegmentRef> = VecDeque::new();
    let bandwidth = estimate_bandwidth(config, sample_rate, channels);

    loop {
        let interleaved = pcm.read_up_to(&mut reader, samples_per_segment)?;
        let eof = interleaved.len() < samples_per_segment * channels as usize;

        let mut packets = encoder.encode(&interleaved)?;
        if eof {
            packets.extend(encoder.flush()?);
        }

        if !packets.is_empty() {
            write_segment(
                config,
                &muxer,
                sequence,
                base_ts,
                &packets,
                sample_rate,
                &mut window,
            )?;
            let seg_samples: u64 = packets.iter().map(|p| p.sample_count as u64).sum();
            base_ts += seg_samples;
            sequence += 1;

            update_manifests(
                config,
                &window,
                timescale,
                sample_rate,
                channels,
                &codec_str,
                bandwidth,
                start_unix,
            )?;
        }

        if eof {
            log::info!("input stream ended after {} segments", sequence - 1);
            break;
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn write_segment(
    config: &Config,
    muxer: &Mp4Muxer,
    sequence: u32,
    base_ts: u64,
    packets: &[Packet],
    sample_rate: u32,
    window: &mut VecDeque<SegmentRef>,
) -> Result<()> {
    let filename = format!("seg-{sequence:05}.m4s");
    let bytes = muxer.media_segment(sequence, base_ts, packets);
    write_atomic(&config.output.dir.join(&filename), &bytes)?;

    let seg_samples: u64 = packets.iter().map(|p| p.sample_count as u64).sum();
    window.push_back(SegmentRef {
        sequence,
        filename,
        start_ts: base_ts,
        duration_ts: seg_samples,
        duration_secs: seg_samples as f64 / sample_rate as f64,
    });

    // Evict beyond the window and delete the backing files.
    while window.len() > config.output.playlist_size as usize {
        if let Some(old) = window.pop_front() {
            let _ = std::fs::remove_file(config.output.dir.join(&old.filename));
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn update_manifests(
    config: &Config,
    window: &VecDeque<SegmentRef>,
    timescale: u32,
    sample_rate: u32,
    channels: u16,
    codec_str: &str,
    bandwidth: u32,
    start_unix: u64,
) -> Result<()> {
    let segments: Vec<SegmentRef> = window.iter().cloned().collect();
    let params = ManifestParams {
        init_uri: INIT_NAME,
        timescale,
        sample_rate,
        channels,
        codec: codec_str,
        target_duration: config.output.segment_duration,
        bandwidth,
        start_unix,
        now_unix: now_unix(),
    };

    if config.hls.enabled {
        let media = playlist::render_hls(&segments, &params);
        write_atomic(&config.output.dir.join(HLS_MEDIA), media.as_bytes())?;
        let master = playlist::render_hls_master(HLS_MEDIA, &params);
        write_atomic(&config.output.dir.join(HLS_MASTER), master.as_bytes())?;
    }
    if config.dash.enabled {
        let mpd = playlist::render_dash(&segments, &params);
        write_atomic(&config.output.dir.join(DASH_NAME), mpd.as_bytes())?;
    }
    Ok(())
}

fn estimate_bandwidth(config: &Config, sample_rate: u32, channels: u16) -> u32 {
    match config.encoder.codec {
        // Lossless: rough estimate ~60% of raw PCM.
        crate::config::CodecKind::Flac => {
            ((sample_rate as u64 * channels as u64 * 16 * 6 / 10) as u32).max(1)
        }
        _ => config.encoder.bitrate_bps().unwrap_or(128_000),
    }
}

/// Write a file atomically (write to `.tmp`, then rename) so HTTP clients never
/// observe a half-written manifest or segment.
fn write_atomic(path: &Path, data: &[u8]) -> Result<()> {
    let mut tmp_name = path.file_name().map(|n| n.to_owned()).unwrap_or_default();
    tmp_name.push(".tmp");
    let tmp: PathBuf = path.with_file_name(tmp_name);
    std::fs::write(&tmp, data).with_context(|| format!("writing {}", tmp.display()))?;
    std::fs::rename(&tmp, path).with_context(|| format!("renaming into {}", path.display()))?;
    Ok(())
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Reads raw s16le bytes and yields interleaved i16 samples, carrying a
/// leftover odd byte across reads.
struct PcmReader {
    channels: usize,
    carry: Option<u8>,
}

impl PcmReader {
    fn new(channels: u16) -> Self {
        Self {
            channels: channels as usize,
            carry: None,
        }
    }

    /// Read up to `frames_per_channel * channels` interleaved samples. Returns
    /// fewer only at end of stream.
    fn read_up_to<R: Read>(
        &mut self,
        reader: &mut R,
        frames_per_channel: usize,
    ) -> Result<Vec<i16>> {
        let target = frames_per_channel * self.channels;
        let mut out: Vec<i16> = Vec::with_capacity(target);
        let mut buf = [0u8; 16 * 1024];

        while out.len() < target {
            let remaining_bytes = (target - out.len()) * 2 - usize::from(self.carry.is_some());
            let limit = remaining_bytes.min(buf.len());
            let n = reader
                .read(&mut buf[..limit])
                .context("reading PCM input")?;
            if n == 0 {
                break; // EOF
            }
            let mut idx = 0;
            // Consume a carried low byte first.
            if let Some(lo) = self.carry.take() {
                if n >= 1 {
                    let sample = i16::from_le_bytes([lo, buf[0]]);
                    out.push(sample);
                    idx = 1;
                } else {
                    self.carry = Some(lo);
                }
            }
            let rest = &buf[idx..n];
            let mut chunks = rest.chunks_exact(2);
            for pair in &mut chunks {
                out.push(i16::from_le_bytes([pair[0], pair[1]]));
            }
            if let [lo] = chunks.remainder() {
                self.carry = Some(*lo);
            }
        }

        // Align to whole frames (drop any trailing partial frame samples).
        let usable = out.len() - (out.len() % self.channels);
        out.truncate(usable);
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn segment_reads_never_consume_or_discard_next_segments_samples() {
        let samples: Vec<i16> = (0..20000).map(|i| i as i16).collect();
        let bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        let mut source = std::io::Cursor::new(bytes);
        let mut reader = PcmReader::new(2);
        let mut recovered = Vec::new();
        loop {
            let block = reader.read_up_to(&mut source, 127).unwrap();
            if block.is_empty() { break; }
            assert!(block.len() <= 254);
            recovered.extend(block);
        }
        assert_eq!(recovered, samples);
    }
    #[test]
    fn handles_odd_byte_reads_without_changing_channel_alignment() {
        struct Bytewise(std::io::Cursor<Vec<u8>>);
        impl Read for Bytewise {
            fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
                if out.is_empty() { return Ok(0); }
                self.0.read(&mut out[..1])
            }
        }
        let expected = [-1234i16, 5678, -9012, 3456];
        let bytes = expected.iter().flat_map(|s| s.to_le_bytes()).collect();
        let mut source = Bytewise(std::io::Cursor::new(bytes));
        let mut reader = PcmReader::new(2);
        assert_eq!(reader.read_up_to(&mut source, 1).unwrap(), expected[..2]);
        assert_eq!(reader.read_up_to(&mut source, 1).unwrap(), expected[2..]);
        assert!(reader.read_up_to(&mut source, 1).unwrap().is_empty());
    }
}
