//! Live manifest generation: HLS media playlist (.m3u8) and MPEG-DASH (.mpd),
//! both using a sliding window over CMAF fMP4 segments.

use std::fmt::Write as _;

/// One segment currently in the live window.
#[derive(Clone)]
pub struct SegmentRef {
    pub sequence: u32,
    pub filename: String,
    /// Media-timescale decode time of the segment's first sample.
    pub start_ts: u64,
    /// Duration in media-timescale units.
    pub duration_ts: u64,
    /// Duration in seconds.
    pub duration_secs: f64,
}

/// Parameters shared by both manifest formats.
pub struct ManifestParams<'a> {
    pub init_uri: &'a str,
    pub timescale: u32,
    pub sample_rate: u32,
    pub channels: u16,
    pub codec: &'a str,
    /// Nominal target segment duration (seconds).
    pub target_duration: u32,
    /// Approximate stream bandwidth in bits/s (for DASH `bandwidth`).
    pub bandwidth: u32,
    /// Unix seconds at which media time 0 was produced (DASH anchor).
    pub start_unix: u64,
    /// Current wall-clock unix seconds (DASH `publishTime`).
    pub now_unix: u64,
}

/// Render an HLS live media playlist.
pub fn render_hls(segments: &[SegmentRef], params: &ManifestParams) -> String {
    let target = segments
        .iter()
        .map(|s| s.duration_secs.ceil() as u32)
        .max()
        .unwrap_or(params.target_duration)
        .max(1);
    let first_seq = segments.first().map(|s| s.sequence).unwrap_or(0);

    let mut out = String::new();
    out.push_str("#EXTM3U\n");
    out.push_str("#EXT-X-VERSION:7\n");
    let _ = writeln!(out, "#EXT-X-TARGETDURATION:{target}");
    let _ = writeln!(out, "#EXT-X-MEDIA-SEQUENCE:{first_seq}");
    let _ = writeln!(out, "#EXT-X-MAP:URI=\"{}\"", params.init_uri);
    for s in segments {
        let _ = writeln!(out, "#EXTINF:{:.6},", s.duration_secs);
        let _ = writeln!(out, "{}", s.filename);
    }
    out
}

/// Render an HLS multivariant (master) playlist pointing at the media playlist.
///
/// This is a single audio-only rendition, so the variant carries the audio
/// directly. We deliberately do NOT declare a separate `#EXT-X-MEDIA` AUDIO
/// group referencing the same media playlist — that makes players load the
/// audio twice and produces duplicate/"corrupt" streams.
pub fn render_hls_master(media_uri: &str, params: &ManifestParams) -> String {
    let mut out = String::new();
    out.push_str("#EXTM3U\n");
    out.push_str("#EXT-X-VERSION:7\n");
    let _ = writeln!(
        out,
        "#EXT-X-STREAM-INF:BANDWIDTH={},CODECS=\"{}\"",
        params.bandwidth, params.codec
    );
    let _ = writeln!(out, "{media_uri}");
    out
}

/// Render a dynamic MPEG-DASH manifest using a SegmentTimeline window.
pub fn render_dash(segments: &[SegmentRef], params: &ManifestParams) -> String {
    let first_seq = segments.first().map(|s| s.sequence).unwrap_or(1);
    let window_secs: f64 = segments.iter().map(|s| s.duration_secs).sum();
    let ast = iso8601(params.start_unix);
    let publish = iso8601(params.now_unix);
    let mup = params.target_duration.max(1);
    let min_buffer = (params.target_duration * 2).max(2);

    let mut timeline = String::new();
    for (i, s) in segments.iter().enumerate() {
        if i == 0 {
            let _ = write!(
                timeline,
                "          <S t=\"{}\" d=\"{}\"/>\n",
                s.start_ts, s.duration_ts
            );
        } else {
            let _ = write!(timeline, "          <S d=\"{}\"/>\n", s.duration_ts);
        }
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="dynamic"
     minimumUpdatePeriod="PT{mup}S"
     minBufferTime="PT{min_buffer}S"
     timeShiftBufferDepth="PT{window}S"
     availabilityStartTime="{ast}"
     publishTime="{publish}">
  <UTCTiming schemeIdUri="urn:mpeg:dash:utc:direct:2014" value="{publish}"/>
  <Period id="0" start="PT0S">
    <AdaptationSet contentType="audio" mimeType="audio/mp4" lang="und" segmentAlignment="true" startWithSAP="1">
      <Representation id="audio" codecs="{codec}" bandwidth="{bw}" audioSamplingRate="{sr}">
        <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="{ch}"/>
        <SegmentTemplate timescale="{ts}" initialization="{init}" media="seg-$Number%05d$.m4s" startNumber="{start}">
          <SegmentTimeline>
{timeline}          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
"#,
        mup = mup,
        min_buffer = min_buffer,
        window = window_secs.ceil() as u64,
        ast = ast,
        publish = publish,
        codec = params.codec,
        bw = params.bandwidth,
        sr = params.sample_rate,
        ch = params.channels,
        ts = params.timescale,
        init = params.init_uri,
        start = first_seq,
        timeline = timeline,
    )
}

/// Format a Unix timestamp (seconds) as ISO-8601 UTC, e.g. `2026-07-29T12:00:00Z`.
/// Uses Howard Hinnant's civil-from-days algorithm — no external date crate.
pub fn iso8601(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (hh, mm, ss) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, m, d, hh, mm, ss
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso8601_known_values() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso8601(1_600_000_000), "2020-09-13T12:26:40Z");
        assert_eq!(iso8601(1_753_747_200), "2025-07-29T00:00:00Z");
        assert_eq!(iso8601(1_785_283_200), "2026-07-29T00:00:00Z");
    }

    #[test]
    fn hls_playlist_has_live_markers() {
        let segs = vec![SegmentRef {
            sequence: 4,
            filename: "seg-00004.m4s".into(),
            start_ts: 0,
            duration_ts: 44_100,
            duration_secs: 1.0,
        }];
        let params = ManifestParams {
            init_uri: "init.mp4",
            timescale: 44_100,
            sample_rate: 44_100,
            channels: 2,
            codec: "fLaC",
            target_duration: 1,
            bandwidth: 800_000,
            start_unix: 0,
            now_unix: 10,
        };
        let m = render_hls(&segs, &params);
        assert!(m.contains("#EXT-X-MEDIA-SEQUENCE:4"));
        assert!(m.contains("#EXT-X-MAP:URI=\"init.mp4\""));
        assert!(!m.contains("#EXT-X-ENDLIST")); // live: never ends
    }
}
