//! Fragmented-MP4 (CMAF) muxer. Produces one shared `init` segment and a
//! `moof`+`mdat` media segment per fragment, usable by both HLS (with
//! `EXT-X-MAP`) and MPEG-DASH.

use crate::boxes::{Buf, concat, full_box, mp4_box};
use crate::codec::{Packet, SampleEntry};

pub struct Mp4Muxer {
    timescale: u32,
    entry: SampleEntry,
}

impl Mp4Muxer {
    pub fn new(entry: SampleEntry) -> Self {
        Self {
            timescale: entry.sample_rate,
            entry,
        }
    }

    /// Media timescale (== sample rate). Manifests use it for durations.
    pub fn timescale(&self) -> u32 {
        self.timescale
    }

    /// The initialization segment (`ftyp` + `moov`).
    pub fn init_segment(&self) -> Vec<u8> {
        concat(&[&self.ftyp(), &self.moov()])
    }

    /// A media segment (`styp` + `moof` + `mdat`) for the given packets.
    pub fn media_segment(
        &self,
        sequence: u32,
        base_media_decode_time: u64,
        packets: &[Packet],
    ) -> Vec<u8> {
        let mdat = self.mdat(packets);
        // moof size is independent of the data_offset value (fixed 4-byte field),
        // so measure it once, then rebuild with the correct offset.
        let probe = self.moof(sequence, base_media_decode_time, packets, 0);
        let data_offset = (probe.len() + 8) as i32; // + mdat header
        let moof = self.moof(sequence, base_media_decode_time, packets, data_offset);
        debug_assert_eq!(moof.len(), probe.len());
        concat(&[&self.styp(), &moof, &mdat])
    }

    // -- init boxes --------------------------------------------------------

    fn ftyp(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.bytes(b"iso5").u32(0x0000_0200);
        b.bytes(b"iso5")
            .bytes(b"iso6")
            .bytes(b"mp41")
            .bytes(b"dash")
            .bytes(b"cmfc");
        mp4_box(b"ftyp", &b.take())
    }

    fn styp(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.bytes(b"msdh").u32(0);
        b.bytes(b"msdh")
            .bytes(b"msix")
            .bytes(b"cmfs")
            .bytes(b"iso5");
        mp4_box(b"styp", &b.take())
    }

    fn moov(&self) -> Vec<u8> {
        let payload = concat(&[&self.mvhd(), &self.trak(), &self.mvex()]);
        mp4_box(b"moov", &payload)
    }

    fn mvhd(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.u32(0)
            .u32(0) // creation, modification
            .u32(self.timescale)
            .u32(0) // duration (unknown / fragmented)
            .u32(0x0001_0000) // rate 1.0
            .u16(0x0100) // volume 1.0
            .u16(0) // reserved
            .u32(0)
            .u32(0); // reserved
        write_matrix(&mut b);
        b.zeros(24); // pre_defined
        b.u32(2); // next_track_ID
        full_box(b"mvhd", 0, 0, &b.take())
    }

    fn trak(&self) -> Vec<u8> {
        let payload = concat(&[&self.tkhd(), &self.mdia()]);
        mp4_box(b"trak", &payload)
    }

    fn tkhd(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.u32(0)
            .u32(0) // creation, modification
            .u32(1) // track_ID
            .u32(0) // reserved
            .u32(0) // duration
            .u32(0)
            .u32(0) // reserved
            .u16(0) // layer
            .u16(0) // alternate_group
            .u16(0x0100) // volume (audio)
            .u16(0); // reserved
        write_matrix(&mut b);
        b.u32(0).u32(0); // width, height
        full_box(b"tkhd", 0, 0x0000_0007, &b.take())
    }

    fn mdia(&self) -> Vec<u8> {
        let payload = concat(&[&self.mdhd(), &self.hdlr(), &self.minf()]);
        mp4_box(b"mdia", &payload)
    }

    fn mdhd(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.u32(0)
            .u32(0) // creation, modification
            .u32(self.timescale)
            .u32(0) // duration
            .u16(0x55C4) // language 'und'
            .u16(0); // pre_defined
        full_box(b"mdhd", 0, 0, &b.take())
    }

    fn hdlr(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.u32(0) // pre_defined
            .bytes(b"soun")
            .u32(0)
            .u32(0)
            .u32(0) // reserved
            .bytes(b"hlsd audio\0");
        full_box(b"hdlr", 0, 0, &b.take())
    }

    fn minf(&self) -> Vec<u8> {
        let payload = concat(&[&self.smhd(), &self.dinf(), &self.stbl()]);
        mp4_box(b"minf", &payload)
    }

    fn smhd(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.u16(0).u16(0); // balance, reserved
        full_box(b"smhd", 0, 0, &b.take())
    }

    fn dinf(&self) -> Vec<u8> {
        // dref with a single self-contained url entry (flags 0x1 = data in file).
        let url = full_box(b"url ", 0, 0x0000_0001, &[]);
        let mut dref_body = Buf::new();
        dref_body.u32(1); // entry_count
        dref_body.bytes(&url);
        let dref = full_box(b"dref", 0, 0, &dref_body.take());
        mp4_box(b"dinf", &dref)
    }

    fn stbl(&self) -> Vec<u8> {
        let stsd = {
            let mut body = Buf::new();
            body.u32(1); // entry_count
            body.bytes(&self.audio_sample_entry());
            full_box(b"stsd", 0, 0, &body.take())
        };
        let stts = full_box(b"stts", 0, 0, &0u32.to_be_bytes());
        let stsc = full_box(b"stsc", 0, 0, &0u32.to_be_bytes());
        let mut stsz_body = Buf::new();
        stsz_body.u32(0).u32(0); // sample_size, sample_count
        let stsz = full_box(b"stsz", 0, 0, &stsz_body.take());
        let stco = full_box(b"stco", 0, 0, &0u32.to_be_bytes());
        let payload = concat(&[&stsd, &stts, &stsc, &stsz, &stco]);
        mp4_box(b"stbl", &payload)
    }

    fn audio_sample_entry(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.zeros(6) // reserved
            .u16(1) // data_reference_index
            .u32(0)
            .u32(0) // reserved (version/revision/vendor)
            .u16(self.entry.channels)
            .u16(self.entry.sample_size)
            .u16(0) // pre_defined
            .u16(0) // reserved
            .u32(self.entry.sample_rate << 16); // 16.16 fixed
        b.bytes(&self.entry.config_boxes);
        mp4_box(&self.entry.fourcc, &b.take())
    }

    fn mvex(&self) -> Vec<u8> {
        let mut b = Buf::new();
        b.u32(1) // track_ID
            .u32(1) // default_sample_description_index
            .u32(0) // default_sample_duration
            .u32(0) // default_sample_size
            .u32(0); // default_sample_flags
        let trex = full_box(b"trex", 0, 0, &b.take());
        mp4_box(b"mvex", &trex)
    }

    // -- media boxes -------------------------------------------------------

    fn moof(&self, sequence: u32, base_time: u64, packets: &[Packet], data_offset: i32) -> Vec<u8> {
        let mfhd = {
            let mut b = Buf::new();
            b.u32(sequence);
            full_box(b"mfhd", 0, 0, &b.take())
        };
        let traf = {
            let tfhd = full_box(b"tfhd", 0, 0x0002_0000, &1u32.to_be_bytes()); // default-base-is-moof, track_ID=1
            let tfdt = full_box(b"tfdt", 1, 0, &base_time.to_be_bytes());
            let trun = {
                // flags: data-offset(0x1) | sample-duration(0x100) | sample-size(0x200)
                let mut b = Buf::new();
                b.u32(packets.len() as u32);
                b.u32(data_offset as u32);
                for p in packets {
                    b.u32(p.sample_count);
                    b.u32(p.data.len() as u32);
                }
                full_box(b"trun", 0, 0x0000_0301, &b.take())
            };
            let payload = concat(&[&tfhd, &tfdt, &trun]);
            mp4_box(b"traf", &payload)
        };
        let payload = concat(&[&mfhd, &traf]);
        mp4_box(b"moof", &payload)
    }

    fn mdat(&self, packets: &[Packet]) -> Vec<u8> {
        let total: usize = packets.iter().map(|p| p.data.len()).sum();
        let mut payload = Vec::with_capacity(total);
        for p in packets {
            payload.extend_from_slice(&p.data);
        }
        mp4_box(b"mdat", &payload)
    }
}

fn write_matrix(b: &mut Buf) {
    // Unity transform matrix.
    const M: [u32; 9] = [0x0001_0000, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000];
    for v in M {
        b.u32(v);
    }
}
