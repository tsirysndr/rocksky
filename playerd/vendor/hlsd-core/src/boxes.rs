//! Minimal ISO-BMFF (MP4) box-building primitives shared by the muxer and the
//! codec-specific sample-entry descriptors.

/// A single ISO-BMFF box: `size(4) + type(4) + payload`.
pub fn mp4_box(fourcc: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + payload.len());
    out.extend_from_slice(&((8 + payload.len()) as u32).to_be_bytes());
    out.extend_from_slice(fourcc);
    out.extend_from_slice(payload);
    out
}

/// A "full box": `size(4) + type(4) + version(1) + flags(3) + payload`.
pub fn full_box(fourcc: &[u8; 4], version: u8, flags: u32, payload: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(4 + payload.len());
    body.push(version);
    body.extend_from_slice(&flags.to_be_bytes()[1..]); // low 24 bits
    body.extend_from_slice(payload);
    mp4_box(fourcc, &body)
}

/// Concatenate several byte buffers.
pub fn concat(parts: &[&[u8]]) -> Vec<u8> {
    let mut out = Vec::with_capacity(parts.iter().map(|p| p.len()).sum());
    for p in parts {
        out.extend_from_slice(p);
    }
    out
}

/// Helper for building a byte buffer with big-endian primitives.
#[derive(Default)]
pub struct Buf(pub Vec<u8>);

impl Buf {
    pub fn new() -> Self {
        Buf(Vec::new())
    }
    pub fn u8(&mut self, v: u8) -> &mut Self {
        self.0.push(v);
        self
    }
    pub fn u16(&mut self, v: u16) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }
    pub fn u32(&mut self, v: u32) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }
    pub fn u64(&mut self, v: u64) -> &mut Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }
    pub fn bytes(&mut self, v: &[u8]) -> &mut Self {
        self.0.extend_from_slice(v);
        self
    }
    pub fn zeros(&mut self, n: usize) -> &mut Self {
        self.0.resize(self.0.len() + n, 0);
        self
    }
    pub fn take(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.0)
    }
}
