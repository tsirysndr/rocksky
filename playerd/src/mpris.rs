//! Linux-only MPRIS 2 server. zbus uses its pure-Rust Tokio transport.
use crate::{
    control::{Control, Entry, View},
    engine::EngineCmd,
};
use rockbox_playback::{PlaybackState, RepeatMode};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use zbus::{
    fdo, interface,
    object_server::SignalContext,
    zvariant::{OwnedObjectPath, OwnedValue, Value},
};
const PATH: &str = "/org/mpris/MediaPlayer2";
const NO_TRACK: &str = "/org/mpris/MediaPlayer2/TrackList/NoTrack";
type Metadata = HashMap<String, OwnedValue>;
fn error(e: anyhow::Error) -> fdo::Error {
    tracing::warn!(error=%e,"MPRIS command failed");
    fdo::Error::Failed("playerd could not complete the command".into())
}
fn track_id(id: u64) -> OwnedObjectPath {
    OwnedObjectPath::try_from(format!("{PATH}/track/{id}")).unwrap()
}
fn current_id(view: &View) -> OwnedObjectPath {
    view.current()
        .map(|e| track_id(e.id))
        .unwrap_or_else(|| OwnedObjectPath::try_from(NO_TRACK).unwrap())
}
fn parse_id(path: &OwnedObjectPath) -> Option<u64> {
    path.as_str()
        .strip_prefix(&format!("{PATH}/track/"))?
        .parse()
        .ok()
}
fn micros(duration: Duration) -> i64 {
    duration.as_micros().min(i64::MAX as u128) as i64
}
fn owned(value: Value<'_>) -> OwnedValue {
    value.try_to_owned().expect("owned MPRIS value")
}
fn clone_metadata(meta: &Metadata) -> Metadata {
    meta.iter()
        .map(|(k, v)| {
            (
                k.clone(),
                v.try_clone()
                    .expect("metadata contains no file descriptors"),
            )
        })
        .collect()
}
fn metadata(control: &Control, entry: &Entry) -> Metadata {
    let mut out = HashMap::new();
    out.insert(
        "mpris:trackid".into(),
        owned(Value::from(track_id(entry.id))),
    );
    out.insert(
        "mpris:length".into(),
        OwnedValue::from(
            entry
                .item
                .duration_ms
                .saturating_mul(1000)
                .min(i64::MAX as u64) as i64,
        ),
    );
    for (key, value) in [
        ("xesam:title", &entry.item.title),
        ("xesam:album", &entry.item.album),
    ] {
        if !value.is_empty() {
            out.insert(key.into(), owned(Value::from(value.as_str())));
        }
    }
    for (key, value) in [
        ("xesam:artist", &entry.item.artist),
        ("xesam:albumArtist", &entry.item.album_artist),
    ] {
        if !value.is_empty() {
            out.insert(key.into(), owned(Value::from(vec![value.as_str()])));
        }
    }
    if entry.item.track_number > 0 {
        out.insert(
            "xesam:trackNumber".into(),
            OwnedValue::from(entry.item.track_number),
        );
    }
    if let Some(uri) = control.art_url(entry) {
        out.insert("mpris:artUrl".into(), owned(Value::from(uri)));
    }
    // Never expose signed playback URLs or passwords in metadata. Library
    // entries have a stable rocksky URI; local paths become valid file URIs.
    let uri = crate::control::item_uri(entry);
    let uri = if uri.starts_with('/') {
        reqwest::Url::from_file_path(&uri)
            .ok()
            .map(|u| u.to_string())
    } else if uri.starts_with("rocksky:") {
        Some(uri)
    } else {
        reqwest::Url::parse(&uri)
            .ok()
            .filter(|u| u.query().is_none() && u.username().is_empty() && u.password().is_none())
            .map(|u| u.to_string())
    };
    if let Some(uri) = uri {
        out.insert("xesam:url".into(), owned(Value::from(uri)));
    }
    out
}
fn playback(view: &View) -> &'static str {
    match view.snapshot.status.state {
        PlaybackState::Playing => "Playing",
        PlaybackState::Paused => "Paused",
        _ => "Stopped",
    }
}
fn loop_status(view: &View) -> &'static str {
    match view.snapshot.status.repeat {
        RepeatMode::One => "Track",
        RepeatMode::All => "Playlist",
        _ => "None",
    }
}
fn can_seek(view: &View) -> bool {
    view.current().is_some_and(|e| e.item.duration_ms > 0)
        && view.snapshot.status.state != PlaybackState::Stopped
}
fn can_next(view: &View) -> bool {
    view.snapshot.next_track.is_some()
}
fn can_previous(view: &View) -> bool {
    // Previous follows the engine's shuffle order and restarts the first song.
    view.current().is_some()
}

struct Root(Arc<Control>);
#[interface(name = "org.mpris.MediaPlayer2")]
impl Root {
    fn raise(&self) {}
    fn quit(&self) {
        self.0.shutdown.notify_one();
    }
    #[zbus(property)]
    fn can_quit(&self) -> bool {
        true
    }
    #[zbus(property)]
    fn can_raise(&self) -> bool {
        false
    }
    #[zbus(property)]
    fn has_track_list(&self) -> bool {
        true
    }
    #[zbus(property)]
    fn identity(&self) -> String {
        format!("playerd ({})", self.0.config.effective_name())
    }
    #[zbus(property)]
    fn fullscreen(&self) -> bool {
        false
    }
    #[zbus(property)]
    fn set_fullscreen(&self, value: bool) -> zbus::Result<()> {
        let result: fdo::Result<()> = if value {
            Err(fdo::Error::NotSupported("headless player".into()))
        } else {
            Ok(())
        };
        result.map_err(Into::into)
    }
    #[zbus(property)]
    fn can_set_fullscreen(&self) -> bool {
        false
    }
    #[zbus(property)]
    fn supported_uri_schemes(&self) -> Vec<&str> {
        vec!["file", "http", "https", "rocksky"]
    }
    #[zbus(property)]
    fn supported_mime_types(&self) -> Vec<&str> {
        vec![
            "audio/mpeg",
            "audio/flac",
            "audio/mp4",
            "audio/aac",
            "audio/ogg",
            "audio/opus",
            "audio/wav",
            "audio/x-wav",
            "audio/x-ms-wma",
        ]
    }
}
struct Player(Arc<Control>);
#[interface(name = "org.mpris.MediaPlayer2.Player")]
impl Player {
    async fn next(&self) -> fdo::Result<()> {
        if can_next(&self.0.view()) {
            self.0.command(EngineCmd::Next).await.map_err(error)?;
        }
        Ok(())
    }
    async fn previous(&self) -> fdo::Result<()> {
        if can_previous(&self.0.view()) {
            self.0.command(EngineCmd::Previous).await.map_err(error)?;
        }
        Ok(())
    }
    async fn pause(&self) -> fdo::Result<()> {
        if self.0.view().snapshot.status.state == PlaybackState::Playing {
            self.0.command(EngineCmd::Pause).await.map_err(error)?;
        }
        Ok(())
    }
    async fn play_pause(&self) -> fdo::Result<()> {
        let cmd = if self.0.view().snapshot.status.state == PlaybackState::Playing {
            EngineCmd::Pause
        } else {
            EngineCmd::Play
        };
        self.0.command(cmd).await.map_err(error)
    }
    async fn stop(&self) -> fdo::Result<()> {
        self.0.command(EngineCmd::Stop).await.map_err(error)
    }
    async fn play(&self) -> fdo::Result<()> {
        self.0.command(EngineCmd::Play).await.map_err(error)
    }
    async fn seek(&self, offset: i64) -> fdo::Result<()> {
        let view = self.0.view();
        if !can_seek(&view) {
            return Ok(());
        }
        let position = micros(view.snapshot.status.position)
            .saturating_add(offset)
            .max(0);
        let length = view
            .current()
            .unwrap()
            .item
            .duration_ms
            .saturating_mul(1000);
        if position as u64 > length {
            self.0.command(EngineCmd::Next).await.map_err(error)
        } else {
            self.0
                .command(EngineCmd::Seek(Duration::from_micros(position as u64)))
                .await
                .map_err(error)
        }
    }
    async fn set_position(&self, track_id: OwnedObjectPath, position: i64) -> fdo::Result<()> {
        let _guard = self.0.gate.lock().await;
        let view = self.0.view();
        if position < 0
            || !can_seek(&view)
            || current_id(&view) != track_id
            || position as u64
                > view
                    .current()
                    .unwrap()
                    .item
                    .duration_ms
                    .saturating_mul(1000)
        {
            return Ok(());
        }
        self.0
            .apply(EngineCmd::Seek(Duration::from_micros(position as u64)))
            .await
            .map_err(error)
    }
    async fn open_uri(&self, uri: &str) -> fdo::Result<()> {
        self.0.add(uri, None, true).await.map(|_| ()).map_err(error)
    }
    #[zbus(property)]
    fn playback_status(&self) -> String {
        playback(&self.0.view()).into()
    }
    #[zbus(property)]
    fn loop_status(&self) -> String {
        loop_status(&self.0.view()).into()
    }
    #[zbus(property)]
    async fn set_loop_status(&self, value: &str) -> zbus::Result<()> {
        let result: fdo::Result<()> = async {
            let mode = match value {
                "None" => RepeatMode::Off,
                "Track" => RepeatMode::One,
                "Playlist" => RepeatMode::All,
                _ => return Err(fdo::Error::InvalidArgs("invalid loop status".into())),
            };
            self.0
                .command(EngineCmd::SetRepeat(mode))
                .await
                .map_err(error)
        }
        .await;
        result.map_err(Into::into)
    }
    #[zbus(property)]
    fn rate(&self) -> f64 {
        1.0
    }
    #[zbus(property)]
    async fn set_rate(&self, value: f64) -> zbus::Result<()> {
        let result: fdo::Result<()> = async {
            if value == 0. {
                return self.pause().await;
            }
            if value != 1. {
                return Err(fdo::Error::NotSupported(
                    "only playback rate 1.0 is supported".into(),
                ));
            }
            Ok(())
        }
        .await;
        result.map_err(Into::into)
    }
    #[zbus(property)]
    fn minimum_rate(&self) -> f64 {
        1.0
    }
    #[zbus(property)]
    fn maximum_rate(&self) -> f64 {
        1.0
    }
    #[zbus(property)]
    fn shuffle(&self) -> bool {
        self.0.view().snapshot.status.shuffle
    }
    #[zbus(property)]
    async fn set_shuffle(&self, value: bool) -> zbus::Result<()> {
        let result: fdo::Result<()> = async {
            self.0
                .command(EngineCmd::SetShuffle(value))
                .await
                .map_err(error)
        }
        .await;
        result.map_err(Into::into)
    }
    #[zbus(property)]
    fn volume(&self) -> f64 {
        self.0.view().snapshot.volume as f64
    }
    #[zbus(property)]
    async fn set_volume(&self, value: f64) -> zbus::Result<()> {
        let result: fdo::Result<()> = async {
            if !value.is_finite() {
                return Err(fdo::Error::InvalidArgs("invalid volume".into()));
            }
            self.0
                .command(EngineCmd::SetVolume(value.clamp(0., 1.) as f32))
                .await
                .map_err(error)
        }
        .await;
        result.map_err(Into::into)
    }
    #[zbus(property)]
    fn metadata(&self) -> Metadata {
        self.0
            .view()
            .current()
            .map(|e| metadata(&self.0, e))
            .unwrap_or_default()
    }
    #[zbus(property(emits_changed_signal = "false"))]
    fn position(&self) -> i64 {
        micros(self.0.view().snapshot.status.position)
    }
    #[zbus(property)]
    fn can_go_next(&self) -> bool {
        can_next(&self.0.view())
    }
    #[zbus(property)]
    fn can_go_previous(&self) -> bool {
        can_previous(&self.0.view())
    }
    #[zbus(property)]
    fn can_play(&self) -> bool {
        !self.0.view().entries.is_empty()
    }
    #[zbus(property)]
    fn can_pause(&self) -> bool {
        self.0.view().current().is_some()
    }
    #[zbus(property)]
    fn can_seek(&self) -> bool {
        can_seek(&self.0.view())
    }
    #[zbus(property)]
    fn can_control(&self) -> bool {
        true
    }
    #[zbus(signal)]
    async fn seeked(context: &SignalContext<'_>, position: i64) -> zbus::Result<()>;
}
struct TrackList(Arc<Control>);
#[interface(name = "org.mpris.MediaPlayer2.TrackList")]
impl TrackList {
    fn get_tracks_metadata(&self, track_ids: Vec<OwnedObjectPath>) -> fdo::Result<Vec<Metadata>> {
        let view = self.0.view();
        track_ids
            .iter()
            .map(|path| {
                view.entries
                    .iter()
                    .find(|e| Some(e.id) == parse_id(path))
                    .map(|e| metadata(&self.0, e))
                    .ok_or_else(|| fdo::Error::InvalidArgs("unknown track id".into()))
            })
            .collect()
    }
    async fn add_track(
        &self,
        uri: &str,
        after_track: OwnedObjectPath,
        set_as_current: bool,
    ) -> fdo::Result<()> {
        let pos = if after_track.as_str() == NO_TRACK {
            0
        } else {
            self.0
                .view()
                .entries
                .iter()
                .position(|e| Some(e.id) == parse_id(&after_track))
                .ok_or_else(|| fdo::Error::InvalidArgs("unknown track id".into()))?
                + 1
        };
        self.0
            .add(uri, Some(pos), set_as_current)
            .await
            .map(|_| ())
            .map_err(error)
    }
    async fn remove_track(&self, track_id: OwnedObjectPath) -> fdo::Result<()> {
        let pos = self
            .0
            .view()
            .entries
            .iter()
            .position(|e| Some(e.id) == parse_id(&track_id))
            .ok_or_else(|| fdo::Error::InvalidArgs("unknown track id".into()))?;
        self.0.remove(pos, pos + 1).await.map_err(error)
    }
    async fn go_to(&self, track_id: OwnedObjectPath) -> fdo::Result<()> {
        let pos = self
            .0
            .view()
            .entries
            .iter()
            .position(|e| Some(e.id) == parse_id(&track_id))
            .ok_or_else(|| fdo::Error::InvalidArgs("unknown track id".into()))?;
        self.0
            .command(EngineCmd::PlayAt {
                index: pos,
                position: Duration::ZERO,
            })
            .await
            .map_err(error)
    }
    #[zbus(property(emits_changed_signal = "invalidates"))]
    fn tracks(&self) -> Vec<OwnedObjectPath> {
        self.0
            .view()
            .entries
            .iter()
            .map(|e| track_id(e.id))
            .collect()
    }
    #[zbus(property)]
    fn can_edit_tracks(&self) -> bool {
        true
    }
    #[zbus(signal)]
    async fn track_list_replaced(
        context: &SignalContext<'_>,
        tracks: Vec<OwnedObjectPath>,
        current_track: OwnedObjectPath,
    ) -> zbus::Result<()>;
    #[zbus(signal)]
    async fn track_metadata_changed(
        context: &SignalContext<'_>,
        track_id: OwnedObjectPath,
        metadata: Metadata,
    ) -> zbus::Result<()>;
}
/// Holding the connection owns the well-known bus name. The task owns the
/// connection, so aborting it releases the name and all registered objects.
pub async fn start(control: Arc<Control>) -> zbus::Result<tokio::task::JoinHandle<()>> {
    let connection = zbus::connection::Builder::session()?
        .name("org.mpris.MediaPlayer2.playerd")?
        .serve_at(PATH, Root(control.clone()))?
        .serve_at(PATH, Player(control.clone()))?
        .serve_at(PATH, TrackList(control.clone()))?
        .build()
        .await?;
    tracing::info!("MPRIS available as org.mpris.MediaPlayer2.playerd");
    Ok(tokio::spawn(async move {
        let context = SignalContext::new(&connection, PATH).unwrap();
        let mut last = control.view();
        let mut last_at = Instant::now();
        let mut last_meta = last
            .current()
            .map(|e| metadata(&control, e))
            .unwrap_or_default();
        let mut art_task: Option<tokio::task::JoinHandle<()>> = None;
        let mut art_entry = None;
        let mut ticker = tokio::time::interval(Duration::from_millis(250));
        loop {
            ticker.tick().await;
            let view = control.view();
            let now = Instant::now();
            let art_key = view.current().map(|e| (e.id, e.item.album_art.clone()));
            if art_key != art_entry {
                if let Some(job) = art_task.take() {
                    job.abort();
                }
                art_entry = art_key;
                if let Some(entry) = view.current().cloned() {
                    let c = control.clone();
                    art_task = Some(tokio::spawn(async move {
                        c.prepare_art(entry).await;
                    }));
                }
            }
            let meta = view
                .current()
                .map(|e| metadata(&control, e))
                .unwrap_or_default();
            let mut changed: HashMap<&str, Value<'_>> = HashMap::new();
            if playback(&view) != playback(&last) {
                changed.insert("PlaybackStatus", Value::from(playback(&view)));
            }
            if loop_status(&view) != loop_status(&last) {
                changed.insert("LoopStatus", Value::from(loop_status(&view)));
            }
            if view.snapshot.status.shuffle != last.snapshot.status.shuffle {
                changed.insert("Shuffle", Value::from(view.snapshot.status.shuffle));
            }
            if view.snapshot.volume != last.snapshot.volume {
                changed.insert("Volume", Value::from(view.snapshot.volume as f64));
            }
            if meta != last_meta {
                changed.insert("Metadata", Value::from(clone_metadata(&meta)));
            }
            for (name, new, old) in [
                ("CanGoNext", can_next(&view), can_next(&last)),
                ("CanGoPrevious", can_previous(&view), can_previous(&last)),
                (
                    "CanPlay",
                    !view.entries.is_empty(),
                    !last.entries.is_empty(),
                ),
                (
                    "CanPause",
                    view.current().is_some(),
                    last.current().is_some(),
                ),
                ("CanSeek", can_seek(&view), can_seek(&last)),
            ] {
                if new != old {
                    changed.insert(name, Value::from(new));
                }
            }
            if !changed.is_empty() {
                let _ = fdo::Properties::properties_changed(
                    &context,
                    "org.mpris.MediaPlayer2.Player".try_into().unwrap(),
                    &changed.iter().map(|(key, value)| (*key, value)).collect(),
                    &[],
                )
                .await;
            }
            if view.version != last.version {
                let tracks = view.entries.iter().map(|e| track_id(e.id)).collect();
                let _ = TrackList::track_list_replaced(&context, tracks, current_id(&view)).await;
                let _ = fdo::Properties::properties_changed(
                    &context,
                    "org.mpris.MediaPlayer2.TrackList".try_into().unwrap(),
                    &HashMap::new(),
                    &["Tracks"],
                )
                .await;
            } else if meta != last_meta && view.current().is_some() {
                let _ = TrackList::track_metadata_changed(
                    &context,
                    current_id(&view),
                    clone_metadata(&meta),
                )
                .await;
            }
            let expected = last.snapshot.status.position
                + if last.snapshot.status.state == PlaybackState::Playing {
                    now - last_at
                } else {
                    Duration::ZERO
                };
            if current_id(&view) == current_id(&last)
                && (view.snapshot.seek_revision != last.snapshot.seek_revision
                    || view.snapshot.status.position.abs_diff(expected)
                        > Duration::from_millis(1000))
            {
                let _ = Player::seeked(&context, micros(view.snapshot.status.position)).await;
            }
            last = view;
            last_at = now;
            last_meta = meta;
        }
    }))
}

#[cfg(test)]
mod tests;
