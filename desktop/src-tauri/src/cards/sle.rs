//! SLE5528 memory-card access via the ACS reader's pseudo-APDUs.
//!
//! Ported from card-inspect (src/sle.rs). The card is 1024 flat bytes; reads are
//! free, writes need the PSC presented first.

use super::{expect_ok, map_err, SLE5528_SIZE};
use pcsc::Card;

fn transmit(card: &Card, apdu: &[u8]) -> Result<Vec<u8>, String> {
    let mut recv = [0u8; 4096];
    card.transmit(apdu, &mut recv)
        .map(|r| r.to_vec())
        .map_err(map_err)
}

/// Tell the reader the inserted card is an SLE4418/4428/5518/5528 (type 0x05).
/// Every other command depends on this having been sent.
pub fn select_type(card: &Card) -> Result<(), String> {
    expect_ok(&transmit(card, &[0xFF, 0xA4, 0x00, 0x00, 0x01, 0x05])?)?;
    Ok(())
}

/// The presentation-error counter, without presenting a code or decrementing it.
/// `FF` is untouched; `00` means the card is locked for writing, permanently.
pub fn error_counter(card: &Card) -> Result<Option<u8>, String> {
    let r = transmit(card, &[0xFF, 0xB1, 0x00, 0x00, 0x03])?;
    Ok(expect_ok(&r)?.first().copied())
}

pub fn read(card: &Card, offset: usize, length: usize) -> Result<Vec<u8>, String> {
    if offset + length > SLE5528_SIZE {
        return Err(format!(
            "read {}..{} is out of range (card is {SLE5528_SIZE} bytes)",
            offset,
            offset + length
        ));
    }

    let mut memory = Vec::with_capacity(length);
    let mut addr = offset;
    let end = offset + length;
    // READ_MEMORY_CARD: FF B0 <addr-hi> <addr-lo> <len>, 32 bytes at a time.
    while addr < end {
        let chunk = std::cmp::min(32, end - addr);
        let apdu = [
            0xFF,
            0xB0,
            ((addr >> 8) & 0xFF) as u8,
            (addr & 0xFF) as u8,
            chunk as u8,
        ];
        memory.extend_from_slice(expect_ok(&transmit(card, &apdu)?)?);
        addr += chunk;
    }
    Ok(memory)
}

/// Present the security code to unlock writes.
///
/// A wrong code decrements the error counter and enough wrong ones lock the card
/// permanently, so this is only ever reached from an explicit write the user
/// asked for.
///
/// PRESENT_CODE does not answer `90 00`. It answers `90 <EC>`, the error counter
/// *after* the attempt: a correct code restores it to `FF`, a wrong one leaves
/// fewer bits set, and `00` means locked.
pub fn present_psc(card: &Card, psc: &[u8]) -> Result<(), String> {
    let mut apdu = vec![0xFF, 0x20, 0x00, 0x00, psc.len() as u8];
    apdu.extend_from_slice(psc);
    let r = transmit(card, &apdu)?;
    if r.len() < 2 {
        return Err("PSC verification: response too short".into());
    }
    match (r[r.len() - 2], r[r.len() - 1]) {
        (0x90, 0xFF) => Ok(()),
        (0x90, 0x00) => Err("that code was wrong and the card is now locked".into()),
        (0x90, ec) => Err(format!(
            "wrong code — {} attempt(s) left before the card locks permanently",
            ec.count_ones()
        )),
        (a, b) => Err(format!("PSC verification failed: SW {a:02X} {b:02X}")),
    }
}

pub fn write(card: &Card, offset: usize, data: &[u8]) -> Result<(), String> {
    if offset + data.len() > SLE5528_SIZE {
        return Err(format!(
            "write {}..{} is out of range (card is {SLE5528_SIZE} bytes)",
            offset,
            offset + data.len()
        ));
    }

    let mut addr = offset;
    // WRITE_MEMORY_CARD: FF D0 <addr-hi> <addr-lo> <len> <data...>.
    for chunk in data.chunks(16) {
        let mut apdu = vec![
            0xFF,
            0xD0,
            ((addr >> 8) & 0xFF) as u8,
            (addr & 0xFF) as u8,
            chunk.len() as u8,
        ];
        apdu.extend_from_slice(chunk);
        expect_ok(&transmit(card, &apdu)?).map_err(|e| format!("{e} at byte {addr}"))?;
        addr += chunk.len();
    }
    Ok(())
}
