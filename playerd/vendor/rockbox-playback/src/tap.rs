//! Bounded pre-volume stereo PCM capture. The audio callback only try-locks
//! preallocated storage: a stalled consumer cannot block speaker playback.
use std::collections::VecDeque;
use std::io::{self, Read};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

pub struct PcmTap {
    frames: Mutex<VecDeque<[i16; 2]>>,
    capacity: usize,
    closed: AtomicBool,
    dropped: AtomicU64,
}

pub struct PcmTapReader {
    tap: Arc<PcmTap>,
    pending: [u8; 4],
    offset: usize,
}

pub(crate) struct Capture<'a> {
    frames: MutexGuard<'a, VecDeque<[i16; 2]>>,
    tap: &'a PcmTap,
}

impl PcmTap {
    pub fn new(capacity_frames: usize) -> (Arc<Self>, PcmTapReader) {
        let capacity = capacity_frames.max(1);
        let tap = Arc::new(Self {
            frames: Mutex::new(VecDeque::with_capacity(capacity)),
            capacity,
            closed: AtomicBool::new(false),
            dropped: AtomicU64::new(0),
        });
        let reader = PcmTapReader {
            tap: tap.clone(),
            pending: [0; 4],
            offset: 4,
        };
        (tap, reader)
    }

    pub fn close(&self) {
        self.closed.store(true, Ordering::Relaxed);
    }
    pub fn dropped_frames(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
    }

    pub(crate) fn capture(&self) -> Option<Capture<'_>> {
        if self.closed.load(Ordering::Relaxed) {
            return None;
        }
        self.frames
            .try_lock()
            .ok()
            .map(|frames| Capture { frames, tap: self })
    }
}

impl Capture<'_> {
    pub(crate) fn push(&mut self, l: i16, r: i16) {
        if self.frames.len() < self.tap.capacity {
            self.frames.push_back([l, r]);
        } else {
            self.tap.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
}

impl Read for PcmTapReader {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        if out.is_empty() {
            return Ok(0);
        }
        loop {
            let mut written = 0;
            let mut frames = self.tap.frames.lock().unwrap();
            while written < out.len() {
                if self.offset == 4 {
                    let Some([l, r]) = frames.pop_front() else {
                        break;
                    };
                    self.pending[..2].copy_from_slice(&l.to_le_bytes());
                    self.pending[2..].copy_from_slice(&r.to_le_bytes());
                    self.offset = 0;
                }
                let n = (4 - self.offset).min(out.len() - written);
                out[written..written + n]
                    .copy_from_slice(&self.pending[self.offset..self.offset + n]);
                self.offset += n;
                written += n;
            }
            drop(frames);
            if written > 0 {
                return Ok(written);
            }
            if self.tap.closed.load(Ordering::Relaxed) {
                return Ok(0);
            }
            std::thread::sleep(Duration::from_millis(2));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_and_preserves_bytes_across_short_reads() {
        let (tap, mut reader) = PcmTap::new(2);
        let mut writer = tap.capture().unwrap();
        writer.push(0x1234, -2);
        writer.push(3, -4);
        writer.push(5, 6);
        drop(writer);
        assert_eq!(tap.dropped_frames(), 1);
        tap.close();
        let mut out = Vec::new();
        let mut byte = [0];
        while reader.read(&mut byte).unwrap() != 0 {
            out.push(byte[0]);
        }
        assert_eq!(out, [0x34, 0x12, 0xfe, 0xff, 3, 0, 0xfc, 0xff]);
    }
    #[test]
    fn audio_capture_never_waits_for_reader_lock() {
        let (tap, _) = PcmTap::new(2);
        let _locked = tap.frames.lock().unwrap();
        assert!(tap.capture().is_none());
    }
}
