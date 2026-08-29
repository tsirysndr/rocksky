//! Contact smart cards: SLE memory cards and ACOS processor cards.
//!
//! These sit alongside the contactless tags in `nfc.rs` and carry the same
//! thing — an album or playlist's record URI, with the library id behind it as a
//! fallback — over entirely different protocols. The protocol work is ported
//! from card-inspect (~/Documents/github/card-inspect), and the on-card byte
//! layout is deliberately identical so a card written by either tool reads in
//! the other.
//!
//! What is stored: the record URI in `aturi`'s compact form (26 bytes for a
//! did:plc album, against 69 as text — which is what makes it fit an ACOS
//! record file at all), optionally followed by a newline and the library-id
//! fallback as plain text. Decoding reports where the compact blob ends, so the
//! trailing text is unambiguous, and card-inspect ignores it.

pub mod acos;
pub mod aturi;
pub mod sle;

use pcsc::Error as PcscError;

/// The contact cards this module speaks, identified by their ATR.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CardKind {
    /// SLE5528: a synchronous memory card, 1024 flat bytes behind a PSC.
    Sle5528,
    /// ACOS3: a T=0 processor card with a record-based filesystem behind a PIN.
    Acos3,
}

pub const SLE5528_ATR: &[u8] = &[0x3B, 0x04, 0x92, 0x23, 0x10, 0x91];
pub const ACOS3_ATR: &[u8] = &[
    0x3B, 0xBE, 0x11, 0x00, 0x00, 0x41, 0x01, 0x38, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x90, 0x00,
];

pub const SLE5528_SIZE: usize = 1024;
/// Writes start past the protected header, matching card-inspect's default.
pub const SLE_DATA_OFFSET: usize = 32;
/// How much of an SLE card a write owns.
///
/// The payload is padded to this with the erased value, so nothing left by a
/// longer previous write survives past the end of the new one — stale bytes
/// would otherwise read back as an extra record. The card has 1024 bytes, so
/// this is a small, fixed region we can clear cheaply rather than erasing all
/// of it on every write.
pub const SLE_WRITE_SPAN: usize = 256;
/// ACOS user data file, and the Issuer Code slot that unlocks writes to it.
pub const ACOS_USER_FILE: [u8; 2] = [0xFF, 0x04];
pub const ACOS_ISSUER_CODE_REF: u8 = 0x07;

impl CardKind {
    pub fn from_atr(atr: &[u8]) -> Option<Self> {
        match atr {
            a if a == SLE5528_ATR => Some(CardKind::Sle5528),
            a if a == ACOS3_ATR => Some(CardKind::Acos3),
            _ => None,
        }
    }

    /// What the write dialog calls the secret this card wants.
    pub fn secret_label(self) -> &'static str {
        match self {
            CardKind::Sle5528 => "PSC",
            CardKind::Acos3 => "PIN",
        }
    }

    /// The factory default, offered as the prefilled value.
    pub fn default_secret(self) -> &'static str {
        match self {
            CardKind::Sle5528 => "FFFF",
            CardKind::Acos3 => "ACOSTEST",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            CardKind::Sle5528 => "SLE5528 memory card",
            CardKind::Acos3 => "ACOS3 card",
        }
    }
}

const MEMORY_CARD_DRIVER_HINT: &str = "\
the reader's driver refuses memory-card commands. On macOS this means Apple's \
bundled CCID driver is active; install ACS's acsccid driver into \
/usr/local/libexec/SmartCardServices/drivers/ and replug the reader.";

/// Map a PC/SC error to something a user can act on.
pub fn map_err(e: PcscError) -> String {
    match e {
        // A synchronous memory card connects fine over RAW, but a driver
        // without ACS memory-card support rejects its pseudo-APDUs outright.
        PcscError::NotTransacted => MEMORY_CARD_DRIVER_HINT.to_string(),
        e => e.to_string(),
    }
}

/// Split a response into its data and status word.
pub fn sw(r: &[u8]) -> (u8, u8) {
    let n = r.len();
    if n >= 2 {
        (r[n - 2], r[n - 1])
    } else {
        (0, 0)
    }
}

/// The data of a `90 00` response, or an error naming the status word.
pub fn expect_ok(r: &[u8]) -> Result<&[u8], String> {
    if r.len() < 2 {
        return Err("response too short".into());
    }
    match sw(r) {
        (0x90, 0x00) => Ok(&r[..r.len() - 2]),
        (a, b) => Err(format!("card returned SW {a:02X} {b:02X}")),
    }
}

/// Build what goes on the card: the record URI compactly encoded, then the
/// remaining payloads as newline-separated text.
///
/// The compact form is the point on ACOS, where a record file has room for tens
/// of bytes rather than hundreds. Anything that isn't an `at://` URI is stored
/// as text, which is what card-inspect does too.
pub fn encode_payloads(payloads: &[&str]) -> Result<Vec<u8>, String> {
    let Some((first, rest)) = payloads.split_first() else {
        return Err("nothing to write".into());
    };

    let mut out = if aturi::looks_like_aturi(first) {
        aturi::encode(first)?
    } else {
        first.as_bytes().to_vec()
    };
    for extra in rest {
        out.push(b'\n');
        out.extend_from_slice(extra.as_bytes());
    }
    Ok(out)
}

/// Trim `payloads` to what `capacity` bytes can hold, keeping at least the
/// first.
///
/// Trailing records are droppable, as they are on a tag: the record URI is what
/// plays, and the library-id fallback only matters if it ever stops resolving.
/// This is not a rare edge — a real ACOS3 user file is 4 records of 7 bytes, so
/// 28 bytes total, which the 26-byte URI fills almost exactly. Refusing the
/// write would leave the card unusable for the sake of the optional half.
pub fn fit_payloads<'a>(payloads: &[&'a str], capacity: usize) -> Vec<&'a str> {
    let mut take = payloads.len();
    while take > 1 {
        match encode_payloads(&payloads[..take]) {
            Ok(bytes) if bytes.len() <= capacity => break,
            _ => take -= 1,
        }
    }
    payloads[..take].to_vec()
}

/// Recover the payload list written by [`encode_payloads`].
///
/// Erased memory reads back as 0xFF (SLE) or 0x00 (ACOS), and a card is rarely
/// written from byte zero — card-inspect's own default offset differs from
/// ours — so the fill has to be skipped at *both* ends, not just the tail.
///
/// The compact blob is located before any tail trimming, because it knows its
/// own length and its last byte may legitimately be 0x00: a packed TID ending in
/// a zero would otherwise be trimmed away and the whole URI lost.
pub fn decode_payloads(data: &[u8]) -> Vec<String> {
    let fill = |b: u8| b == 0xFF || b == 0x00;
    let start = data.iter().position(|&b| !fill(b)).unwrap_or(data.len());
    let data = &data[start..];
    if data.is_empty() {
        return Vec::new();
    }

    let mut out = Vec::new();
    let rest = match aturi::decode(data) {
        Some((uri, used)) => {
            out.push(uri);
            &data[used..]
        }
        // Not ours, or a blob we can't reconstruct — read the lot as text.
        None if aturi::is_encoded(data) => return Vec::new(),
        None => data,
    };

    // Only now is trimming the tail safe: whatever the blob claimed is already
    // consumed, so nothing here belongs to it.
    let end = rest.iter().rposition(|&b| !fill(b)).map_or(0, |i| i + 1);
    let rest = &rest[..end];

    for line in String::from_utf8_lossy(rest).split('\n') {
        let line = line.trim_matches(|c: char| c == '\0' || c.is_whitespace());
        if !line.is_empty() {
            out.push(line.to_string());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALBUM: &str = "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlttyitus2k";
    const ID: &str = "rocksky://library/album/rec_cuhigpho74fi003acf9g";

    #[test]
    fn roundtrips_a_uri_with_its_fallback() {
        let bytes = encode_payloads(&[ALBUM, ID]).unwrap();
        assert_eq!(
            decode_payloads(&bytes),
            vec![ALBUM.to_string(), ID.to_string()]
        );
    }

    /// The compact blob is what buys room for the fallback on a small card.
    #[test]
    fn stays_small_enough_for_an_acos_record_file() {
        let both = encode_payloads(&[ALBUM, ID]).unwrap();
        assert_eq!(both.len(), 26 + 1 + ID.len(), "blob + newline + text");
        assert!(both.len() < 80, "{} bytes", both.len());
        // The URI alone, which is what a tight card gets.
        assert_eq!(encode_payloads(&[ALBUM]).unwrap().len(), 26);
    }

    /// Erased memory reads back as 0xFF (SLE) or 0x00 (ACOS) and must not be
    /// mistaken for payload.
    #[test]
    fn ignores_the_erased_tail() {
        for fill in [0xFFu8, 0x00] {
            let mut bytes = encode_payloads(&[ALBUM, ID]).unwrap();
            bytes.resize(512, fill);
            assert_eq!(
                decode_payloads(&bytes),
                vec![ALBUM.to_string(), ID.to_string()],
                "fill {fill:02X}"
            );
        }
        assert!(decode_payloads(&[0xFF; 64]).is_empty(), "blank card");
        assert!(decode_payloads(&[0x00; 64]).is_empty(), "blank card");
    }

    /// A real SLE5528 read back exactly this: 32 bytes of erased 0xFF, then
    /// text written at a different offset than ours. The leading fill was being
    /// folded into the string.
    #[test]
    fn skips_the_erased_run_before_the_data() {
        let mut bytes = vec![0xFFu8; 32];
        bytes.extend_from_slice(b"hello card again");
        bytes.resize(128, 0xFF);
        assert_eq!(
            decode_payloads(&bytes),
            vec!["hello card again".to_string()]
        );

        // And the same for a compact blob sitting past an erased run.
        let mut bytes = vec![0xFFu8; 16];
        bytes.extend_from_slice(&encode_payloads(&[ALBUM]).unwrap());
        bytes.resize(256, 0xFF);
        assert_eq!(decode_payloads(&bytes), vec![ALBUM.to_string()]);
    }

    /// The blob's own bytes may end in 0x00 — a packed TID can. Trimming the
    /// tail before decoding would eat it and lose the whole URI, so the blob is
    /// located first and only what follows it is trimmed.
    #[test]
    fn does_not_trim_a_blob_ending_in_zero() {
        // This rkey packs to …9D6000 — a TID whose last byte really is zero.
        let uri = "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlttyitus22";
        let blob = encode_payloads(&[uri]).unwrap();
        assert_eq!(blob.last(), Some(&0x00), "this vector must end in 0x00");

        let mut padded = blob.clone();
        padded.resize(64, 0x00);
        assert_eq!(decode_payloads(&padded), vec![uri.to_string()]);
    }

    /// A card holding plain text — written by card-inspect's text mode — still
    /// reads, it just isn't compact.
    #[test]
    fn reads_a_plain_text_card() {
        let mut bytes = format!("{ALBUM}\n{ID}").into_bytes();
        bytes.resize(256, 0xFF);
        assert_eq!(
            decode_payloads(&bytes),
            vec![ALBUM.to_string(), ID.to_string()]
        );
    }

    /// A real ACOS3 user file is 4 records of 7 bytes. The URI alone fits with
    /// 2 bytes to spare; the fallback cannot, and must be dropped rather than
    /// failing the write.
    #[test]
    fn drops_the_fallback_when_the_file_is_tiny() {
        let acos_file = 4 * 7;
        assert_eq!(fit_payloads(&[ALBUM, ID], acos_file), vec![ALBUM]);
        assert_eq!(encode_payloads(&[ALBUM]).unwrap().len(), 26);
        assert!(
            26 <= acos_file,
            "the URI alone has to fit, or nothing works"
        );

        // An SLE card has room for both.
        assert_eq!(fit_payloads(&[ALBUM, ID], 992), vec![ALBUM, ID]);
        // Never trimmed to nothing, even when the card is smaller than the URI.
        assert_eq!(fit_payloads(&[ALBUM, ID], 4), vec![ALBUM]);
    }

    #[test]
    fn knows_what_each_card_asks_for() {
        assert_eq!(CardKind::Sle5528.secret_label(), "PSC");
        assert_eq!(CardKind::Sle5528.default_secret(), "FFFF");
        assert_eq!(CardKind::Acos3.secret_label(), "PIN");
        assert_eq!(CardKind::Acos3.default_secret(), "ACOSTEST");
    }

    #[test]
    fn identifies_cards_by_atr() {
        assert_eq!(CardKind::from_atr(SLE5528_ATR), Some(CardKind::Sle5528));
        assert_eq!(CardKind::from_atr(ACOS3_ATR), Some(CardKind::Acos3));
        // A contactless tag's ATR is none of ours; nfc.rs handles those.
        assert_eq!(
            CardKind::from_atr(&[
                0x3B, 0x8F, 0x80, 0x01, 0x80, 0x4F, 0x0C, 0xA0, 0x00, 0x00, 0x03, 0x06, 0x03, 0x00,
                0x01, 0x00, 0x00, 0x00, 0x00, 0x6A,
            ]),
            None
        );
    }
}

#[cfg(test)]
mod hardware {
    use super::*;
    use pcsc::{Context, Protocols, Scope, ShareMode};

    /// Connect to whatever contact card is in a reader, T=0/T=1 then RAW.
    fn open() -> Option<(pcsc::Card, CardKind)> {
        let ctx = Context::establish(Scope::User).ok()?;
        let mut buf = [0u8; 4096];
        let readers: Vec<String> = ctx
            .list_readers(&mut buf)
            .ok()?
            .map(|r| r.to_string_lossy().into_owned())
            .collect();
        for r in readers {
            let Ok(name) = std::ffi::CString::new(r.as_str()) else {
                continue;
            };
            let card = match ctx.connect(&name, ShareMode::Shared, Protocols::ANY) {
                Ok(c) => c,
                Err(PcscError::UnresponsiveCard | PcscError::ProtoMismatch) => {
                    match ctx.connect(&name, ShareMode::Shared, Protocols::RAW) {
                        Ok(c) => c,
                        Err(_) => continue,
                    }
                }
                Err(_) => continue,
            };
            let atr = card.status2_owned().ok()?.atr().to_vec();
            if let Some(kind) = CardKind::from_atr(&atr) {
                println!("reader {r}: {}", kind.label());
                return Some((card, kind));
            }
        }
        None
    }

    /// Write through the shipping path, then read back.
    ///
    /// Gated on ROCKSKY_CARD_SECRET so a plain `--ignored` run can never submit
    /// a code: a wrong one costs the card a retry attempt, and enough of them
    /// block it. ROCKSKY_CARD_URI defaults to whatever the card already holds,
    /// so the default run proves the path without changing what the card means.
    ///
    ///     ROCKSKY_CARD_SECRET=ACOSTEST cargo test -p rocksky-desktop --lib \
    ///       cards -- --ignored --nocapture write_contact
    #[test]
    #[ignore = "needs a contact card, and ROCKSKY_CARD_SECRET to submit its code"]
    fn write_contact_card() {
        let Ok(secret) = std::env::var("ROCKSKY_CARD_SECRET") else {
            println!("ROCKSKY_CARD_SECRET unset — not submitting any code");
            return;
        };
        let Some((mut card, kind)) = open() else {
            println!("no SLE/ACOS card in any reader");
            return;
        };

        let existing = read_back(&mut card, kind);
        println!("  before: {existing:?}");
        let uri = std::env::var("ROCKSKY_CARD_URI")
            .ok()
            .or_else(|| existing.first().cloned())
            .expect("card is blank — pass ROCKSKY_CARD_URI");
        let fallback = std::env::var("ROCKSKY_CARD_FALLBACK").unwrap_or_else(|_| {
            "rocksky://library/playlist/7656cb14-6e6d-4edb-8cbb-7cc046bfd0ec".into()
        });

        println!("  writing: {uri}");
        crate::nfc::write_contact_card(&mut card, kind, &[&uri, &fallback], Some(&secret))
            .expect("write failed");

        let after = read_back(&mut card, kind);
        println!("  after:  {after:?}");
        assert_eq!(after.first().map(String::as_str), Some(uri.as_str()));
    }

    fn read_back(card: &mut pcsc::Card, kind: CardKind) -> Vec<String> {
        let data = match kind {
            CardKind::Sle5528 => {
                sle::select_type(card).expect("select type");
                sle::read(card, SLE_DATA_OFFSET, 128).expect("read")
            }
            CardKind::Acos3 => {
                let tx = card
                    .transaction2()
                    .map_err(|(_, e)| e)
                    .expect("transaction");
                acos::select_file(&tx, &ACOS_USER_FILE).expect("select FF04");
                let reclen = acos::record_len(&tx).expect("record length");
                acos::read_records(&tx, 0, reclen, None).expect("read records")
            }
        };
        decode_payloads(&data)
    }

    /// Read whatever is on the card. Touches nothing, submits no code, so it
    /// can never cost a retry attempt.
    ///
    ///     cargo test -p rocksky-desktop --lib cards -- --ignored --nocapture read_contact
    #[test]
    #[ignore = "needs a contact reader with an SLE or ACOS card"]
    fn read_contact_card() {
        let Some((mut card, kind)) = open() else {
            println!("no SLE/ACOS card in any reader");
            return;
        };
        let data = match kind {
            CardKind::Sle5528 => {
                sle::select_type(&card).expect("select type");
                sle::read(&card, SLE_DATA_OFFSET, 128).expect("read")
            }
            CardKind::Acos3 => {
                let tx = card
                    .transaction2()
                    .map_err(|(_, e)| e)
                    .expect("transaction");
                acos::select_file(&tx, &ACOS_USER_FILE).expect("select FF04");
                let reclen = acos::record_len(&tx).expect("record length");
                let count = acos::record_count(&tx, reclen).expect("record count");
                println!(
                    "  file FF04: {count} records x {reclen} bytes = {} bytes",
                    count * reclen
                );
                acos::read_records(&tx, 0, reclen, None).expect("read records")
            }
        };
        println!(
            "  first 48 bytes: {}",
            data.iter()
                .take(48)
                .map(|b| format!("{b:02X}"))
                .collect::<Vec<_>>()
                .join(" ")
        );
        println!("  decoded: {:?}", decode_payloads(&data));
    }
}
