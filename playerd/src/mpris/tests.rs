use super::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use zbus::export::futures_util::StreamExt;

const COVER: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0,
    0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0,
    239, 163, 86, 107, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

fn wav(path: &std::path::Path) {
    let size = 8000u32 * 2 * 60;
    let mut bytes = Vec::new();
    bytes.extend(b"RIFF");
    bytes.extend((size + 36).to_le_bytes());
    bytes.extend(b"WAVEfmt ");
    bytes.extend(16u32.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(8000u32.to_le_bytes());
    bytes.extend(16000u32.to_le_bytes());
    bytes.extend(2u16.to_le_bytes());
    bytes.extend(16u16.to_le_bytes());
    bytes.extend(b"data");
    bytes.extend(size.to_le_bytes());
    bytes.resize(size as usize + 44, 0);
    std::fs::write(path, bytes).unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires an isolated session bus: dbus-run-session cargo test ... --ignored"]
async fn session_bus_controls_artwork_and_signals() {
    let control = crate::protocol_test::control().await;
    let root = std::env::temp_dir().join(format!("playerd-mpris-{}", std::process::id()));
    std::fs::create_dir_all(&root).unwrap();
    let first = root.join("first # track.wav");
    let second = root.join("second.wav");
    wav(&first);
    wav(&second);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let art_url = format!("http://{}/art.png", listener.local_addr().unwrap());
    let http = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut request = [0; 4096];
        let _ = stream.read(&mut request).await.unwrap();
        let header = format!("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", COVER.len());
        stream.write_all(header.as_bytes()).await.unwrap();
        stream.write_all(COVER).await.unwrap();
    });
    let ids = control
        .add_resolved(
            vec![
                (
                    first.to_string_lossy().into(),
                    rocksky_sdk::RemoteQueueItem {
                        title: "First".into(),
                        duration_ms: 60_000,
                        album_art: art_url,
                        ..Default::default()
                    },
                ),
                (
                    second.to_string_lossy().into(),
                    rocksky_sdk::RemoteQueueItem {
                        title: "Second".into(),
                        duration_ms: 60_000,
                        ..Default::default()
                    },
                ),
            ],
            None,
            false,
        )
        .await
        .unwrap();
    let server = start(control.clone()).await.unwrap();
    let bus = zbus::Connection::session().await.unwrap();
    let player = zbus::Proxy::new(
        &bus,
        "org.mpris.MediaPlayer2.playerd",
        PATH,
        "org.mpris.MediaPlayer2.Player",
    )
    .await
    .unwrap();
    let tracks = zbus::Proxy::new(
        &bus,
        "org.mpris.MediaPlayer2.playerd",
        PATH,
        "org.mpris.MediaPlayer2.TrackList",
    )
    .await
    .unwrap();
    let properties = zbus::Proxy::new(
        &bus,
        "org.mpris.MediaPlayer2.playerd",
        PATH,
        "org.freedesktop.DBus.Properties",
    )
    .await
    .unwrap();
    let mut changes = properties
        .receive_signal("PropertiesChanged")
        .await
        .unwrap();
    let mut seeks = player.receive_signal("Seeked").await.unwrap();
    let published: Vec<OwnedObjectPath> = tracks.get_property("Tracks").await.unwrap();
    assert_eq!(
        published,
        ids.iter().copied().map(track_id).collect::<Vec<_>>()
    );
    player.set_property("Volume", 0.35f64).await.unwrap();
    assert!((control.view().snapshot.volume - 0.35).abs() < 0.001);
    assert!(player.set_property("LoopStatus", "invalid").await.is_err());
    player.call::<_, _, ()>("Play", &()).await.unwrap();
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            let meta: Metadata = player.get_property("Metadata").await.unwrap();
            if let Some(uri) = meta
                .get("mpris:artUrl")
                .and_then(|v| <&str>::try_from(v).ok())
                .filter(|s| s.starts_with("file:"))
            {
                let path = reqwest::Url::parse(uri).unwrap().to_file_path().unwrap();
                assert_eq!(std::fs::read(path).unwrap(), COVER);
                assert_eq!(
                    OwnedObjectPath::try_from(
                        meta.get("mpris:trackid").unwrap().try_clone().unwrap()
                    )
                    .unwrap(),
                    track_id(ids[0])
                );
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap();
    http.await.unwrap();
    // Explicit short seeks must emit Seeked too; stale track IDs are ignored.
    player.call::<_, _, ()>("Pause", &()).await.unwrap();
    let before = control.view().snapshot;
    player
        .call::<_, _, ()>("SetPosition", &(track_id(ids[1]), 20_000_000i64))
        .await
        .unwrap();
    let after = control.view().snapshot;
    assert_eq!(after.seek_revision, before.seek_revision);
    assert!(after.status.position.abs_diff(before.status.position) < Duration::from_millis(100));
    player
        .call::<_, _, ()>("SetPosition", &(track_id(ids[0]), 500_000i64))
        .await
        .unwrap();
    let signal = tokio::time::timeout(Duration::from_secs(3), seeks.next())
        .await
        .unwrap()
        .unwrap();
    let (pos,): (i64,) = signal.body().deserialize().unwrap();
    assert!((pos - 500_000).abs() < 100_000, "seek position {pos}");
    let before_move = control.view().snapshot.status.position;
    control.move_entry(0, 1).await.unwrap();
    assert_eq!(control.view().current().unwrap().id, ids[0]);
    assert!(
        control
            .view()
            .snapshot
            .status
            .position
            .abs_diff(before_move)
            < Duration::from_millis(100)
    );
    tracks
        .call::<_, _, ()>("GoTo", &(track_id(ids[1]),))
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let msg = changes.next().await.unwrap();
            let (iface, changed, _): (String, Metadata, Vec<String>) =
                msg.body().deserialize().unwrap();
            if iface == "org.mpris.MediaPlayer2.Player" {
                if let Some(value) = changed.get("Metadata") {
                    let meta: Metadata = value.try_clone().unwrap().try_into().unwrap();
                    let id = meta
                        .get("mpris:trackid")
                        .map(|v| OwnedObjectPath::try_from(v.try_clone().unwrap()).unwrap());
                    if id == Some(track_id(ids[1])) {
                        assert!(!meta.contains_key("mpris:artUrl"));
                        break;
                    }
                }
            }
        }
    })
    .await
    .unwrap();
    player.call::<_, _, ()>("Stop", &()).await.unwrap();
    assert_eq!(control.view().snapshot.status.state, PlaybackState::Stopped);
    // Proxy getters are cached: wait for the server's property notifications
    // to invalidate both playback state and the previous track's metadata.
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if player
                .get_property::<String>("PlaybackStatus")
                .await
                .unwrap()
                == "Stopped"
                && player
                    .get_property::<Metadata>("Metadata")
                    .await
                    .unwrap()
                    .is_empty()
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .unwrap();
    server.abort();
    control.command(EngineCmd::Clear).await.unwrap();
    std::fs::remove_dir_all(root).unwrap();
}
