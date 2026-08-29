//! ACOS3 file access.
//!
//! Ported from card-inspect (src/acos.rs). ACOS3 uses ACS's proprietary command
//! set (class 0x80) over T=0, and its files are record-based rather than
//! transparent:
//!   SELECT FILE   80 A4 00 00 02 <FID>
//!   READ RECORD   80 B2 <rec#> 00 <Le>
//!   WRITE RECORD  80 D2 <rec#> 00 <Lc> <data…>
//!   SUBMIT CODE   80 20 <code-ref> 00 <len> <code…>   (ref 07 = Issuer Code)
//!
//! Reads are commonly free; writes need a submitted code, so a write to a
//! protected file answers `69 82` until the right one is presented.
//!
//! Everything runs inside a PC/SC transaction. On macOS the CryptoTokenKit
//! daemon touches a shared card between APDUs and resets it, so a bare
//! SELECT-then-READ sequence is constantly interrupted with ResetCard; the
//! transaction's exclusive lock is what stops that.

use super::{map_err, sw};
use pcsc::Transaction;

const CLA: u8 = 0x80;

fn transmit(tx: &Transaction, apdu: &[u8]) -> Result<Vec<u8>, String> {
    let mut recv = [0u8; 4096];
    tx.transmit(apdu, &mut recv)
        .map(|r| r.to_vec())
        .map_err(map_err)
}

pub fn select_file(tx: &Transaction, file_id: &[u8]) -> Result<(), String> {
    let mut apdu = vec![CLA, 0xA4, 0x00, 0x00, file_id.len() as u8];
    apdu.extend_from_slice(file_id);
    match sw(&transmit(tx, &apdu)?) {
        (0x90, 0x00) => Ok(()),
        (0x6A, 0x82) => Err("the card has no such file (6A 82)".into()),
        (a, b) => Err(format!("SELECT FILE failed: SW {a:02X} {b:02X}")),
    }
}

/// A file's record length, found by reading record 0 with a growing `Le`: ACOS
/// answers `90 00` while `Le` fits the record and `67 00` once it is too large,
/// so the length is the last `Le` that worked.
pub fn record_len(tx: &Transaction) -> Result<usize, String> {
    let mut len = 0usize;
    for le in 1u8..=255 {
        match sw(&transmit(tx, &[CLA, 0xB2, 0x00, 0x00, le])?) {
            (0x90, 0x00) => len = le as usize,
            (0x67, 0x00) => break,
            (0x6A, 0x83) => break, // no record 0 — empty file
            (0x69, 0x82) => return Err("this file needs a code before it can be read".into()),
            (a, b) => return Err(format!("READ RECORD probe failed: SW {a:02X} {b:02X}")),
        }
    }
    if len == 0 {
        return Err("could not determine the record length (file empty or protected)".into());
    }
    Ok(len)
}

/// How many records the selected file has, by reading until the card reports
/// out-of-range. Used to check capacity before writing anything.
pub fn record_count(tx: &Transaction, reclen: usize) -> Result<usize, String> {
    let mut n = 0usize;
    while n <= 0xFF {
        match sw(&transmit(tx, &[CLA, 0xB2, n as u8, 0x00, reclen as u8])?) {
            (0x90, 0x00) => n += 1,
            (0x6A, 0x83) => break, // past the last record
            (0x69, 0x82) => break, // protected — can't probe further
            (a, b) => return Err(format!("record-count probe: SW {a:02X} {b:02X}")),
        }
    }
    Ok(n)
}

/// Read records from `start` until the card reports no more, or `max_bytes`.
pub fn read_records(
    tx: &Transaction,
    start: usize,
    reclen: usize,
    max_bytes: Option<usize>,
) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut rec = start;
    while rec <= 0xFF {
        if max_bytes.is_some_and(|max| out.len() >= max) {
            break;
        }
        let r = transmit(tx, &[CLA, 0xB2, rec as u8, 0x00, reclen as u8])?;
        match sw(&r) {
            (0x90, 0x00) => out.extend_from_slice(&r[..r.len() - 2]),
            (0x6A, 0x83) => break, // end of file
            (a, b) => return Err(format!("READ RECORD {rec} failed: SW {a:02X} {b:02X}")),
        }
        rec += 1;
    }
    if let Some(max) = max_bytes {
        out.truncate(max);
    }
    Ok(out)
}

/// Write `data` as whole `reclen`-byte records from record `start`, padding the
/// last one with 0x00.
pub fn write_records(
    tx: &Transaction,
    start: usize,
    reclen: usize,
    data: &[u8],
) -> Result<(), String> {
    for (i, chunk) in data.chunks(reclen).enumerate() {
        let mut rec = chunk.to_vec();
        rec.resize(reclen, 0x00);
        let mut apdu = vec![CLA, 0xD2, (start + i) as u8, 0x00, reclen as u8];
        apdu.extend_from_slice(&rec);
        match sw(&transmit(tx, &apdu)?) {
            (0x90, 0x00) => {}
            (0x69, 0x82) => {
                return Err(format!(
                    "record {} is protected — the code was not accepted for writing",
                    start + i
                ));
            }
            (0x6A, 0x83) => {
                return Err(format!("record {} is past the end of the file", start + i));
            }
            (a, b) => {
                return Err(format!(
                    "WRITE RECORD {} failed: SW {a:02X} {b:02X}",
                    start + i
                ));
            }
        }
    }
    Ok(())
}

/// Zero the records from `start` to the end of the file, so a write owns the
/// whole file rather than leaving stale records behind it. Returns how many were
/// cleared.
pub fn clear_records_from(tx: &Transaction, start: usize, reclen: usize) -> Result<usize, String> {
    let zeros = vec![0u8; reclen];
    let mut cleared = 0;
    let mut rec = start;
    while rec <= 0xFF {
        let mut apdu = vec![CLA, 0xD2, rec as u8, 0x00, reclen as u8];
        apdu.extend_from_slice(&zeros);
        match sw(&transmit(tx, &apdu)?) {
            (0x90, 0x00) => {
                cleared += 1;
                rec += 1;
            }
            (0x6A, 0x83) => break, // end of file
            (a, b) => return Err(format!("clearing record {rec} failed: SW {a:02X} {b:02X}")),
        }
    }
    Ok(cleared)
}

/// Present a code (PIN / issuer code) to unlock protected operations.
/// `code_ref` is the slot in P1 — 0x07 is the Issuer Code.
pub fn submit_code(tx: &Transaction, code_ref: u8, code: &[u8]) -> Result<(), String> {
    let mut apdu = vec![CLA, 0x20, code_ref, 0x00, code.len() as u8];
    apdu.extend_from_slice(code);
    match sw(&transmit(tx, &apdu)?) {
        (0x90, 0x00) => Ok(()),
        (0x63, c) => Err(format!(
            "wrong code — {} attempt(s) left before it blocks",
            c & 0x0F
        )),
        (0x69, 0x83) => Err("that code is blocked (69 83)".into()),
        (a, b) => Err(format!("SUBMIT CODE failed: SW {a:02X} {b:02X}")),
    }
}
