//! NFC tags as physical shortcuts to an album or a playlist.
//!
//! A tag holds NDEF URI records, which the webview resolves against the
//! Navidrome library and plays. The first record is the album's or playlist's
//! `at://` record URI, which resolves anywhere; the second is a
//! `rocksky://library/<kind>/<id>` link to this server's own id, tried only
//! when the first doesn't resolve. Either form is accepted alone, so a tag
//! written elsewhere — the mobile app, a phone's tag writer, an older build —
//! still works, and so does one written here on a tag too small for both.
//!
//! The reader is driven through PC/SC, which is the only transport that is
//! native on all three desktops (macOS CryptoTokenKit, pcsclite, WinSCard) and
//! the one every ACS/CCID reader speaks. Tag I/O uses the ACS pseudo-APDUs
//! (`FF B0` read, `FF D6` write) that those readers expose for NFC Forum
//! Type 2 tags — NTAG213/215/216 and MIFARE Ultralight.
//!
//! `pcsc` is a blocking C API, so it is confined to one worker thread: the
//! thread polls for a tag, emits `nfc://scan` when one is tapped, and performs
//! writes handed to it over a channel. Everything else here is a `Send + Sync`
//! handle over that channel.

use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use pcsc::{Card, Context, Disposition, Protocols, Scope, ShareMode};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// How long a write waits for the user to tap a tag before giving up.
const WRITE_TIMEOUT: Duration = Duration::from_secs(30);
/// Poll interval of the worker loop. Fast enough that a tap feels instant,
/// slow enough that an idle reader costs nothing.
const POLL: Duration = Duration::from_millis(250);
/// Ignore repeat reads of the same tag for this long. A tag left on the reader
/// is seen on every tick, and each one would restart playback.
const RESCAN_COOLDOWN: Duration = Duration::from_secs(3);

/// Type 2 tag user memory starts here; pages 0–3 are UID, lock bytes and the
/// capability container.
const FIRST_DATA_PAGE: u8 = 4;
const PAGE_LEN: usize = 4;

// ── Public shapes ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NfcStatus {
    /// A PC/SC service was reachable. False on a machine with no smartcard
    /// stack at all (e.g. a Linux box without pcscd running).
    pub available: bool,
    /// Connected reader names, as PC/SC reports them.
    pub readers: Vec<String>,
    /// A tag is sitting on a reader right now.
    pub card_present: bool,
    /// Why the reader is unusable, when it is.
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanEvent {
    /// The URIs stored in the tag's NDEF records, in tag order. The first is
    /// what should play; any after it are fallbacks for when it won't resolve.
    payloads: Vec<String>,
    /// Tag UID, hex — lets the UI tell two taps of the same tag apart.
    uid: String,
}

// ── Handle ──────────────────────────────────────────────────────────────────

enum Cmd {
    Write {
        payloads: Vec<String>,
        reply: Sender<Result<String, String>>,
    },
    CancelWrite,
}

/// The Tauri-state handle onto the reader thread.
pub struct Nfc {
    tx: Sender<Cmd>,
    status: Arc<Mutex<NfcStatus>>,
}

impl Nfc {
    pub fn start(app: &AppHandle) -> Self {
        let (tx, rx) = channel();
        let status = Arc::new(Mutex::new(NfcStatus::default()));

        let app = app.clone();
        let shared = status.clone();
        std::thread::Builder::new()
            .name("rocksky-nfc".into())
            .spawn(move || worker(app, rx, shared))
            .ok();

        Self { tx, status }
    }
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn nfc_status(state: tauri::State<'_, Nfc>) -> NfcStatus {
    state.status.lock().unwrap().clone()
}

/// Arm a write and wait for the user to tap a tag. Resolves with the tag UID.
///
/// `payloads` becomes one NDEF record each, in order — the URI that should play
/// first, then any fallbacks.
#[tauri::command]
pub async fn nfc_write(app: AppHandle, payloads: Vec<String>) -> Result<String, String> {
    let payloads: Vec<String> = payloads
        .into_iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    if payloads.is_empty() {
        return Err("nothing to write".into());
    }

    let (reply, done) = channel();
    app.state::<Nfc>()
        .tx
        .send(Cmd::Write { payloads, reply })
        .map_err(|_| "the NFC reader is not running".to_string())?;

    // `done.recv_timeout` blocks, so it cannot run on the async runtime.
    tauri::async_runtime::spawn_blocking(move || match done.recv_timeout(WRITE_TIMEOUT) {
        Ok(result) => result,
        Err(RecvTimeoutError::Timeout) => Err("timed out waiting for a tag".into()),
        Err(RecvTimeoutError::Disconnected) => Err("the NFC reader stopped".into()),
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Disarm a pending write (the user closed the "tap a tag" dialog).
#[tauri::command]
pub fn nfc_cancel_write(state: tauri::State<'_, Nfc>) -> Result<(), String> {
    state
        .tx
        .send(Cmd::CancelWrite)
        .map_err(|_| "the NFC reader is not running".to_string())
}

// ── Worker ──────────────────────────────────────────────────────────────────

struct Pending {
    payloads: Vec<String>,
    reply: Sender<Result<String, String>>,
}

fn worker(app: AppHandle, rx: Receiver<Cmd>, status: Arc<Mutex<NfcStatus>>) {
    let mut pending: Option<Pending> = None;
    let mut last_scan: Option<(String, Instant)> = None;
    let mut ctx: Option<Context> = None;

    loop {
        // Drain queued commands first so a write arms before this tick's poll.
        loop {
            match rx.try_recv() {
                Ok(Cmd::Write { payloads, reply }) => {
                    if let Some(prev) = pending.replace(Pending { payloads, reply }) {
                        let _ = prev.reply.send(Err("superseded by another write".into()));
                    }
                }
                Ok(Cmd::CancelWrite) => {
                    if let Some(prev) = pending.take() {
                        let _ = prev.reply.send(Err("cancelled".into()));
                    }
                }
                Err(TryRecvError::Empty) => break,
                // Every handle dropped: the app is shutting down.
                Err(TryRecvError::Disconnected) => return,
            }
        }

        // The context dies when the PC/SC service restarts (or when the last
        // reader is unplugged on some stacks), so re-establish on demand.
        if ctx.is_none() {
            match Context::establish(Scope::User) {
                Ok(c) => ctx = Some(c),
                Err(e) => {
                    publish(
                        &app,
                        &status,
                        NfcStatus {
                            available: false,
                            error: Some(format!("PC/SC unavailable: {e}")),
                            ..Default::default()
                        },
                    );
                    std::thread::sleep(Duration::from_secs(3));
                    continue;
                }
            }
        }
        let context = ctx.as_ref().unwrap();

        let readers = match list_readers(context) {
            Ok(r) => r,
            Err(e) => {
                tracing::debug!("nfc: reader enumeration failed: {e}");
                ctx = None;
                continue;
            }
        };

        let mut card_present = false;
        for reader in &readers {
            let card = match context.connect(
                &std::ffi::CString::new(reader.as_str()).unwrap(),
                ShareMode::Shared,
                Protocols::ANY,
            ) {
                Ok(card) => card,
                // No tag on this reader — by far the common case.
                Err(_) => continue,
            };
            card_present = true;

            let uid = read_uid(&card).unwrap_or_default();

            if let Some(job) = pending.take() {
                let uris: Vec<&str> = job.payloads.iter().map(String::as_str).collect();
                let result = write_ndef(&card, &uris).map(|written| {
                    if written < uris.len() {
                        tracing::warn!(
                            "nfc: tag {uid} only had room for {written} of {} records; \
                             wrote {:?} without its fallback",
                            uris.len(),
                            &uris[..written]
                        );
                    }
                    uid.clone()
                });
                match &result {
                    Ok(_) => tracing::info!("nfc: wrote {:?} to tag {uid}", job.payloads),
                    Err(e) => tracing::warn!("nfc: write failed: {e}"),
                }
                let _ = job.reply.send(result);
                // A written tag is still on the reader; don't immediately scan
                // it back and start playing.
                last_scan = Some((uid, Instant::now()));
            } else {
                let fresh = match &last_scan {
                    Some((prev, at)) => *prev != uid || at.elapsed() > RESCAN_COOLDOWN,
                    None => true,
                };
                if fresh {
                    match read_ndef_uris(&card) {
                        Ok(payloads) if !payloads.is_empty() => {
                            tracing::info!("nfc: tag {uid} → {payloads:?}");
                            let _ = app.emit(
                                "nfc://scan",
                                ScanEvent {
                                    payloads,
                                    uid: uid.clone(),
                                },
                            );
                        }
                        Ok(_) => tracing::debug!("nfc: tag {uid} holds no NDEF URI record"),
                        Err(e) => tracing::debug!("nfc: read failed: {e}"),
                    }
                    last_scan = Some((uid, Instant::now()));
                }
            }

            let _ = card.disconnect(Disposition::LeaveCard);
            break;
        }

        // Forget the last tag once it leaves, so re-tapping it plays again
        // without waiting out the cooldown.
        if !card_present {
            last_scan = None;
        }

        publish(
            &app,
            &status,
            NfcStatus {
                available: true,
                readers,
                card_present,
                error: None,
            },
        );

        std::thread::sleep(POLL);
    }
}

fn list_readers(ctx: &Context) -> Result<Vec<String>, pcsc::Error> {
    let mut buf = vec![0u8; 4096];
    Ok(ctx
        .list_readers(&mut buf)?
        .map(|r| r.to_string_lossy().into_owned())
        .collect())
}

/// Store the status and tell the webview, but only when something changed —
/// this runs four times a second.
fn publish(app: &AppHandle, cell: &Arc<Mutex<NfcStatus>>, next: NfcStatus) {
    let mut slot = cell.lock().unwrap();
    let changed = slot.available != next.available
        || slot.card_present != next.card_present
        || slot.readers != next.readers
        || slot.error != next.error;
    *slot = next.clone();
    drop(slot);
    if changed {
        let _ = app.emit("nfc://status", next);
    }
}

// ── Tag I/O ─────────────────────────────────────────────────────────────────

fn transmit(card: &Card, apdu: &[u8]) -> Result<Vec<u8>, String> {
    let mut buf = [0u8; 264];
    let res = card
        .transmit(apdu, &mut buf)
        .map_err(|e| format!("reader error: {e}"))?;
    if res.len() < 2 {
        return Err("truncated response from reader".into());
    }
    let (data, sw) = res.split_at(res.len() - 2);
    if sw != [0x90, 0x00] {
        return Err(format!(
            "tag rejected the command (SW {:02X}{:02X})",
            sw[0], sw[1]
        ));
    }
    Ok(data.to_vec())
}

fn read_uid(card: &Card) -> Result<String, String> {
    let uid = transmit(card, &[0xFF, 0xCA, 0x00, 0x00, 0x00])?;
    Ok(uid.iter().map(|b| format!("{b:02X}")).collect())
}

/// Read `count` pages starting at `page`. Readers cap a single read at 16
/// bytes, so this chunks by four pages.
fn read_pages(card: &Card, page: u8, count: u8) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(count as usize * PAGE_LEN);
    let mut at = page;
    let mut left = count;
    while left > 0 {
        let chunk = left.min(4);
        let bytes = transmit(card, &[0xFF, 0xB0, 0x00, at, chunk * PAGE_LEN as u8])?;
        out.extend_from_slice(&bytes);
        left -= chunk;
        // A tag whose CC claims more memory than a page number can address.
        match at.checked_add(chunk) {
            Some(next) => at = next,
            None => break,
        }
    }
    Ok(out)
}

fn write_page(card: &Card, page: u8, data: &[u8]) -> Result<(), String> {
    let mut apdu = vec![0xFF, 0xD6, 0x00, page, PAGE_LEN as u8];
    apdu.extend_from_slice(data);
    transmit(card, &apdu).map(|_| ())
}

/// User-memory size in bytes, from the capability container (page 3, byte 2,
/// in units of 8 bytes). Falls back to the NTAG213 size when the CC is absent
/// or nonsensical — the write then fails cleanly on the first bad page rather
/// than trusting a wild number.
fn capacity(card: &Card) -> usize {
    match read_pages(card, 3, 1) {
        Ok(cc) if cc.len() >= 3 && cc[0] == 0xE1 && cc[2] > 0 => cc[2] as usize * 8,
        _ => 144,
    }
}

// ── NDEF ────────────────────────────────────────────────────────────────────

/// NDEF URI abbreviations (NFC Forum URI RTD, table 6), in code order. Index 0
/// is "no prefix" and is what `rocksky://` and `at://` use.
const URI_PREFIXES: [&str; 36] = [
    "",
    "http://www.",
    "https://www.",
    "http://",
    "https://",
    "tel:",
    "mailto:",
    "ftp://anonymous:anonymous@",
    "ftp://ftp.",
    "ftps://",
    "sftp://",
    "smb://",
    "nfs://",
    "ftp://",
    "dav://",
    "news:",
    "telnet://",
    "imap:",
    "rtsp://",
    "urn:",
    "pop:",
    "sip:",
    "sips:",
    "tftp:",
    "btspp://",
    "btl2cap://",
    "btgoep://",
    "tcpobex://",
    "irdaobex://",
    "file://",
    "urn:epc:id:",
    "urn:epc:tag:",
    "urn:epc:pat:",
    "urn:epc:raw:",
    "urn:epc:",
    "urn:nfc:",
];

/// The URI's abbreviation code and the remainder that follows it.
/// Longest match wins, so "https://www." beats "https://".
fn abbreviate(uri: &str) -> (u8, &str) {
    URI_PREFIXES
        .iter()
        .enumerate()
        .skip(1)
        .filter(|(_, p)| uri.starts_with(*p))
        .max_by_key(|(_, p)| p.len())
        .map(|(i, p)| (i as u8, &uri[p.len()..]))
        .unwrap_or((0, uri))
}

/// NDEF URI records wrapped in a Type 2 NDEF TLV, padded to whole pages.
///
/// Order carries meaning: a reader tries the records front to back, so the
/// portable record URI goes first and the library-id fallback second. A reader
/// that only looks at the first record — an older build, a phone — sees exactly
/// the single-record tag it would have seen before, which is why the fallback
/// is a second record rather than something bolted onto the first URI.
fn encode_ndef_uris(uris: &[&str]) -> Vec<u8> {
    let mut records = Vec::new();
    for (i, uri) in uris.iter().enumerate() {
        let (code, rest) = abbreviate(uri);
        let mut payload = vec![code];
        payload.extend_from_slice(rest.as_bytes());

        // SR|TNF=1 (well known), plus MB on the first record and ME on the
        // last — both on a lone record, which is the 0xD1 tags carried before.
        let mut flags = 0x11u8;
        if i == 0 {
            flags |= 0x80;
        }
        if i + 1 == uris.len() {
            flags |= 0x40;
        }

        records.extend_from_slice(&[flags, 0x01, payload.len() as u8, b'U']);
        records.extend_from_slice(&payload);
    }

    let mut tlv = vec![0x03];
    if records.len() < 0xFF {
        tlv.push(records.len() as u8);
    } else {
        tlv.push(0xFF);
        tlv.extend_from_slice(&(records.len() as u16).to_be_bytes());
    }
    tlv.extend_from_slice(&records);
    tlv.push(0xFE); // terminator
    while tlv.len() % PAGE_LEN != 0 {
        tlv.push(0x00);
    }
    tlv
}

/// Writes as many of `uris` as the tag has room for, and reports how many stuck.
///
/// Trailing records are dropped rather than failing the write: the first record
/// is the one that plays and the rest only matter if it stops resolving, so a
/// small tag is better off with a working shortcut than with no tag at all.
fn write_ndef(card: &Card, uris: &[&str]) -> Result<usize, String> {
    let room = capacity(card);
    let mut take = uris.len();
    while take > 1 && encode_ndef_uris(&uris[..take]).len() > room {
        take -= 1;
    }

    let bytes = encode_ndef_uris(&uris[..take]);
    if bytes.len() > room {
        return Err(format!(
            "this tag holds {room} bytes; the link needs {}. Use an NTAG215 or larger.",
            bytes.len()
        ));
    }
    for (i, chunk) in bytes.chunks(PAGE_LEN).enumerate() {
        let page = u8::try_from(i)
            .ok()
            .and_then(|i| FIRST_DATA_PAGE.checked_add(i))
            .ok_or("the link is longer than this tag can address")?;
        write_page(card, page, chunk)?;
    }
    Ok(take)
}

/// Pull every URI record out of the tag's NDEF message, in tag order.
fn read_ndef_uris(card: &Card) -> Result<Vec<String>, String> {
    // Read the whole user memory in one sweep: TLVs before the NDEF one (lock
    // and memory control) push the message to an offset we can't predict.
    let pages = (capacity(card) / PAGE_LEN).min(256) as u16;
    let mut data = Vec::new();
    let mut page = FIRST_DATA_PAGE;
    let mut left = pages;
    while left > 0 {
        let chunk = left.min(4) as u8;
        match read_pages(card, page, chunk) {
            Ok(bytes) => data.extend_from_slice(&bytes),
            // Reading past the end of a smaller tag than the CC advertised.
            Err(_) => break,
        }
        page = match page.checked_add(chunk) {
            Some(p) => p,
            None => break,
        };
        left -= chunk as u16;
    }

    let Some(message) = find_ndef_tlv(&data) else {
        return Ok(Vec::new());
    };
    Ok(uri_records(message))
}

/// Walk the TLV chain and return the NDEF message's bytes.
fn find_ndef_tlv(data: &[u8]) -> Option<&[u8]> {
    let mut i = 0;
    while i < data.len() {
        match data[i] {
            0x00 => i += 1,      // NULL padding
            0xFE => return None, // terminator
            tag => {
                let (len, header) = match data.get(i + 1)? {
                    0xFF => (
                        u16::from_be_bytes([*data.get(i + 2)?, *data.get(i + 3)?]) as usize,
                        4,
                    ),
                    n => (*n as usize, 2),
                };
                let start = i + header;
                let end = start.checked_add(len)?;
                if end > data.len() {
                    return None;
                }
                if tag == 0x03 {
                    return Some(&data[start..end]);
                }
                i = end;
            }
        }
    }
    None
}

/// Decode every well-known URI record in an NDEF message, in order. Only short
/// records are handled — a tag we wrote is always one, and a foreign tag whose
/// link needs a 32-bit length is not something this app can play.
///
/// A malformed record ends the walk and keeps whatever came before it: the
/// first record is the one that plays, so a damaged fallback must not cost the
/// caller the good record ahead of it.
fn uri_records(message: &[u8]) -> Vec<String> {
    let mut uris = Vec::new();
    let mut i = 0;
    while i + 3 <= message.len() {
        let flags = message[i];
        let short = flags & 0x10 != 0;
        let il = flags & 0x08 != 0;
        let type_len = message[i + 1] as usize;

        let (payload_len, mut cursor) = if short {
            (message[i + 2] as usize, i + 3)
        } else {
            let Some(bytes) = message.get(i + 2..i + 6) else {
                break;
            };
            (
                u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize,
                i + 6,
            )
        };
        if il {
            let Some(id_len) = message.get(cursor) else {
                break;
            };
            cursor += 1 + *id_len as usize;
        }

        let Some(rec_type) = message.get(cursor..cursor + type_len) else {
            break;
        };
        cursor += type_len;
        let Some(payload) = message.get(cursor..cursor + payload_len) else {
            break;
        };

        // TNF 1 (well known) + type "U".
        if flags & 0x07 == 0x01 && rec_type == b"U" && !payload.is_empty() {
            let prefix = URI_PREFIXES.get(payload[0] as usize).copied().unwrap_or("");
            uris.push(format!(
                "{prefix}{}",
                String::from_utf8_lossy(&payload[1..])
            ));
        }

        if flags & 0x40 != 0 {
            break; // ME: last record
        }
        i = cursor + payload_len;
    }
    uris
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip_all(uris: &[&str]) -> Vec<String> {
        let tlv = encode_ndef_uris(uris);
        find_ndef_tlv(&tlv).map(uri_records).unwrap_or_default()
    }

    fn roundtrip(uri: &str) -> Option<String> {
        roundtrip_all(&[uri]).into_iter().next()
    }

    #[test]
    fn roundtrips_the_uris_we_write() {
        for uri in [
            // What tags carry now: the record URI, which is portable.
            "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlkzzimck2k",
            "at://did:plc:7iza6de2dwap2sbkpav7c6c6/app.rocksky.playlist/3lbqwxyz1234",
            // The legacy library-id form, still read so old tags keep working.
            "rocksky://library/album/abc123",
            "rocksky://library/playlist/9f8e7d",
        ] {
            assert_eq!(roundtrip(uri).as_deref(), Some(uri));
        }
    }

    #[test]
    fn abbreviates_known_prefixes() {
        // 0x03 len | D1 01 len 'U' | prefix code
        let tlv = encode_ndef_uris(&["https://rocksky.app"]);
        assert_eq!(tlv[6], 0x04, "https:// should compress to prefix code 4");
        assert_eq!(
            roundtrip("https://rocksky.app").as_deref(),
            Some("https://rocksky.app")
        );
    }

    /// A tag carries the record URI and the library-id fallback, in that order.
    #[test]
    fn roundtrips_a_uri_with_its_fallback() {
        let uris = [
            "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlkzzimck2k",
            "rocksky://library/album/rec_9f8e7d",
        ];
        assert_eq!(roundtrip_all(&uris), uris);
    }

    /// The message-begin and message-end flags have to land on the right
    /// records, or a conforming reader rejects the whole message.
    #[test]
    fn flags_mark_the_first_and_last_record() {
        let one = encode_ndef_uris(&["rocksky://library/album/a"]);
        assert_eq!(one[2], 0xD1, "a lone record is both first and last");

        let two = encode_ndef_uris(&["at://d/app.rocksky.album/r", "rocksky://library/album/a"]);
        assert_eq!(two[2], 0x91, "first record: MB, no ME");
        // 4-byte header + 1 prefix code + the URI itself.
        let second = 2 + 4 + 1 + "at://d/app.rocksky.album/r".len();
        assert_eq!(two[second], 0x51, "second record: ME, no MB");
    }

    /// A reader that stops at the first record — an older build, a phone —
    /// must see exactly what a single-record tag would have given it.
    #[test]
    fn first_record_is_unchanged_by_the_fallback() {
        let uri = "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlkzzimck2k";
        let with = roundtrip_all(&[uri, "rocksky://library/album/rec_9f8e7d"]);
        assert_eq!(with.first().map(String::as_str), Some(uri));
    }

    /// A damaged trailing record must not cost us the good one ahead of it.
    #[test]
    fn keeps_earlier_records_when_a_later_one_is_truncated() {
        let uri = "at://did:plc:abc/app.rocksky.album/3lhl";
        let mut tlv = encode_ndef_uris(&[uri, "rocksky://library/album/rec_9f8e7d"]);
        // Lop off the tail of the second record, mid-payload.
        tlv.truncate(tlv.len() - 12);
        let message = find_ndef_tlv(&tlv).unwrap_or(&tlv[2..]);
        assert_eq!(uri_records(message).first().map(String::as_str), Some(uri));
    }

    /// The CLI writes tags too (apps/cli/src/lib/nfc.ts). A tag written there
    /// has to read here and vice versa, so both encoders are pinned to the same
    /// bytes — a change on one side fails this before it reaches a tag.
    #[test]
    fn matches_the_cli_encoder_byte_for_byte() {
        let hex = |uris: &[&str]| {
            encode_ndef_uris(uris)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        };
        assert_eq!(
            hex(&[
                "at://did:plc:abc/app.rocksky.album/3lhl",
                "rocksky://library/album/abc123",
            ]),
            "034f910128550061743a2f2f6469643a706c633a6162632f6170702e726f636b736b792e616c62756d2f\
             336c686c51011f5500726f636b736b793a2f2f6c6962726172792f616c62756d2f616263313233fe0000"
        );
        assert_eq!(
            hex(&["rocksky://library/album/abc123"]),
            "0323d1011f5500726f636b736b793a2f2f6c6962726172792f616c62756d2f616263313233fe0000"
        );
        assert_eq!(
            hex(&["rocksky://library/playlist/9f8e7d"]),
            "0326d101225500726f636b736b793a2f2f6c6962726172792f706c61796c6973742f396638653764fe000000"
        );
        assert_eq!(
            hex(&["https://rocksky.app"]),
            "0310d1010c5504726f636b736b792e617070fe00"
        );
    }

    #[test]
    fn writes_whole_pages() {
        assert_eq!(
            encode_ndef_uris(&["rocksky://library/album/abc"]).len() % PAGE_LEN,
            0
        );
    }
}
