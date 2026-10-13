use super::*;

async fn response(reader: &mut BufReader<TcpStream>) -> String {
    tokio::time::timeout(Duration::from_secs(10), async {
        let mut output = String::new();
        loop {
            let mut line = String::new();
            assert!(reader.read_line(&mut line).await.unwrap() > 0);
            let done = line == "OK\n" || line.starts_with("ACK ");
            output += &line;
            if done {
                return output;
            }
        }
    })
    .await
    .expect("MPD response timeout")
}
async fn request(reader: &mut BufReader<TcpStream>, cmd: &str) -> String {
    reader.get_mut().write_all(cmd.as_bytes()).await.unwrap();
    response(reader).await
}
#[tokio::test]
async fn tcp_queue_lists_errors_and_idle() {
    let control = crate::protocol_test::control().await;
    // Queue mutation and property commands do not open these fake files.
    control
        .add_resolved(
            vec![
                ("/test-a.mp3".into(), Default::default()),
                ("/test-b.mp3".into(), Default::default()),
                ("/test-a.mp3".into(), Default::default()),
            ],
            None,
            false,
        )
        .await
        .unwrap();
    let initial = control.view().entries;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(serve(listener, control.clone()));
    let mut client = BufReader::new(TcpStream::connect(addr).await.unwrap());
    let mut greeting = String::new();
    client.read_line(&mut greeting).await.unwrap();
    assert_eq!(greeting, GREETING);
    let output = request(
        &mut client,
        "command_list_ok_begin\nsetvol 37\nstatus\ncommand_list_end\n",
    )
    .await;
    assert!(output.contains("volume: 37\n"), "{output}");
    assert_eq!(output.matches("list_OK\n").count(), 2);
    let output = request(
        &mut client,
        "command_list_ok_begin\nsetvol 101\nclear\ncommand_list_end\n",
    )
    .await;
    assert!(output.starts_with("ACK [2@0] {setvol}"));
    assert_eq!(control.view().entries.len(), 3);
    assert_eq!(
        request(&mut client, &format!("deleteid {}\n", initial[0].id)).await,
        "OK\n"
    );
    assert_eq!(
        control
            .view()
            .entries
            .iter()
            .map(|e| e.id)
            .collect::<Vec<_>>(),
        vec![initial[1].id, initial[2].id]
    );
    assert_eq!(
        request(&mut client, &format!("moveid {} 0\n", initial[2].id)).await,
        "OK\n"
    );
    assert_eq!(control.view().entries[0].id, initial[2].id);
    // Idle sees changes made outside this TCP connection. A fragmented read
    // survives timer ticks, and a crossed noidle must not insert another OK.
    client.get_mut().write_all(b"idle mixer\n").await.unwrap();
    control.command(EngineCmd::SetVolume(0.42)).await.unwrap();
    assert!(response(&mut client).await.contains("changed: mixer\n"));
    client.get_mut().write_all(b"noidle\nsta").await.unwrap();
    tokio::time::sleep(Duration::from_millis(150)).await;
    let output = request(&mut client, "tus\n").await;
    assert!(output.contains("volume: 42\n"), "{output}");
    assert!(request(&mut client, "nonsense\n")
        .await
        .starts_with("ACK [5@0] {nonsense}"));
    let output = request(
        &mut client,
        "command_list_ok_begin\nping\nadd \"unterminated\nclear\ncommand_list_end\n",
    )
    .await;
    assert!(output.contains("ACK [2@1] {add}"), "{output}");
    assert_eq!(control.view().entries.len(), 2);
    let cover = std::env::temp_dir().join(format!("playerd-mpd-cover-{}.png", std::process::id()));
    std::fs::write(&cover, b"\x89PNG\r\n\x1a\n").unwrap();
    control.shared.remember_uris([(
        "/test-a.mp3".into(),
        rocksky_sdk::RemoteQueueItem {
            album_art: cover.to_string_lossy().into(),
            ..Default::default()
        },
    )]);
    assert_eq!(request(&mut client, "binarylimit 4\n").await, "OK\n");
    client
        .get_mut()
        .write_all(b"readpicture /test-a.mp3 4\n")
        .await
        .unwrap();
    let mut header = String::new();
    for _ in 0..3 {
        client.read_line(&mut header).await.unwrap();
    }
    assert_eq!(header, "size: 8\ntype: image/png\nbinary: 4\n");
    let mut bytes = [0; 8];
    client.read_exact(&mut bytes).await.unwrap();
    assert_eq!(&bytes, b"\r\n\x1a\n\nOK\n");
    std::fs::remove_file(cover).unwrap();
    server.abort();
}
