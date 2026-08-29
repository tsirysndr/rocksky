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
//! (`FF B0` read, `FF D6` write) those readers expose.
//!
//! Two tag families carry the same NDEF message over different protocols, and
//! the ATR says which is on the reader:
//!
//! - NFC Forum Type 2 (NTAG213/215/216, MIFARE Ultralight): 4-byte pages, read
//!   and written directly.
//! - MIFARE Classic: 16-byte blocks in 4-block sectors, each sector behind a key
//!   exchange, with NDEF mapped on per NXP AN1305. Sold as "NFC tags" as often
//!   as Type 2 ones, and the reason a write used to fail with SW 6300. A blank
//!   one is formatted on first write, which is what a phone does too.
//!
//! `hardware_roundtrip` in the tests below drives the whole thing against a real
//! reader; it is `#[ignore]`d, since it needs one.
//!
//! `pcsc` is a blocking C API, so it is confined to one worker thread: the
//! thread polls for a tag, emits `nfc://scan` when one is tapped, and performs
//! writes handed to it over a channel. Everything else here is a `Send + Sync`
//! handle over that channel.

use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::cards;
use pcsc::{Card, Context, Disposition, Protocols, Scope, ShareMode};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// How long a write waits for the user to tap a tag before giving up.
const WRITE_TIMEOUT: Duration = Duration::from_secs(30);
/// Poll interval of the worker loop. Fast enough that a tap feels instant,
/// slow enough that an idle reader costs nothing.
const POLL: Duration = Duration::from_millis(250);

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
    /// The contact card sitting in a reader, when there is one. Contactless
    /// tags leave this null: they need no secret, so the write dialog has
    /// nothing to ask for.
    pub card: Option<ContactCard>,
}

/// What the write dialog needs to know about an inserted contact card.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactCard {
    /// Human-readable, e.g. "SLE5528 memory card".
    pub label: String,
    /// What its secret is called — "PSC" or "PIN".
    pub secret_label: String,
    /// The factory default, offered as the prefilled value.
    pub default_secret: String,
}

impl From<cards::CardKind> for ContactCard {
    fn from(kind: cards::CardKind) -> Self {
        Self {
            label: kind.label().to_string(),
            secret_label: kind.secret_label().to_string(),
            default_secret: kind.default_secret().to_string(),
        }
    }
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
        /// The card's PSC or PIN, when it is a contact card that needs one.
        /// Contactless tags ignore it.
        secret: Option<String>,
        reply: Sender<Result<String, String>>,
    },
    CancelWrite,
    /// Forget which tag is on the reader, so a resident one is read again.
    Rescan,
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

/// The status cell, tolerating a poisoned lock.
///
/// A panic anywhere that holds this would otherwise poison it, and the next
/// `unwrap` would take the reader thread down with it — leaving an app that
/// silently never scans and whose writes all time out, with nothing in the log
/// to say why. The status is a plain snapshot; a torn one is not worth a dead
/// reader.
fn status_of(cell: &Mutex<NfcStatus>) -> std::sync::MutexGuard<'_, NfcStatus> {
    cell.lock().unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
pub fn nfc_status(state: tauri::State<'_, Nfc>) -> NfcStatus {
    status_of(&state.status).clone()
}

/// Arm a write and wait for the user to tap a tag. Resolves with the tag UID.
///
/// `payloads` becomes one NDEF record each, in order — the URI that should play
/// first, then any fallbacks.
#[tauri::command]
pub async fn nfc_write(
    app: AppHandle,
    payloads: Vec<String>,
    secret: Option<String>,
) -> Result<String, String> {
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
        .send(Cmd::Write {
            payloads,
            secret,
            reply,
        })
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

/// Read the tag on the reader again, even if it hasn't moved.
///
/// A tag is otherwise read once, when it arrives. That leaves a gap at startup:
/// the worker polls immediately, but `nfc://scan` is fire-and-forget, so a tag
/// already sitting on the reader is read and emitted before the webview has
/// subscribed — and never again, because it never left. The listener calls this
/// once it is actually listening.
#[tauri::command]
pub fn nfc_rescan(state: tauri::State<'_, Nfc>) -> Result<(), String> {
    state
        .tx
        .send(Cmd::Rescan)
        .map_err(|_| "the NFC reader is not running".to_string())
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
    secret: Option<String>,
    reply: Sender<Result<String, String>>,
}

fn worker(app: AppHandle, rx: Receiver<Cmd>, status: Arc<Mutex<NfcStatus>>) {
    let mut pending: Option<Pending> = None;
    let mut last_scan: Option<String> = None;
    // Contact cards, keyed by reader: what was last handled in each. Separate
    // from `last_scan` because they arrive on their own reader and identify
    // differently — by ATR, having no UID to read.
    let mut contact_scanned: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut ctx: Option<Context> = None;

    loop {
        // Drain queued commands first so a write arms before this tick's poll.
        loop {
            match rx.try_recv() {
                Ok(Cmd::Write {
                    payloads,
                    secret,
                    reply,
                }) => {
                    tracing::info!(
                        "nfc: write armed ({} records), waiting for a card",
                        payloads.len()
                    );
                    if let Some(prev) = pending.replace(Pending {
                        payloads,
                        secret,
                        reply,
                    }) {
                        let _ = prev.reply.send(Err("superseded by another write".into()));
                    }
                }
                Ok(Cmd::CancelWrite) => {
                    if let Some(prev) = pending.take() {
                        let _ = prev.reply.send(Err("cancelled".into()));
                    }
                }
                // Both slots: a contact card resting in its reader is read once
                // on insertion exactly as a tag is, so it has the same startup
                // gap — read and emitted before the webview subscribed, and
                // never again because it never left.
                Ok(Cmd::Rescan) => {
                    last_scan = None;
                    contact_scanned.clear();
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
                // Sleep before retrying: `continue` re-establishes the context
                // at the top, and without this a persistently failing
                // enumeration would spin the thread at 100% CPU.
                std::thread::sleep(POLL);
                continue;
            }
        };

        // Any reader holding anything — drives the status light.
        let mut card_present = false;
        // Specifically a contactless tag. Kept apart because it is what decides
        // whether the tag we last scanned has gone: with a contact reader also
        // plugged in, a card inserted there would otherwise look like the tag
        // still being present and suppress removal entirely.
        let mut tag_present = false;
        let mut context_died = false;
        let mut contact_card: Option<ContactCard> = None;
        for reader in &readers {
            // A reader name is whatever the driver reports. Skipping one we
            // can't turn into a C string beats taking the whole thread down.
            let Ok(name) = std::ffi::CString::new(reader.as_str()) else {
                tracing::warn!("nfc: skipping reader with an unusable name: {reader:?}");
                continue;
            };
            let mut card = match context.connect(&name, ShareMode::Shared, Protocols::ANY) {
                Ok(card) => card,
                // An empty reader is the common case and the only one worth
                // passing over quietly. The rest mean this context is finished —
                // the daemon restarted, the handle went stale, the reader was
                // yanked — and retrying on it forever would leave the app
                // silently dead: no scans, and armed writes timing out with the
                // reader apparently empty. Drop it so the next tick rebuilds it.
                Err(pcsc::Error::NoSmartcard) | Err(pcsc::Error::RemovedCard) => {
                    contact_scanned.remove(reader);
                    continue;
                }
                // A synchronous memory card (SLE) cannot negotiate T=0/T=1 and
                // answers this instead; it only speaks the reader's RAW
                // protocol. Nothing contactless ever lands here.
                Err(pcsc::Error::UnresponsiveCard) | Err(pcsc::Error::ProtoMismatch) => {
                    match context.connect(&name, ShareMode::Shared, Protocols::RAW) {
                        Ok(card) => card,
                        Err(e) => {
                            tracing::debug!("nfc: {reader} holds a card we can't talk to: {e}");
                            contact_scanned.remove(reader);
                            continue;
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("nfc: connect to {reader} failed ({e}); resetting the context");
                    context_died = true;
                    break;
                }
            };
            card_present = true;

            // Contact cards (SLE, ACOS) are a different world: no UID, no NDEF,
            // their own protocols. They identify by ATR, and each reader keeps
            // its own "already handled" slot so a card inserted here is not
            // starved by a tag resting on the contactless reader.
            let atr = card
                .status2_owned()
                .map(|s| s.atr().to_vec())
                .unwrap_or_default();
            if let Some(kind) = cards::CardKind::from_atr(&atr) {
                contact_card = Some(kind.into());
                card_present = true;
                service_contact_card(
                    &app,
                    &mut card,
                    kind,
                    reader,
                    &mut contact_scanned,
                    &mut pending,
                );
                continue;
            }

            tag_present = true;
            let uid = read_uid(&card).unwrap_or_default();
            // Whether this tick's tag-level work (authenticate, read, write)
            // came off cleanly. A tick that only read the UID leaves it true:
            // that is a reader command and disturbs no tag state.
            let mut clean = true;

            if !is_same_tag(&last_scan, &uid) {
                last_scan = None;
            }

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
                    // Everything needed to tell the causes apart without a
                    // second attempt: which page or block died, what the tag
                    // is, and how much the message needed.
                    Err(e) => tracing::warn!(
                        "nfc: write to tag {uid} failed: {e} (kind {:?}, needed {} bytes)",
                        tag_kind(&card),
                        encode_ndef_uris(&uris).len(),
                    ),
                }
                // A write authenticates its way across the tag, so leave it
                // power-cycled for whatever comes next either way.
                clean = false;
                let _ = job.reply.send(result);
                // A written tag is still on the reader; don't immediately scan
                // it back and start playing.
                last_scan = Some(uid.clone());
            } else {
                // Cleared just above unless this is the tag we already scanned.
                if last_scan.is_none() {
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
                            // Remembered only now. Recording a tag we failed to
                            // read would suppress it for as long as it sits
                            // there, turning one bad read — a half-settled card
                            // right after a reset — into a tag that never plays
                            // again.
                            last_scan = Some(uid.clone());
                        }
                        Ok(_) => {
                            tracing::debug!("nfc: tag {uid:?} holds no NDEF URI record");
                            clean = false;
                        }
                        Err(e) => {
                            tracing::debug!("nfc: read failed: {e}");
                            clean = false;
                        }
                    }
                }
            }

            // Reset only to recover, never on the happy path — a reset
            // re-powers the tag, and it answers nothing for a moment after.
            //
            // "Recover" is judged on the tag-level work, not on the UID: reading
            // the UID is a reader command that succeeds even when the tag itself
            // is wedged. A MIFARE Classic that has been left mid-authentication
            // refuses the next one, which surfaced as a tag reading fine and
            // then, seconds later, reporting no NDEF records at all.
            let disposition = if clean && !uid.is_empty() {
                Disposition::LeaveCard
            } else {
                Disposition::ResetCard
            };
            let _ = card.disconnect(disposition);
            // Carry on to the next reader rather than stopping here: a
            // contactless and a contact reader are routinely plugged in
            // together, and breaking would let a tag resting on one starve a
            // card inserted in the other.
            continue;
        }

        // Forget the last tag once it leaves, so re-tapping it plays again
        // without waiting out the cooldown.
        if !tag_present {
            last_scan = None;
        }

        if context_died {
            ctx = None;
            // Say so rather than reporting a healthy but permanently empty
            // reader: a pending write is about to time out, and the user should
            // see a reason for it.
            publish(
                &app,
                &status,
                NfcStatus {
                    available: false,
                    error: Some("lost contact with the reader; reconnecting".into()),
                    ..Default::default()
                },
            );
            std::thread::sleep(POLL);
            continue;
        }

        publish(
            &app,
            &status,
            NfcStatus {
                available: true,
                readers,
                card_present,
                error: None,
                card: contact_card,
            },
        );

        std::thread::sleep(POLL);
    }
}

/// Read or write one contact card — SLE or ACOS — on `reader`.
///
/// Reads happen once per insertion, as they do for tags: `handled` remembers
/// what this reader last dealt with, and is cleared when the card leaves.
/// A write consumes `pending` and needs the card's secret, which the UI has
/// already collected.
fn service_contact_card(
    app: &AppHandle,
    card: &mut pcsc::Card,
    kind: cards::CardKind,
    reader: &str,
    handled: &mut std::collections::HashMap<String, String>,
    pending: &mut Option<Pending>,
) {
    if let Some(job) = pending.take() {
        let payloads: Vec<&str> = job.payloads.iter().map(String::as_str).collect();
        let result = write_contact_card(card, kind, &payloads, job.secret.as_deref())
            .map(|_| kind.label().to_string());
        match &result {
            Ok(_) => tracing::info!("nfc: wrote {:?} to a {}", job.payloads, kind.label()),
            Err(e) => tracing::warn!("nfc: write to a {} failed: {e}", kind.label()),
        }
        let _ = job.reply.send(result);
        // Written, so don't read it straight back and start playing.
        handled.insert(reader.to_string(), format!("{kind:?}"));
        return;
    }

    if handled.get(reader).map(String::as_str) == Some(&format!("{kind:?}")) {
        return;
    }

    match read_contact_card(card, kind) {
        Ok(payloads) if !payloads.is_empty() => {
            tracing::info!("nfc: {} → {payloads:?}", kind.label());
            let _ = app.emit(
                "nfc://scan",
                ScanEvent {
                    payloads,
                    uid: format!("{kind:?}"),
                },
            );
            // Remembered only on success, so one bad read doesn't silence the
            // card for as long as it stays inserted.
            handled.insert(reader.to_string(), format!("{kind:?}"));
        }
        Ok(_) => tracing::debug!("nfc: {} holds nothing we can play", kind.label()),
        Err(e) => tracing::debug!("nfc: reading the {} failed: {e}", kind.label()),
    }
}

fn read_contact_card(card: &mut pcsc::Card, kind: cards::CardKind) -> Result<Vec<String>, String> {
    let data = match kind {
        cards::CardKind::Sle5528 => {
            cards::sle::select_type(&*card)?;
            cards::sle::read(
                &*card,
                cards::SLE_DATA_OFFSET,
                cards::SLE5528_SIZE - cards::SLE_DATA_OFFSET,
            )?
        }
        cards::CardKind::Acos3 => {
            // One transaction for the whole sequence: on macOS the smartcard
            // daemon touches a shared card between APDUs and resets it, which
            // would break a bare SELECT-then-READ.
            let tx = card.transaction2().map_err(|(_, e)| cards::map_err(e))?;
            cards::acos::select_file(&tx, &cards::ACOS_USER_FILE)?;
            let reclen = cards::acos::record_len(&tx)?;
            cards::acos::read_records(&tx, 0, reclen, None)?
        }
    };
    Ok(cards::decode_payloads(&data))
}

pub(crate) fn write_contact_card(
    card: &mut pcsc::Card,
    kind: cards::CardKind,
    payloads: &[&str],
    secret: Option<&str>,
) -> Result<(), String> {
    let secret = secret
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            format!(
                "writing a {} needs its {}",
                kind.label(),
                kind.secret_label()
            )
        })?;
    match kind {
        cards::CardKind::Sle5528 => {
            // The PSC is hex digits; a wrong one decrements a counter that
            // locks the card for good once it reaches zero.
            let psc = parse_hex(secret)
                .ok_or_else(|| format!("the PSC must be hex digits, got {secret:?}"))?;
            let fitted = cards::fit_payloads(payloads, cards::SLE_WRITE_SPAN);
            let mut data = cards::encode_payloads(&fitted)?;
            // Pad out to the span this write owns. Writing only the payload
            // leaves the tail of any longer previous write in place, and those
            // stale bytes read back as an extra record.
            data.resize(cards::SLE_WRITE_SPAN, 0xFF);
            cards::sle::select_type(&*card)?;
            if cards::sle::error_counter(&*card)? == Some(0x00) {
                return Err("this card's security code is locked; it can't be written".into());
            }
            cards::sle::present_psc(&*card, &psc)?;
            cards::sle::write(&*card, cards::SLE_DATA_OFFSET, &data)?;

            let back = cards::sle::read(&*card, cards::SLE_DATA_OFFSET, data.len())?;
            if back != data {
                return Err("the card read back differently from what was written".into());
            }
            Ok(())
        }
        cards::CardKind::Acos3 => {
            let tx = card.transaction2().map_err(|(_, e)| cards::map_err(e))?;
            cards::acos::select_file(&tx, &cards::ACOS_USER_FILE)?;
            cards::acos::submit_code(&tx, cards::ACOS_ISSUER_CODE_REF, secret.as_bytes())?;
            let reclen = cards::acos::record_len(&tx)?;
            let records = cards::acos::record_count(&tx, reclen)?;
            let capacity = records * reclen;

            // A real ACOS3 user file is 28 bytes, which the 26-byte record URI
            // very nearly fills — so the fallback is dropped rather than the
            // write refused.
            let fitted = cards::fit_payloads(payloads, capacity);
            if fitted.len() < payloads.len() {
                tracing::info!(
                    "nfc: the card's {capacity}-byte file fits {} of {} records",
                    fitted.len(),
                    payloads.len()
                );
            }
            let data = cards::encode_payloads(&fitted)?;
            if data.len() > capacity {
                return Err(format!(
                    "this card's data file holds {capacity} bytes and the link needs {}",
                    data.len()
                ));
            }

            cards::acos::write_records(&tx, 0, reclen, &data)?;
            let used = data.len().div_ceil(reclen);
            cards::acos::clear_records_from(&tx, used, reclen)?;

            let back = cards::acos::read_records(&tx, 0, reclen, Some(data.len()))?;
            if back != data {
                return Err("the card read back differently from what was written".into());
            }
            Ok(())
        }
    }
}

/// Parse an even-length string of hex digits.
fn parse_hex(s: &str) -> Option<Vec<u8>> {
    let s = s.trim();
    if s.is_empty() || !s.len().is_multiple_of(2) {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

/// Whether the tag now on the reader is the one already scanned.
///
/// Anything else means that tag is gone, and the new one is due a read — even
/// if the reader was never observed empty in between. Waiting for that gap
/// misses a swap done between two polls, which left the arriving tag treated as
/// already-scanned and silently never read.
///
/// A UID that wouldn't read is never "the same": it identifies nothing, so the
/// only way to recover is to look again.
fn is_same_tag(last_scan: &Option<String>, uid: &str) -> bool {
    !uid.is_empty() && last_scan.as_deref() == Some(uid)
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
    let mut slot = status_of(cell);
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
    transmit(card, &apdu)
        .map(|_| ())
        .map_err(|e| format!("{e} at page {page}"))
}

/// What a PC/SC reader says a contactless storage card is.
///
/// The ATR of a storage card is synthesised by the reader to a fixed shape
/// (PC/SC part 3, §3.1.3.2.3.1): `3B 8F 80 01 80 4F 0C A0 00 00 03 06 <SS>
/// <card name, 2 bytes> …`. Only the Ultralight family speaks the page-addressed
/// Type 2 protocol this module writes; MIFARE Classic uses 16-byte blocks behind
/// a key exchange, and its rejection of `FF D6` is the SW 6300 people hit when
/// they buy "NFC tags" that turn out to be Classic.
#[derive(Debug, Clone, Copy, PartialEq)]
enum TagKind {
    /// NTAG21x / MIFARE Ultralight — page-addressed, no authentication.
    Type2,
    /// MIFARE Classic: 16-byte blocks behind a per-sector key exchange. The
    /// number is how many 4-block sectors it has (16 on a 1K, 40 on a 4K).
    Classic(&'static str, u8),
    /// No storage-card ATR, or one we don't recognise. Treated as Type 2, which
    /// is what an unbranded NTAG clone almost always is.
    Unknown,
}

fn tag_kind(card: &Card) -> TagKind {
    match card.status2_owned() {
        Ok(status) => tag_kind_from_atr(status.atr()),
        Err(_) => TagKind::Unknown,
    }
}

fn tag_kind_from_atr(atr: &[u8]) -> TagKind {
    // Locate the card-name bytes by the RID that precedes them, rather than a
    // fixed offset — the historical-byte prefix varies between readers.
    const RID: [u8; 5] = [0xA0, 0x00, 0x00, 0x03, 0x06];
    let Some(at) = atr.windows(RID.len()).position(|w| w == RID) else {
        return TagKind::Unknown;
    };
    // RID, then one byte of standard (SS), then the two-byte card name.
    let Some(name) = atr.get(at + RID.len() + 1..at + RID.len() + 3) else {
        return TagKind::Unknown;
    };
    match (name[0], name[1]) {
        (0x00, 0x03) => TagKind::Type2,
        (0x00, 0x01) => TagKind::Classic("MIFARE Classic 1K", 16),
        // Only the first 32 sectors of a 4K are the 4-block kind this addresses;
        // the 8 above them are 16-block sectors, and 31 usable sectors is far
        // more room than a tag of ours ever needs.
        (0x00, 0x02) => TagKind::Classic("MIFARE Classic 4K", 32),
        (0x00, 0x26) => TagKind::Classic("MIFARE Mini", 5),
        (0x00, 0x36) | (0x00, 0x37) => TagKind::Classic("MIFARE Plus", 32),
        _ => TagKind::Unknown,
    }
}

// ── MIFARE Classic ──────────────────────────────────────────────────────────
//
// Classic is not an NFC Forum tag type, but NXP AN1305 maps NDEF onto it and
// that mapping is what phones read and write — so a Classic tag someone bought
// as an "NFC tag" holds an ordinary NDEF message, just addressed differently.
//
// Layout: 16-byte blocks grouped into 4-block sectors. The last block of each
// sector is its trailer (two keys and the access bits), and sector 0 block 0 is
// factory data, so the usable space is 3 blocks per sector from sector 1 up.
// Every sector must be authenticated before any of its blocks can be touched.

/// Data bytes per sector: three 16-byte blocks, the fourth being the trailer.
const CLASSIC_SECTOR_BYTES: usize = 3 * CLASSIC_BLOCK_LEN;
const CLASSIC_BLOCK_LEN: usize = 16;

/// The NFC Forum's well-known key A for NDEF sectors on Classic (AN1305 §3.3).
/// An NDEF-formatted tag carries this; a factory-blank one does not.
const NDEF_KEY: [u8; 6] = [0xD3, 0xF7, 0xD3, 0xF7, 0xD3, 0xF7];
/// The factory transport key. Authenticating with it means the tag has never
/// been NDEF-formatted.
const FACTORY_KEY: [u8; 6] = [0xFF; 6];
/// Key A of the MAD sector, fixed by the MAD spec so any reader can read it.
const MAD_KEY: [u8; 6] = [0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5];

/// A sector trailer: key A, three access-condition bytes, the general-purpose
/// byte, then key B.
///
/// Key B is left at the factory value on every sector, and the access bits
/// (`7F 07 88` for NDEF, `78 77 88` for the MAD) keep the trailer writable with
/// key B. Formatting is therefore reversible — a wrong trailer can be rewritten
/// rather than locking the sector for good.
fn trailer(key_a: &[u8; 6], access: [u8; 4]) -> Vec<u8> {
    let mut t = key_a.to_vec();
    t.extend_from_slice(&access);
    t.extend_from_slice(&FACTORY_KEY);
    t
}

/// CRC-8 over the MAD's bytes: polynomial 0x1D, preset 0xC7.
fn crc8_mad(data: &[u8]) -> u8 {
    let mut crc: u8 = 0xC7;
    for &b in data {
        crc ^= b;
        for _ in 0..8 {
            crc = if crc & 0x80 != 0 {
                (crc << 1) ^ 0x1D
            } else {
                crc << 1
            };
        }
    }
    crc
}

/// MAD1 blocks 1 and 2 — the directory that tells a reader which sectors hold
/// NDEF. Every sector from 1 up is claimed by the NDEF AID (0x03E1, stored
/// little-endian). Byte 0 is the CRC over everything that follows it; byte 1 is
/// the card-publisher sector, 0 for none.
fn mad_blocks(sectors: u8) -> (Vec<u8>, Vec<u8>) {
    let mut b1 = vec![0x00, 0x00];
    let mut b2 = Vec::new();
    for s in 1..sectors.min(16) {
        let aid = [0xE1, 0x03];
        if s <= 7 {
            b1.extend_from_slice(&aid);
        } else {
            b2.extend_from_slice(&aid);
        }
    }
    let mut crc_input = b1[1..].to_vec();
    crc_input.extend_from_slice(&b2);
    b1[0] = crc8_mad(&crc_input);
    (b1, b2)
}

/// Turn a factory-blank Classic tag into an NDEF one.
///
/// Only ever called on a tag that still answers to the factory key everywhere,
/// so there is nothing of anyone's to destroy. The NDEF sectors are done first
/// and the MAD last: a format interrupted halfway leaves a tag whose directory
/// still says "not NDEF", which is what it was to begin with.
fn classic_format(card: &Card, sectors: u8) -> Result<(), String> {
    for sector in 1..sectors {
        if !try_auth(card, &FACTORY_KEY, sector) {
            return Err(format!("sector {sector} wouldn't authenticate to format"));
        }
        for block in 0..3u8 {
            classic_write_block(card, sector * 4 + block, &[0u8; CLASSIC_BLOCK_LEN])?;
        }
        classic_write_block(
            card,
            sector * 4 + 3,
            &trailer(&NDEF_KEY, [0x7F, 0x07, 0x88, 0x40]),
        )?;
    }

    if !try_auth(card, &FACTORY_KEY, 0) {
        return Err("the MAD sector wouldn't authenticate to format".into());
    }
    let (b1, b2) = mad_blocks(sectors);
    classic_write_block(card, 1, &b1)?;
    classic_write_block(card, 2, &b2)?;
    // GPB 0xC1: MAD present, version 1, multi-application.
    classic_write_block(card, 3, &trailer(&MAD_KEY, [0x78, 0x77, 0x88, 0xC1]))?;
    Ok(())
}

/// Load a key into the reader's volatile key slot 0 for the next authenticate.
fn load_key(card: &Card, key: &[u8; 6]) -> Result<(), String> {
    let mut apdu = vec![0xFF, 0x82, 0x00, 0x00, 0x06];
    apdu.extend_from_slice(key);
    transmit(card, &apdu).map(|_| ())
}

/// Authenticate `block`'s sector with the key already in slot 0, as key A.
fn authenticate(card: &Card, block: u8) -> Result<(), String> {
    transmit(
        card,
        &[0xFF, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, block, 0x60, 0x00],
    )
    .map(|_| ())
}

/// Authenticate a sector, returning false when the key is simply wrong — the
/// caller uses that to tell an NDEF-formatted tag from a blank one, so it must
/// not be an error.
fn try_auth(card: &Card, key: &[u8; 6], sector: u8) -> bool {
    load_key(card, key).is_ok() && authenticate(card, sector * 4).is_ok()
}

fn classic_read_block(card: &Card, block: u8) -> Result<Vec<u8>, String> {
    transmit(card, &[0xFF, 0xB0, 0x00, block, CLASSIC_BLOCK_LEN as u8])
}

fn classic_write_block(card: &Card, block: u8, data: &[u8]) -> Result<(), String> {
    let mut apdu = vec![0xFF, 0xD6, 0x00, block, CLASSIC_BLOCK_LEN as u8];
    apdu.extend_from_slice(data);
    transmit(card, &apdu)
        .map(|_| ())
        .map_err(|e| format!("{e} at block {block}"))
}

/// The data blocks of sectors 1..`sectors`, in order — where the NDEF message
/// lives. Sector 0 is skipped: it holds the MIFARE Application Directory, which
/// says which sectors are NDEF, and rewriting it is a formatting operation.
fn classic_data_blocks(sectors: u8) -> Vec<u8> {
    (1..sectors)
        .flat_map(|s| (0..3).map(move |b| s * 4 + b))
        .collect()
}

/// Read the NDEF message off a Classic tag, sector by sector.
///
/// Stops at the first sector that won't authenticate, which is the end of the
/// NDEF area — sectors beyond it belong to other applications and are none of
/// our business.
fn classic_read_ndef(card: &Card, sectors: u8) -> Result<Vec<String>, String> {
    let mut data = Vec::new();
    for sector in 1..sectors {
        if !try_auth(card, &NDEF_KEY, sector) {
            break;
        }
        for block in 0..3u8 {
            match classic_read_block(card, sector * 4 + block) {
                Ok(bytes) => data.extend_from_slice(&bytes),
                Err(_) => break,
            }
        }
    }

    Ok(find_ndef_tlv(&data).map(uri_records).unwrap_or_default())
}

/// Write an NDEF TLV across a Classic tag's NDEF sectors.
///
/// Only data blocks are touched. Sector trailers hold the keys and access bits,
/// and a wrong value there locks the sector permanently — so a tag that isn't
/// already NDEF-formatted is refused rather than formatted in place.
fn classic_write_ndef(card: &Card, bytes: &[u8], sectors: u8) -> Result<(), String> {
    // A tag straight out of the packet has no NDEF mapping on it at all — the
    // keys are still the factory ones and there is no MAD. That is not a
    // failure, it is a tag that needs formatting once, which is what a phone
    // would silently do too.
    if !try_auth(card, &NDEF_KEY, 1) {
        if !try_auth(card, &FACTORY_KEY, 1) {
            return Err(
                "this MIFARE Classic tag is locked with keys we don't have, so it can't be written"
                    .into(),
            );
        }
        tracing::info!("nfc: blank Classic tag, formatting it for NDEF");
        classic_format(card, sectors)?;
    }

    // A block write is all 16 bytes or nothing, so the TLV is padded out to a
    // whole block. encode_ndef_uris pads to the Type 2 page size, which is a
    // quarter of that.
    let mut padded = bytes.to_vec();
    pad_to(&mut padded, CLASSIC_BLOCK_LEN);

    let blocks = classic_data_blocks(sectors);
    let chunks: Vec<&[u8]> = padded.chunks(CLASSIC_BLOCK_LEN).collect();
    if chunks.len() > blocks.len() {
        return Err(format!(
            "this tag holds {} bytes of NDEF; the link needs {}.",
            blocks.len() * CLASSIC_BLOCK_LEN,
            padded.len()
        ));
    }

    // Same ordering rule as Type 2: the block carrying the TLV header goes last,
    // so an interrupted write leaves a tag that reads as blank, not as half a
    // record. Authentication is per sector and is re-asserted on each crossing.
    let mut plan: Vec<(u8, &[u8])> = blocks.into_iter().zip(chunks).collect();
    if plan.is_empty() {
        return Err("nothing to write".into());
    }
    let head = plan.remove(0);
    plan.push(head);

    let mut authed = None;
    for (block, chunk) in plan {
        let sector = block / 4;
        if authed != Some(sector) {
            if !try_auth(card, &NDEF_KEY, sector) {
                return Err(format!("sector {sector} wouldn't authenticate"));
            }
            authed = Some(sector);
        }
        classic_write_block(card, block, chunk)?;
    }
    Ok(())
}

/// Whether the tag has been locked read-only.
///
/// Byte 3 of the capability container holds the NDEF access condition: 0x00 is
/// read/write, anything else restricts writing. A tag locked this way (or with
/// its static lock bits burned) answers every write with the same SW 6300 as a
/// Classic tag, and the lock is irreversible — so this is worth saying plainly
/// rather than letting the user retry a tag that will never take a write.
fn is_read_only(card: &Card) -> bool {
    matches!(read_pages(card, 3, 1), Ok(cc) if cc.len() >= 4 && cc[0] == 0xE1 && cc[3] != 0x00)
}

/// Usable user-memory size in bytes.
///
/// The capability container (page 3, byte 2, in units of 8) is the tag's own
/// claim, and a blank tag has no CC at all. Neither is trustworthy enough to
/// size a write against — a wrong answer here is exactly the half-written tag
/// this module must avoid — so the claim is confirmed by reading up to the page
/// it implies. Real memory is what actually reads back.
fn capacity(card: &Card) -> usize {
    let claimed = match read_pages(card, 3, 1) {
        Ok(cc) if cc.len() >= 3 && cc[0] == 0xE1 && cc[2] > 0 => cc[2] as usize * 8,
        // No CC (a factory-blank or non-NDEF tag): assume the smallest Type 2
        // layout and let the probe below find the rest.
        _ => 48,
    };
    readable_from(card, FIRST_DATA_PAGE, claimed.max(48))
}

/// Bytes that actually read back from `page`, probing up to `limit`. Stops at
/// the first read that fails, which is where the tag's memory ends.
fn readable_from(card: &Card, page: u8, limit: usize) -> usize {
    let mut ok = 0;
    let mut at = page;
    while ok < limit {
        // Four pages at a time, the most a single READ BINARY returns.
        let want = ((limit - ok) / PAGE_LEN).clamp(1, 4) as u8;
        match read_pages(card, at, want) {
            Ok(bytes) if !bytes.is_empty() => ok += bytes.len(),
            _ => break,
        }
        match at.checked_add(want) {
            Some(next) => at = next,
            None => break,
        }
    }
    ok
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
    pad_to(&mut tlv, PAGE_LEN);
    tlv
}

/// Zero-pad to a whole number of `align`-byte units. Tag memory is written in
/// fixed-size units — pages on Type 2, blocks on Classic — and a short trailing
/// write is rejected outright, so the message always ends on a boundary.
fn pad_to(bytes: &mut Vec<u8>, align: usize) {
    while !bytes.len().is_multiple_of(align) {
        bytes.push(0x00);
    }
}

/// Writes as many of `uris` as the tag has room for, and reports how many stuck.
///
/// Trailing records are dropped rather than failing the write: the first record
/// is the one that plays and the rest only matter if it stops resolving, so a
/// small tag is better off with a working shortcut than with no tag at all.
fn write_ndef(card: &Card, uris: &[&str]) -> Result<usize, String> {
    // Classic stores the same NDEF message, just in authenticated 16-byte
    // blocks. Its own sizing is per sector, so it does its own trimming.
    if let TagKind::Classic(_, sectors) = tag_kind(card) {
        let room = (sectors as usize - 1) * CLASSIC_SECTOR_BYTES;
        let mut take = uris.len();
        while take > 1 && encode_ndef_uris(&uris[..take]).len() > room {
            take -= 1;
        }
        classic_write_ndef(card, &encode_ndef_uris(&uris[..take]), sectors)?;
        return Ok(take);
    }

    if is_read_only(card) {
        return Err("this tag is locked read-only and can't be rewritten".into());
    }

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
    let pages: Vec<(u8, &[u8])> = bytes
        .chunks(PAGE_LEN)
        .enumerate()
        .map(|(i, chunk)| {
            let page = u8::try_from(i)
                .ok()
                .and_then(|i| FIRST_DATA_PAGE.checked_add(i))
                .ok_or("the link is longer than this tag can address")?;
            Ok((page, chunk))
        })
        .collect::<Result<_, String>>()?;

    // The first page carries the TLV header, and without it the message is not
    // an NDEF message at all. Writing it last means a write that dies partway —
    // tag pulled off the reader, memory smaller than it claimed — leaves a tag
    // that reads as blank rather than as a corrupt half-record.
    let (first, rest) = pages.split_at(1);
    for (page, chunk) in rest {
        write_page(card, *page, chunk)?;
    }
    for (page, chunk) in first {
        write_page(card, *page, chunk)?;
    }
    Ok(take)
}

/// Pull every URI record out of the tag's NDEF message, in tag order.
fn read_ndef_uris(card: &Card) -> Result<Vec<String>, String> {
    if let TagKind::Classic(_, sectors) = tag_kind(card) {
        return classic_read_ndef(card, sectors);
    }

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

    /// There is one physical reader, and the test harness runs tests in
    /// parallel. Two connections talking to the same tag at once interleave
    /// their APDUs and read each other's bytes back as garbage, so the
    /// hardware tests take this first. (The same hazard applies to the running
    /// app: don't drive a reader from two processes at once.)
    static READER: Mutex<()> = Mutex::new(());

    /// Held across a hardware test. Poisoning is irrelevant here — a panicking
    /// test has already failed, and the next one still wants exclusive access.
    fn reader_lock() -> std::sync::MutexGuard<'static, ()> {
        READER.lock().unwrap_or_else(|e| e.into_inner())
    }

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
            // Favorites are a query, not a record, so the tag names their owner.
            "rocksky://favorites/did%3Aplc%3A7vdlgi2bflelz7mmuxoqjfcr",
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
            hex(&["rocksky://favorites/did%3Aplc%3Aabc"]),
            "0328d101245500726f636b736b793a2f2f6661766f72697465732f646964253341706c63253341616263fe00"
        );
        assert_eq!(
            hex(&["https://rocksky.app"]),
            "0310d1010c5504726f636b736b792e617070fe00"
        );
    }

    /// Real ATRs as PC/SC synthesises them for contactless storage cards. The
    /// Classic ones are what SW 6300 on a write actually means.
    #[test]
    fn reads_the_tag_type_out_of_the_atr() {
        let ultralight = [
            0x3B, 0x8F, 0x80, 0x01, 0x80, 0x4F, 0x0C, 0xA0, 0x00, 0x00, 0x03, 0x06, 0x03, 0x00,
            0x03, 0x00, 0x00, 0x00, 0x00, 0x68,
        ];
        assert_eq!(tag_kind_from_atr(&ultralight), TagKind::Type2);

        let classic_1k = [
            0x3B, 0x8F, 0x80, 0x01, 0x80, 0x4F, 0x0C, 0xA0, 0x00, 0x00, 0x03, 0x06, 0x03, 0x00,
            0x01, 0x00, 0x00, 0x00, 0x00, 0x6A,
        ];
        assert_eq!(
            tag_kind_from_atr(&classic_1k),
            TagKind::Classic("MIFARE Classic 1K", 16)
        );

        // A contact smartcard's ATR carries no storage-card RID: not a refusal.
        assert_eq!(
            tag_kind_from_atr(&[0x3B, 0x65, 0x00, 0x00]),
            TagKind::Unknown
        );
        assert_eq!(tag_kind_from_atr(&[]), TagKind::Unknown);
    }

    /// End-to-end against whatever tag is on the reader, through the same
    /// functions the app calls. Ignored by default — it needs hardware, and it
    /// overwrites the tag it finds.
    ///
    ///     cargo test -p rocksky-desktop --lib nfc -- --ignored --nocapture
    #[test]
    #[ignore = "needs a reader with a tag on it, and rewrites that tag"]
    fn hardware_roundtrip() {
        let _guard = reader_lock();
        let ctx = Context::establish(Scope::User).expect("no PC/SC");
        let mut buf = [0u8; 2048];
        let readers: Vec<String> = ctx
            .list_readers(&mut buf)
            .expect("list_readers")
            .map(|r| r.to_string_lossy().into_owned())
            .collect();
        let name = readers.first().expect("no reader connected");
        let cname = std::ffi::CString::new(name.as_str()).unwrap();
        let card = ctx
            .connect(&cname, ShareMode::Shared, Protocols::ANY)
            .expect("no tag on the reader");

        println!("reader: {name}, tag: {:?}", tag_kind(&card));

        let uris = [
            "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlkzzimck2k",
            "rocksky://library/album/rec_9f8e7d",
        ];
        let written = write_ndef(&card, &uris).expect("write failed");
        assert_eq!(written, uris.len(), "both records should fit");

        let read = read_ndef_uris(&card).expect("read failed");
        assert_eq!(read, uris, "what came back is what went on");
        println!("roundtripped {} records", read.len());

        let _ = card.disconnect(Disposition::ResetCard);
    }

    /// The worker's actual sequence, which `hardware_roundtrip` doesn't cover:
    /// several poll ticks that read the tag and reset it, then a tick that
    /// writes, then more reads. Each tick reconnects, as the loop does.
    ///
    ///     cargo test -p rocksky-desktop --lib nfc -- --ignored --nocapture
    #[test]
    #[ignore = "needs a reader with a tag on it, and rewrites that tag"]
    fn hardware_poll_then_write() {
        let _guard = reader_lock();
        let ctx = Context::establish(Scope::User).expect("no PC/SC");
        let mut buf = [0u8; 2048];
        let readers: Vec<String> = ctx
            .list_readers(&mut buf)
            .expect("list_readers")
            .map(|r| r.to_string_lossy().into_owned())
            .collect();
        let name = readers.first().expect("no reader connected");
        let cname = std::ffi::CString::new(name.as_str()).unwrap();

        let tick = || {
            ctx.connect(&cname, ShareMode::Shared, Protocols::ANY)
                .expect("connect failed mid-poll")
        };

        // Poll ticks, exactly as the loop runs them.
        for i in 0..4 {
            let card = tick();
            let uid = read_uid(&card).unwrap_or_default();
            let got = read_ndef_uris(&card).expect("read failed");
            println!("poll {i}: uid={uid} records={}", got.len());
            let _ = card.disconnect(Disposition::ResetCard);
            std::thread::sleep(POLL);
        }

        // Then the tick that carries the armed write.
        let uris = [
            "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlkzzimck2k",
            "rocksky://library/album/rec_9f8e7d",
        ];
        let card = tick();
        let uid = read_uid(&card).unwrap_or_default();
        let written = write_ndef(&card, &uris).expect("write failed after polling");
        println!("write tick: uid={uid} wrote={written}");
        assert_eq!(written, uris.len());
        let _ = card.disconnect(Disposition::ResetCard);

        // And reads after it, which is how the user would notice it stuck.
        for i in 0..2 {
            std::thread::sleep(POLL);
            let card = tick();
            let got = read_ndef_uris(&card).expect("read after write failed");
            println!("post-write poll {i}: {} records", got.len());
            assert_eq!(got, uris, "the tag should hold what we just wrote");
            let _ = card.disconnect(Disposition::ResetCard);
        }
    }

    /// Burn a real tag from the command line, through the shipping write path.
    /// Comma-separated URIs, best first — the record URI, then the library id:
    ///
    ///     ROCKSKY_TAG_URIS='at://…/app.rocksky.album/…,rocksky://library/album/rec_…' \
    ///       cargo test -p rocksky-desktop --lib nfc -- --ignored --nocapture write_tag
    ///
    /// Skips when the variable is unset, so a plain `--ignored` run doesn't
    /// blank a tag with someone else's leftovers.
    #[test]
    #[ignore = "needs a reader, a tag, and ROCKSKY_TAG_URIS"]
    fn hardware_write_tag() {
        let Ok(spec) = std::env::var("ROCKSKY_TAG_URIS") else {
            println!("ROCKSKY_TAG_URIS unset — nothing to write");
            return;
        };
        let uris: Vec<&str> = spec
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        assert!(!uris.is_empty(), "ROCKSKY_TAG_URIS held no URIs");

        let _guard = reader_lock();
        let ctx = Context::establish(Scope::User).expect("no PC/SC");
        let mut buf = [0u8; 2048];
        let readers: Vec<String> = ctx
            .list_readers(&mut buf)
            .expect("list_readers")
            .map(|r| r.to_string_lossy().into_owned())
            .collect();
        let name = readers.first().expect("no reader connected");
        let cname = std::ffi::CString::new(name.as_str()).unwrap();
        let card = ctx
            .connect(&cname, ShareMode::Shared, Protocols::ANY)
            .expect("no tag on the reader");

        let uid = read_uid(&card).unwrap_or_default();
        println!("tag {uid} ({:?})", tag_kind(&card));
        for u in &uris {
            println!("  writing: {u}");
        }
        let written = write_ndef(&card, &uris).expect("write failed");
        assert_eq!(written, uris.len(), "not every record fitted");

        let read = read_ndef_uris(&card).expect("read-back failed");
        assert_eq!(read, uris, "the tag doesn't hold what we wrote");
        println!("verified {} records on tag {uid}", read.len());

        let _ = card.disconnect(Disposition::ResetCard);
    }

    /// Swapping one tag for another between two polls shows no empty reader in
    /// between, so tag identity — not an observed gap — has to drive the reread.
    #[test]
    fn a_swapped_tag_is_not_the_one_already_scanned() {
        let scanned = Some("87494824".to_string());

        assert!(is_same_tag(&scanned, "87494824"), "same tag, still resting");
        assert!(
            !is_same_tag(&scanned, "16FDC341"),
            "a different tag is a new arrival even with no gap between them"
        );
        assert!(
            !is_same_tag(&scanned, ""),
            "an unreadable UID identifies nothing, so look again"
        );
        assert!(!is_same_tag(&None, "87494824"), "nothing scanned yet");
        assert!(!is_same_tag(&None, ""), "no tag, no UID");
    }

    /// Pinned against the bytes a real MIFARE Classic 1K accepted: an all-NDEF
    /// MAD1 for sectors 1-15, CRC 0xEC over the 31 bytes that follow it.
    #[test]
    fn mad_matches_what_the_tag_accepted() {
        let hex = |b: &[u8]| b.iter().map(|x| format!("{x:02x}")).collect::<String>();
        let (b1, b2) = mad_blocks(16);
        assert_eq!(
            hex(&b1),
            "ec00e103e103e103e103e103e103e103",
            "MAD block 1: CRC, publisher sector, then sectors 1-7"
        );
        assert_eq!(
            hex(&b2),
            "e103e103e103e103e103e103e103e103",
            "MAD block 2: sectors 8-15"
        );
        assert_eq!(b1.len(), CLASSIC_BLOCK_LEN);
        assert_eq!(b2.len(), CLASSIC_BLOCK_LEN);
    }

    /// Key B stays at the factory value and the access bits keep the trailer
    /// writable with it, so a format is always reversible. If this ever changes,
    /// a bad trailer would brick the sector permanently.
    #[test]
    fn format_stays_reversible() {
        for t in [
            trailer(&NDEF_KEY, [0x7F, 0x07, 0x88, 0x40]),
            trailer(&MAD_KEY, [0x78, 0x77, 0x88, 0xC1]),
        ] {
            assert_eq!(t.len(), CLASSIC_BLOCK_LEN);
            assert_eq!(&t[10..], &FACTORY_KEY, "key B must stay recoverable");
        }
    }

    /// Sector trailers and sector 0 must never appear in the write plan: the
    /// trailer holds the keys and access bits, and writing a wrong value there
    /// locks the sector for good.
    #[test]
    fn classic_never_addresses_a_trailer_or_sector_zero() {
        let blocks = classic_data_blocks(16);
        assert_eq!(
            blocks.len(),
            15 * 3,
            "15 usable sectors, 3 data blocks each"
        );
        for b in &blocks {
            assert!(*b >= 4, "sector 0 is the MAD, block {b} is in it");
            assert_ne!(b % 4, 3, "block {b} is a sector trailer");
        }
        // Contiguous 3-block runs, starting at each sector boundary.
        assert_eq!(&blocks[..4], &[4, 5, 6, 8]);
        assert_eq!(blocks.last(), Some(&62));
    }

    /// A 1K holds 720 NDEF bytes, far more than a tag of ours needs — but the
    /// arithmetic still has to agree with what the write plan can address.
    #[test]
    fn classic_capacity_matches_its_block_plan() {
        for (sectors, want) in [(16u8, 720usize), (32, 1488), (5, 192)] {
            assert_eq!((sectors as usize - 1) * CLASSIC_SECTOR_BYTES, want);
            assert_eq!(
                classic_data_blocks(sectors).len() * CLASSIC_BLOCK_LEN,
                want,
                "{sectors}-sector tag"
            );
        }
    }

    /// Classic writes whole 16-byte blocks, but the encoder pads to the Type 2
    /// page size — so the payload has to be padded again before chunking, or
    /// the final block write would be short.
    #[test]
    fn classic_pads_the_tlv_to_whole_blocks() {
        let bytes = encode_ndef_uris(&[
            "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlkzzimck2k",
            "rocksky://library/album/rec_9f8e7d",
        ]);
        assert_eq!(bytes.len() % PAGE_LEN, 0, "encoder pads to pages");
        assert_ne!(
            bytes.len() % CLASSIC_BLOCK_LEN,
            0,
            "and this vector is deliberately not block-aligned"
        );

        let mut padded = bytes.clone();
        pad_to(&mut padded, CLASSIC_BLOCK_LEN);
        assert_eq!(padded.len() % CLASSIC_BLOCK_LEN, 0);
        // Padding is trailing zeros after the terminator, so it reads the same.
        assert_eq!(
            find_ndef_tlv(&padded).map(uri_records),
            find_ndef_tlv(&bytes).map(uri_records),
        );
    }

    /// The TLV header goes on last, so a write that dies partway leaves a tag
    /// that reads as blank instead of as half a record.
    #[test]
    fn header_page_is_written_last() {
        let bytes = encode_ndef_uris(&[
            "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlkzzimck2k",
            "rocksky://library/album/rec_9f8e7d",
        ]);
        let pages: Vec<u8> = (0..bytes.len() / PAGE_LEN)
            .map(|i| FIRST_DATA_PAGE + i as u8)
            .collect();
        let (first, rest) = pages.split_at(1);
        let order: Vec<u8> = rest.iter().chain(first).copied().collect();

        assert_eq!(order.last(), Some(&FIRST_DATA_PAGE));
        assert_eq!(order.first(), Some(&(FIRST_DATA_PAGE + 1)));
        assert_eq!(order.len(), pages.len(), "every page still gets written");
        // Without page 4 the TLV is unreadable, which is the point.
        assert!(find_ndef_tlv(&bytes[PAGE_LEN..]).is_none());
    }

    #[test]
    fn writes_whole_pages() {
        assert_eq!(
            encode_ndef_uris(&["rocksky://library/album/abc"]).len() % PAGE_LEN,
            0
        );
    }
}
