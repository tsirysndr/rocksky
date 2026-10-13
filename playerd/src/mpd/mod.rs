//! MPD wire protocol over the existing playerd engine. No second player.
mod library;
mod protocol;
use crate::{
    control::{item_uri, Control, Entry, View},
    engine::EngineCmd,
};
use protocol::{arity, boolean, kv, number, range, seconds, tokens, Error, Result};
use rockbox_playback::{PlaybackState, RepeatMode};
use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
    sync::RwLock,
    task::JoinSet,
};
const GREETING: &str = "OK MPD 0.23.5\n";
const SUBS: [&str; 5] = ["playlist", "player", "mixer", "options", "database"];
const COMMANDS:&str="add addid albumart binarylimit channels clear clearerror close commands config count currentsong decoders delete deleteid find findadd getvol idle list listall listallinfo listplaylist listplaylistinfo listplaylists load lsinfo move moveid next noidle notcommands outputs pause ping play playid playlist playlistfind playlistid playlistinfo playlistsearch plchanges plchangesposid previous random readpicture repeat rescan search searchadd seek seekcur seekid setvol single stats status stop tagtypes update urlhandlers volume";
struct State {
    control: Arc<Control>,
    library: RwLock<Vec<Entry>>,
    events: Mutex<[u64; 5]>,
    refresh: tokio::sync::Notify,
    started: Instant,
    options: Mutex<(bool, bool)>,
}
impl State {
    fn bump(&self, i: usize) {
        self.events.lock().unwrap()[i] += 1;
    }
    fn options(&self, mode: RepeatMode) -> (bool, bool) {
        let mut opts = self.options.lock().unwrap();
        let expected = if opts.1 && opts.0 {
            RepeatMode::One
        } else if opts.0 {
            RepeatMode::All
        } else {
            RepeatMode::Off
        };
        if expected != mode {
            *opts = (mode != RepeatMode::Off, mode == RepeatMode::One);
        }
        *opts
    }
    async fn database(&self) -> Vec<Entry> {
        library::merge(&self.library.read().await, &self.control)
    }
}
/// Bind synchronously at startup so an occupied configured port is an error,
/// never a silently different port. Dropping the task closes all connections.
pub async fn start(
    control: Arc<Control>,
    address: (String, u16),
) -> anyhow::Result<tokio::task::JoinHandle<()>> {
    let listener = TcpListener::bind((address.0.as_str(), address.1)).await?;
    tracing::info!(address=%listener.local_addr()?,"MPD listening");
    Ok(tokio::spawn(serve(listener, control)))
}
async fn serve(listener: TcpListener, control: Arc<Control>) {
    let repeat = control.view().snapshot.status.repeat;
    let state = Arc::new(State {
        control,
        library: RwLock::new(Vec::new()),
        events: Mutex::new([0; 5]),
        refresh: tokio::sync::Notify::new(),
        started: Instant::now(),
        options: Mutex::new((repeat != RepeatMode::Off, repeat == RepeatMode::One)),
    });
    let mut jobs = JoinSet::new();
    let db = state.clone();
    jobs.spawn(async move {
        loop {
            match library::fetch(&db.control).await {
                Ok(entries)=>{*db.library.write().await=entries;db.bump(4);}
                Err(error)=>tracing::warn!(%error,"MPD library refresh failed"),
            }
            tokio::select!{_=tokio::time::sleep(Duration::from_secs(300))=>{},_=db.refresh.notified()=>{}}
        }
    });
    let mut last = state.control.view();
    let mut tick = tokio::time::interval(Duration::from_millis(250));
    loop {
        tokio::select! {
            accepted=listener.accept()=>match accepted {
                Ok((socket,_))=>{if jobs.len()<65 {let state=state.clone();jobs.spawn(async move{if let Err(e)=connection(socket,state).await{tracing::debug!(%e,"MPD connection closed");}});}},
                Err(e)=>{tracing::warn!(%e,"MPD accept failed");tokio::time::sleep(Duration::from_millis(100)).await;}
            },
            _=jobs.join_next(),if jobs.len()>1=>{},
            _=tick.tick()=>{
                let now=state.control.view();
                if now.version!=last.version {state.bump(0);}
                let a=&now.snapshot.status;let b=&last.snapshot.status;
                if now.snapshot.seek_revision != last.snapshot.seek_revision || a.state!=b.state||now.current().map(|e|e.id)!=last.current().map(|e|e.id)||a.duration!=b.duration||a.position.abs_diff(b.position)>Duration::from_secs(2)||(a.position.is_zero()!=b.position.is_zero()) {state.bump(1);}
                if now.snapshot.volume!=last.snapshot.volume{state.bump(2);}
                if a.repeat!=b.repeat||a.shuffle!=b.shuffle{state.bump(3);}
                last=now;
            }
        }
    }
}
async fn line(
    reader: &mut BufReader<tokio::net::tcp::OwnedReadHalf>,
) -> std::io::Result<Option<String>> {
    let mut bytes = Vec::new();
    let n = reader
        .take(16 * 1024 + 1)
        .read_until(b'\n', &mut bytes)
        .await?;
    if n == 0 {
        return Ok(None);
    }
    if n > 16 * 1024 || bytes.last() != Some(&b'\n') {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "MPD line too long or truncated",
        ));
    }
    bytes.pop();
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}
async fn connection(socket: TcpStream, state: Arc<State>) -> std::io::Result<()> {
    let (read, mut write) = socket.into_split();
    let mut reader = BufReader::new(read);
    write.write_all(GREETING.as_bytes()).await?;
    let mut list: Option<(bool, Vec<String>)> = None;
    let mut idle: Option<Vec<usize>> = None;
    let mut seen = *state.events.lock().unwrap();
    let mut tick = tokio::time::interval(Duration::from_millis(100));
    let mut binary_limit = 8192usize;
    loop {
        // Keep the read future alive across idle ticks: read_until is not
        // cancellation safe when a client sends a partial command.
        let pending = line(&mut reader);
        tokio::pin!(pending);
        let raw = loop {
            tokio::select! {
                raw=&mut pending=>break raw?,
                _=tick.tick(),if idle.is_some()=>{
                    let counters=*state.events.lock().unwrap();
                    let changed:Vec<_>=idle.as_ref().unwrap().iter().copied().filter(|i|counters[*i]>seen[*i]).collect();
                    if !changed.is_empty(){let mut body=String::new();for i in changed {seen[i]=counters[i];body.push_str(&kv("changed",SUBS[i]));}body.push_str("OK\n");write.write_all(body.as_bytes()).await?;idle=None;}
                }
            }
        };
        let Some(raw) = raw else {
            return Ok(());
        };
        let parsed = match tokens(&raw) {
            Ok(t) => t,
            Err(e) => {
                if let Some((_, commands)) = &mut list {
                    if commands.len() >= 1024 {
                        return Ok(());
                    }
                    commands.push(raw);
                } else {
                    write.write_all(e.ack("", 0).as_bytes()).await?;
                }
                continue;
            }
        };
        if parsed.is_empty() {
            continue;
        }
        let cmd = &parsed[0];
        let args = &parsed[1..];
        if let Some((ok, commands)) = &mut list {
            if cmd == "command_list_end" {
                if !args.is_empty() {
                    write
                        .write_all(
                            Error::argument("unexpected arguments")
                                .ack(cmd, 0)
                                .as_bytes(),
                        )
                        .await?;
                    list = None;
                    continue;
                }
                let commands = std::mem::take(commands);
                let ok = *ok;
                list = None;
                let mut failed = false;
                for (i, command) in commands.iter().enumerate() {
                    let result = match tokens(command) {
                        Ok(p) if !p.is_empty() => dispatch(&state, &p[0], &p[1..]).await,
                        Ok(_) => Ok(String::new()),
                        Err(e) => Err(e),
                    };
                    match result {
                        Ok(body) => {
                            write.write_all(body.as_bytes()).await?;
                            if ok {
                                write.write_all(b"list_OK\n").await?;
                            }
                        }
                        Err(e) => {
                            let name = command.split_whitespace().next().unwrap_or("");
                            write.write_all(e.ack(name, i).as_bytes()).await?;
                            failed = true;
                            break;
                        }
                    }
                }
                if !failed {
                    write.write_all(b"OK\n").await?;
                }
            } else if commands.len() >= 1024 {
                write
                    .write_all(
                        Error::argument("command list too large")
                            .ack(cmd, 0)
                            .as_bytes(),
                    )
                    .await?;
                return Ok(());
            } else {
                commands.push(raw);
            }
            continue;
        }
        if idle.is_some() {
            if cmd != "noidle" {
                write
                    .write_all(
                        Error::argument("only noidle is allowed while idle")
                            .ack(cmd, 0)
                            .as_bytes(),
                    )
                    .await?;
                return Ok(());
            }
            idle = None;
            write.write_all(b"OK\n").await?;
            continue;
        }
        match cmd.as_str() {
            "command_list_begin" | "command_list_ok_begin" if args.is_empty() => {
                list = Some((cmd == "command_list_ok_begin", Vec::new()));
                continue;
            }
            "noidle" => continue, // A crossed idle notification must not add an extra OK.
            "close" if args.is_empty() => return Ok(()),
            "idle" => {
                let requested: Result<Vec<usize>> = if args.is_empty() {
                    Ok((0..SUBS.len()).collect())
                } else {
                    args.iter()
                        .map(|s| {
                            SUBS.iter()
                                .position(|v| v == s)
                                .ok_or_else(|| Error::argument("unsupported idle subsystem"))
                        })
                        .collect()
                };
                match requested {
                    Ok(subs) => idle = Some(subs),
                    Err(e) => write.write_all(e.ack(cmd, 0).as_bytes()).await?,
                };
                continue;
            }
            "binarylimit" => {
                let result = arity(args, 1, 1)
                    .and_then(|_| number(&args[0]))
                    .and_then(|n| {
                        if n > 0 && n <= 4 * 1024 * 1024 {
                            Ok(n)
                        } else {
                            Err(Error::argument("binary limit must be 1..4194304"))
                        }
                    });
                match result {
                    Ok(n) => {
                        binary_limit = n;
                        write.write_all(b"OK\n").await?;
                    }
                    Err(e) => write.write_all(e.ack(cmd, 0).as_bytes()).await?,
                }
                continue;
            }
            "albumart" | "readpicture" => {
                match art(&state, args, binary_limit, cmd == "readpicture").await {
                    Ok(bytes) => write.write_all(&bytes).await?,
                    Err(e) => write.write_all(e.ack(cmd, 0).as_bytes()).await?,
                }
                continue;
            }
            _ => {}
        }
        match dispatch(&state, cmd, args).await {
            Ok(body) => {
                write.write_all(body.as_bytes()).await?;
                write.write_all(b"OK\n").await?;
            }
            Err(e) => write.write_all(e.ack(cmd, 0).as_bytes()).await?,
        }
    }
}
fn system(e: anyhow::Error) -> Error {
    tracing::warn!(error=%e,"MPD command failed");
    Error::system()
}
fn song(e: &Entry, pos: Option<usize>) -> String {
    let mut s = kv("file", item_uri(e));
    for (k, v) in [
        ("Title", &e.item.title),
        ("Artist", &e.item.artist),
        ("Album", &e.item.album),
        ("AlbumArtist", &e.item.album_artist),
    ] {
        if !v.is_empty() {
            s += &kv(k, v);
        }
    }
    if e.item.track_number > 0 {
        s += &kv("Track", e.item.track_number);
    }
    s += &kv("Time", e.item.duration_ms / 1000);
    s += &kv(
        "duration",
        format!("{:.3}", e.item.duration_ms as f64 / 1000.),
    );
    if let Some(pos) = pos {
        s += &kv("Pos", pos);
        s += &kv("Id", e.id);
    }
    s
}
fn index(view: &View, value: &str, id: bool) -> Result<usize> {
    let n = number(value)?;
    if id {
        view.entries
            .iter()
            .position(|e| e.id == n as u64)
            .ok_or_else(|| Error::missing("unknown song id"))
    } else if n < view.entries.len() {
        Ok(n)
    } else {
        Err(Error::missing("unknown song position"))
    }
}
async fn dispatch(state: &Arc<State>, cmd: &str, args: &[String]) -> Result<String> {
    let c = &state.control;
    let view = c.view();
    let status = &view.snapshot.status;
    let mut out = String::new();
    match cmd {
        "ping" | "clearerror" | "notcommands" | "channels" | "config" | "decoders" => {
            arity(args, 0, 0)?;
        }
        "commands" => {
            arity(args, 0, 0)?;
            for cmd in COMMANDS.split_whitespace() {
                out += &kv("command", cmd);
            }
        }
        "urlhandlers" => {
            arity(args, 0, 0)?;
            for h in ["http://", "https://", "file://", "rocksky:"] {
                out += &kv("handler", h);
            }
        }
        "tagtypes" => {
            if args.is_empty() {
                for tag in ["Artist", "Album", "AlbumArtist", "Title", "Track"] {
                    out += &kv("tagtype", tag);
                }
            } else {
                return Err(Error::argument("tag filtering is not supported"));
            }
        }
        "outputs" => {
            arity(args, 0, 0)?;
            out = "outputid: 0\noutputname: playerd\noutputenabled: 1\n".into();
        }
        "status" => {
            arity(args, 0, 0)?;
            let (repeat, single) = state.options(status.repeat);
            out += &kv("volume", (view.snapshot.volume * 100.).round() as i32);
            out += &kv("repeat", u8::from(repeat));
            out += &kv("random", u8::from(status.shuffle));
            out += &kv("single", u8::from(single));
            out += "consume: 0\n";
            out += &kv("playlist", view.version);
            out += &kv("playlistlength", view.entries.len());
            out += &kv(
                "state",
                match status.state {
                    PlaybackState::Playing => "play",
                    PlaybackState::Paused => "pause",
                    _ => "stop",
                },
            );
            if let Some(entry) = view.current() {
                out += &kv("song", status.index.unwrap());
                out += &kv("songid", entry.id);
                out += &kv("elapsed", format!("{:.3}", status.position.as_secs_f64()));
                out += &kv(
                    "duration",
                    format!("{:.3}", entry.item.duration_ms as f64 / 1000.),
                );
                out += &kv(
                    "time",
                    format!(
                        "{}:{}",
                        status.position.as_secs(),
                        entry.item.duration_ms / 1000
                    ),
                );
                if let Some(meta) = &status.metadata {
                    if meta.sample_rate > 0 {
                        out += &kv("audio", format!("{}:16:2", meta.sample_rate));
                    }
                    out += &kv("bitrate", meta.bitrate);
                }
                if let Some(next) = view
                    .snapshot
                    .next_track
                    .as_ref()
                    .and_then(|u| view.entries.iter().enumerate().find(|(_, e)| &e.uri == u))
                {
                    out += &kv("nextsong", next.0);
                    out += &kv("nextsongid", next.1.id);
                }
            }
        }
        "currentsong" => {
            arity(args, 0, 0)?;
            if let Some(e) = view.current() {
                out = song(e, status.index);
            }
        }
        "getvol" => {
            arity(args, 0, 0)?;
            out = kv("volume", (view.snapshot.volume * 100.).round() as i32);
        }
        "setvol" | "volume" => {
            arity(args, 1, 1)?;
            let n: i32 = args[0]
                .parse()
                .map_err(|_| Error::argument("invalid volume"))?;
            let volume = if cmd == "volume" {
                (view.snapshot.volume * 100.).round() as i32 + n
            } else {
                n
            };
            if !(0..=100).contains(&volume) {
                return Err(Error::argument("volume must be 0..100"));
            }
            c.command(EngineCmd::SetVolume(volume as f32 / 100.))
                .await
                .map_err(system)?;
        }
        "play" | "playid" => {
            arity(args, 0, 1)?;
            let command = if let Some(arg) = args.first() {
                EngineCmd::PlayAt {
                    index: index(&view, arg, cmd == "playid")?,
                    position: Duration::ZERO,
                }
            } else {
                EngineCmd::Play
            };
            c.command(command).await.map_err(system)?;
        }
        "pause" => {
            arity(args, 0, 1)?;
            let paused = if let Some(arg) = args.first() {
                boolean(arg)?
            } else {
                status.state == PlaybackState::Playing
            };
            c.command(if paused {
                EngineCmd::Pause
            } else {
                EngineCmd::Play
            })
            .await
            .map_err(system)?;
        }
        "stop" | "next" | "previous" | "clear" => {
            arity(args, 0, 0)?;
            c.command(match cmd {
                "stop" => EngineCmd::Stop,
                "next" => EngineCmd::Next,
                "previous" => EngineCmd::Previous,
                _ => EngineCmd::Clear,
            })
            .await
            .map_err(system)?;
        }
        "seek" | "seekid" | "seekcur" => {
            let (pos, time) = if cmd == "seekcur" {
                arity(args, 1, 1)?;
                (
                    status
                        .index
                        .ok_or_else(|| Error::missing("no current song"))?,
                    &args[0],
                )
            } else {
                arity(args, 2, 2)?;
                (index(&view, &args[0], cmd == "seekid")?, &args[1])
            };
            let mut sec = seconds(time)?;
            if cmd == "seekcur" && (time.starts_with('+') || time.starts_with('-')) {
                sec += status.position.as_secs_f64();
            }
            if sec < 0. {
                return Err(Error::argument("negative seek position"));
            }
            let command = if Some(pos) == status.index && status.state != PlaybackState::Stopped {
                EngineCmd::Seek(Duration::from_secs_f64(sec))
            } else {
                EngineCmd::PlayAt {
                    index: pos,
                    position: Duration::from_secs_f64(sec),
                }
            };
            c.command(command).await.map_err(system)?;
        }
        "random" => {
            arity(args, 1, 1)?;
            c.command(EngineCmd::SetShuffle(boolean(&args[0])?))
                .await
                .map_err(system)?;
        }
        "repeat" | "single" => {
            arity(args, 1, 1)?;
            let val = boolean(&args[0])?;
            let (mut repeat, mut single) = state.options(status.repeat);
            if cmd == "repeat" {
                repeat = val;
            } else {
                single = val;
            }
            if single && !repeat {
                return Err(Error::argument("single without repeat is not supported"));
            }
            c.command(EngineCmd::SetRepeat(if single {
                RepeatMode::One
            } else if repeat {
                RepeatMode::All
            } else {
                RepeatMode::Off
            }))
            .await
            .map_err(system)?;
            *state.options.lock().unwrap() = (repeat, single);
        }
        "playlist" | "playlistinfo" | "playlistid" | "plchanges" | "plchangesposid" => {
            arity(
                args,
                usize::from(cmd.starts_with("plchanges")),
                if cmd.starts_with("plchanges") { 2 } else { 1 },
            )?;
            let selected = if cmd == "playlistid" && !args.is_empty() {
                let pos = index(&view, &args[0], true)?;
                pos..pos + 1
            } else if cmd.starts_with("plchanges") {
                let version = number(&args[0])? as u64;
                if version == view.version {
                    return Ok(out);
                }
                if args.len() == 2 {
                    range(&args[1], view.entries.len())?
                } else {
                    0..view.entries.len()
                }
            } else if !args.is_empty() {
                range(&args[0], view.entries.len())?
            } else {
                0..view.entries.len()
            };
            for pos in selected {
                let entry = &view.entries[pos];
                if cmd == "plchangesposid" {
                    out += &kv("cpos", pos);
                    out += &kv("Id", entry.id);
                } else if cmd == "playlist" {
                    out += &format!("{pos}:{}\n", protocol::clean(&item_uri(entry)));
                } else {
                    out += &song(entry, Some(pos));
                }
            }
        }
        "add" | "addid" => {
            arity(args, 1, 2)?;
            let pos = args.get(1).map(|s| number(s)).transpose()?;
            let id = c.add(&args[0], pos, false).await.map_err(system)?;
            if cmd == "addid" {
                out = kv("Id", id);
            }
        }
        "delete" | "deleteid" => {
            arity(args, 1, 1)?;
            let r = if cmd == "deleteid" {
                let pos = index(&view, &args[0], true)?;
                pos..pos + 1
            } else {
                range(&args[0], view.entries.len())?
            };
            c.remove(r.start, r.end).await.map_err(system)?;
        }
        "move" | "moveid" => {
            arity(args, 2, 2)?;
            let from = index(&view, &args[0], cmd == "moveid")?;
            let to = index(&view, &args[1], false)?;
            c.move_entry(from, to).await.map_err(system)?;
        }
        "playlistfind" | "playlistsearch" => {
            arity(args, 2, 2)?;
            for (pos, e) in view.entries.iter().enumerate() {
                if library::matches(e, args, cmd == "playlistfind")? {
                    out += &song(e, Some(pos));
                }
            }
        }
        "find" | "search" | "findadd" | "searchadd" | "count" => {
            if args.is_empty() && cmd != "count" {
                return Err(Error::argument("missing filter"));
            }
            let mut found = Vec::new();
            for e in state.database().await {
                if library::matches(&e, args, !cmd.starts_with("search"))? {
                    found.push(e);
                }
            }
            if cmd.ends_with("add") {
                let _guard = c.gate.lock().await;
                let mut resolved = Vec::new();
                for e in found {
                    let (url, _) = c.resolve(&item_uri(&e)).await.map_err(system)?;
                    resolved.push((url, e.item));
                }
                c.add_resolved(resolved, None, false)
                    .await
                    .map_err(system)?;
            } else if cmd == "count" {
                out += &kv("songs", found.len());
                out += &kv(
                    "playtime",
                    found.iter().map(|e| e.item.duration_ms / 1000).sum::<u64>(),
                );
            } else {
                for e in found {
                    out += &song(&e, None);
                }
            }
        }
        "list" => {
            arity(args, 1, usize::MAX)?;
            let mut values = BTreeSet::new();
            for e in state.database().await {
                if library::matches(&e, &args[1..], true)? {
                    let value = library::tag(&e, &args[0])
                        .ok_or_else(|| Error::argument("unsupported tag"))?;
                    if !value.is_empty() {
                        values.insert(value.to_owned());
                    }
                }
            }
            for value in values {
                out += &kv(&args[0], value);
            }
        }
        "lsinfo" | "listall" | "listallinfo" => {
            arity(args, 0, 1)?;
            let dir = args.first().map(|s| s.trim_matches('/')).unwrap_or("");
            let mut dirs = BTreeSet::new();
            for e in state.database().await {
                let path = library::path(&e);
                if cmd == "lsinfo" {
                    if path == dir {
                        out += &song(&e, None);
                    } else if let Some(rest) = if dir.is_empty() {
                        Some(path.as_str())
                    } else {
                        path.strip_prefix(&format!("{dir}/"))
                    } {
                        let first = rest.split('/').next().unwrap();
                        dirs.insert(if dir.is_empty() {
                            first.to_string()
                        } else {
                            format!("{dir}/{first}")
                        });
                    }
                } else if dir.is_empty() || path == dir || path.starts_with(&format!("{dir}/")) {
                    out += &if cmd == "listall" {
                        kv("file", item_uri(&e))
                    } else {
                        song(&e, None)
                    };
                }
            }
            for dir in dirs {
                out += &kv("directory", dir);
            }
        }
        "listplaylists" => {
            arity(args, 0, 0)?;
            for p in library::playlists(c).await.map_err(system)? {
                out += &kv("playlist", p.name);
            }
        }
        "listplaylist" | "listplaylistinfo" | "load" => {
            arity(args, 1, 1)?;
            let tracks = library::playlist(c, &args[0]).await.map_err(system)?;
            if cmd == "load" {
                let _guard = c.gate.lock().await;
                let mut resolved = Vec::new();
                for e in tracks {
                    let (url, _) = c.resolve(&item_uri(&e)).await.map_err(system)?;
                    resolved.push((url, e.item));
                }
                c.add_resolved(resolved, None, false)
                    .await
                    .map_err(system)?;
            } else {
                for e in tracks {
                    out += &if cmd == "listplaylist" {
                        kv("file", item_uri(&e))
                    } else {
                        song(&e, None)
                    };
                }
            }
        }
        "update" | "rescan" => {
            arity(args, 0, 1)?;
            state.refresh.notify_one();
            out = kv("updating_db", 1);
        }
        "stats" => {
            arity(args, 0, 0)?;
            let db = state.database().await;
            out += &kv(
                "artists",
                db.iter()
                    .map(|e| &e.item.artist)
                    .collect::<BTreeSet<_>>()
                    .len(),
            );
            out += &kv(
                "albums",
                db.iter()
                    .map(|e| (&e.item.artist, &e.item.album))
                    .collect::<BTreeSet<_>>()
                    .len(),
            );
            out += &kv("songs", db.len());
            out += &kv("uptime", state.started.elapsed().as_secs());
            out += "playtime: 0\n";
            out += &kv(
                "db_playtime",
                db.iter().map(|e| e.item.duration_ms / 1000).sum::<u64>(),
            );
            out += "db_update: 0\n";
        }
        "kill" => {
            return Err(Error {
                code: 4,
                message: "kill not permitted".into(),
            })
        }
        "idle"
        | "noidle"
        | "close"
        | "command_list_begin"
        | "command_list_ok_begin"
        | "command_list_end"
        | "albumart"
        | "readpicture"
        | "binarylimit" => return Err(Error::argument("command is not allowed in a command list")),
        _ => {
            return Err(Error {
                code: 5,
                message: format!("unknown command {cmd}"),
            })
        }
    }
    Ok(out)
}
async fn art(state: &State, args: &[String], limit: usize, with_type: bool) -> Result<Vec<u8>> {
    arity(args, 2, 2)?;
    let offset = number(&args[1])?;
    let entry = state
        .database()
        .await
        .into_iter()
        .find(|e| item_uri(e) == args[0])
        .ok_or_else(|| Error::missing("unknown song"))?;
    state.control.prepare_art(entry.clone()).await;
    let uri = state
        .control
        .art_url(&entry)
        .ok_or_else(|| Error::missing("no cover art"))?;
    let path = reqwest::Url::parse(&uri)
        .ok()
        .and_then(|u| u.to_file_path().ok())
        .ok_or_else(|| Error::missing("no cached cover art"))?;
    let bytes = tokio::task::spawn_blocking(move || std::fs::read(path))
        .await
        .map_err(|_| Error::system())?
        .map_err(|_| Error::missing("no cover art"))?;
    if offset > bytes.len() {
        return Err(Error::argument("offset beyond cover art"));
    }
    let chunk = &bytes[offset..bytes.len().min(offset.saturating_add(limit))];
    let mime = if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.starts_with(b"RIFF") {
        "image/webp"
    } else {
        "image/jpeg"
    };
    let mut header = kv("size", bytes.len());
    if with_type {
        header += &kv("type", mime);
    }
    header += &kv("binary", chunk.len());
    let mut response = header.into_bytes();
    response.extend_from_slice(chunk);
    response.extend_from_slice(b"\nOK\n");
    Ok(response)
}

#[cfg(test)]
mod tests;
