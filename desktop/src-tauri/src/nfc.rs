//! NFC tags as physical shortcuts to an album or a playlist.
//!
//! A tag holds one NDEF URI record — `rocksky://library/album/<id>` or
//! `rocksky://library/playlist/<id>` — which the webview resolves against the
//! Navidrome library and plays. `at://` URIs are accepted on read too, so a tag
//! written elsewhere (the mobile app, a phone's tag writer) still works.
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
    /// The URI stored in the tag's NDEF record.
    payload: String,
    /// Tag UID, hex — lets the UI tell two taps of the same tag apart.
    uid: String,
}

// ── Handle ──────────────────────────────────────────────────────────────────

enum Cmd {
    Write {
        payload: String,
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
#[tauri::command]
pub async fn nfc_write(app: AppHandle, payload: String) -> Result<String, String> {
    let payload = payload.trim().to_string();
    if payload.is_empty() {
        return Err("nothing to write".into());
    }

    let (reply, done) = channel();
    app.state::<Nfc>()
        .tx
        .send(Cmd::Write { payload, reply })
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
    payload: String,
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
                Ok(Cmd::Write { payload, reply }) => {
                    if let Some(prev) = pending.replace(Pending { payload, reply }) {
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
                let result = write_ndef(&card, &job.payload).map(|_| uid.clone());
                match &result {
                    Ok(_) => tracing::info!("nfc: wrote {} to tag {uid}", job.payload),
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
                    match read_ndef_uri(&card) {
                        Ok(Some(payload)) => {
                            tracing::info!("nfc: tag {uid} → {payload}");
                            let _ = app.emit("nfc://scan", ScanEvent { payload, uid: uid.clone() });
                        }
                        Ok(None) => tracing::debug!("nfc: tag {uid} holds no NDEF URI record"),
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
        return Err(format!("tag rejected the command (SW {:02X}{:02X})", sw[0], sw[1]));
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

/// One NDEF URI record wrapped in a Type 2 NDEF TLV, padded to whole pages.
fn encode_ndef_uri(uri: &str) -> Vec<u8> {
    // Longest match wins, so "https://www." beats "https://".
    let (code, rest) = URI_PREFIXES
        .iter()
        .enumerate()
        .skip(1)
        .filter(|(_, p)| uri.starts_with(*p))
        .max_by_key(|(_, p)| p.len())
        .map(|(i, p)| (i as u8, &uri[p.len()..]))
        .unwrap_or((0, uri));

    let mut payload = vec![code];
    payload.extend_from_slice(rest.as_bytes());

    // MB|ME|SR|TNF=1 (well known), type "U".
    let mut record = vec![0xD1, 0x01, payload.len() as u8, b'U'];
    record.extend_from_slice(&payload);

    let mut tlv = vec![0x03];
    if record.len() < 0xFF {
        tlv.push(record.len() as u8);
    } else {
        tlv.push(0xFF);
        tlv.extend_from_slice(&(record.len() as u16).to_be_bytes());
    }
    tlv.extend_from_slice(&record);
    tlv.push(0xFE); // terminator
    while tlv.len() % PAGE_LEN != 0 {
        tlv.push(0x00);
    }
    tlv
}

fn write_ndef(card: &Card, uri: &str) -> Result<(), String> {
    let bytes = encode_ndef_uri(uri);
    let room = capacity(card);
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
    Ok(())
}

/// Pull the first URI record out of the tag's NDEF message.
fn read_ndef_uri(card: &Card) -> Result<Option<String>, String> {
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
        return Ok(None);
    };
    Ok(first_uri_record(message))
}

/// Walk the TLV chain and return the NDEF message's bytes.
fn find_ndef_tlv(data: &[u8]) -> Option<&[u8]> {
    let mut i = 0;
    while i < data.len() {
        match data[i] {
            0x00 => i += 1,             // NULL padding
            0xFE => return None,        // terminator
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

/// Decode the first well-known URI record in an NDEF message. Only short
/// records are handled — a tag we wrote is always one, and a foreign tag whose
/// link needs a 32-bit length is not something this app can play.
fn first_uri_record(message: &[u8]) -> Option<String> {
    let mut i = 0;
    while i + 3 <= message.len() {
        let flags = message[i];
        let short = flags & 0x10 != 0;
        let il = flags & 0x08 != 0;
        let type_len = message[i + 1] as usize;

        let (payload_len, mut cursor) = if short {
            (message[i + 2] as usize, i + 3)
        } else {
            let bytes = message.get(i + 2..i + 6)?;
            (
                u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize,
                i + 6,
            )
        };
        if il {
            cursor += 1 + *message.get(cursor)? as usize;
        }

        let rec_type = message.get(cursor..cursor + type_len)?;
        cursor += type_len;
        let payload = message.get(cursor..cursor + payload_len)?;

        // TNF 1 (well known) + type "U".
        if flags & 0x07 == 0x01 && rec_type == b"U" && !payload.is_empty() {
            let prefix = URI_PREFIXES.get(payload[0] as usize).copied().unwrap_or("");
            return Some(format!(
                "{prefix}{}",
                String::from_utf8_lossy(&payload[1..])
            ));
        }

        if flags & 0x40 != 0 {
            return None; // ME: last record
        }
        i = cursor + payload_len;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(uri: &str) -> Option<String> {
        let tlv = encode_ndef_uri(uri);
        first_uri_record(find_ndef_tlv(&tlv)?)
    }

    #[test]
    fn roundtrips_the_uris_we_write() {
        for uri in [
            "rocksky://library/album/abc123",
            "rocksky://library/playlist/9f8e7d",
            "at://did:plc:7iza6de2dwap2sbkpav7c6c6/app.rocksky.playlist/3lbqwxyz1234",
        ] {
            assert_eq!(roundtrip(uri).as_deref(), Some(uri));
        }
    }

    #[test]
    fn abbreviates_known_prefixes() {
        // 0x03 len | D1 01 len 'U' | prefix code
        let tlv = encode_ndef_uri("https://rocksky.app");
        assert_eq!(tlv[6], 0x04, "https:// should compress to prefix code 4");
        assert_eq!(roundtrip("https://rocksky.app").as_deref(), Some("https://rocksky.app"));
    }

    /// The CLI writes tags too (apps/cli/src/lib/nfc.ts). A tag written there
    /// has to read here and vice versa, so both encoders are pinned to the same
    /// bytes — a change on one side fails this before it reaches a tag.
    #[test]
    fn matches_the_cli_encoder_byte_for_byte() {
        let hex = |uri: &str| {
            encode_ndef_uri(uri)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        };
        assert_eq!(
            hex("rocksky://library/album/abc123"),
            "0323d1011f5500726f636b736b793a2f2f6c6962726172792f616c62756d2f616263313233fe0000"
        );
        assert_eq!(
            hex("rocksky://library/playlist/9f8e7d"),
            "0326d101225500726f636b736b793a2f2f6c6962726172792f706c61796c6973742f396638653764fe000000"
        );
        assert_eq!(hex("https://rocksky.app"), "0310d1010c5504726f636b736b792e617070fe00");
    }

    #[test]
    fn writes_whole_pages() {
        assert_eq!(encode_ndef_uri("rocksky://library/album/abc").len() % PAGE_LEN, 0);
    }
}
