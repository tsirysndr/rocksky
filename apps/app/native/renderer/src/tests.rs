use super::*;
use crate::protocol::*;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::AtomicBool;

fn shared() -> Arc<Shared> {
    let playback = Arc::new(Mutex::new(
        json!({"ok":true,"state":"stopped","positionMs":0,"durationMs":180000,"volume":0.7}),
    ));
    Arc::new(Shared {
        state: Mutex::new(State::default()),
        stop: AtomicBool::new(false),
        backend: Arc::new(move |v| {
            let mut status = playback.lock().unwrap();
            match v["cmd"].as_str().unwrap() {
                "status" => return status.clone(),
                "open" | "play" => status["state"] = json!("playing"),
                "pause" => status["state"] = json!("paused"),
                "stop" => status["state"] = json!("stopped"),
                "seek" => status["positionMs"] = v["positionMs"].clone(),
                "setVolume" => status["volume"] = v["volume"].clone(),
                _ => {}
            }
            json!({"ok":true})
        }),
    })
}
fn call(s: &Shared, service: &str, action: &str, args: &[(&str, &str)]) -> (u16, String) {
    let args = args.iter().map(|(k, v)| field(k, v)).collect::<String>();
    soap(s,service,&format!("\"{}#{action}\"",urn(service)),&format!("<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body><u:{action} xmlns:u=\"{}\">{args}</u:{action}></s:Body></s:Envelope>",urn(service)))
}
#[test]
fn transport_and_metadata_round_trip() {
    let s = shared();
    let meta="<DIDL-Lite xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\"><item><dc:title>A &amp; B</dc:title><upnp:artist>Artist</upnp:artist><upnp:album>Album</upnp:album><upnp:albumArtURI>http://192.168.1.2/cover.jpg</upnp:albumArtURI><res duration=\"0:03:00\">http://192.168.1.2/a.mp3</res></item></DIDL-Lite>";
    assert_eq!(
        call(
            &s,
            "AVTransport",
            "SetAVTransportURI",
            &[
                ("InstanceID", "0"),
                ("CurrentURI", "http://192.168.1.2/a.mp3"),
                ("CurrentURIMetaData", meta)
            ]
        )
        .0,
        200
    );
    assert!(!s.state.lock().unwrap().loaded);
    assert_eq!(
        s.state.lock().unwrap().track.as_ref().unwrap().title,
        "A & B"
    );
    assert_eq!(
        call(
            &s,
            "AVTransport",
            "Play",
            &[("InstanceID", "0"), ("Speed", "1")]
        )
        .0,
        200
    );
    assert!(call(
        &s,
        "AVTransport",
        "GetTransportInfo",
        &[("InstanceID", "0")]
    )
    .1
    .contains("PLAYING"));
    assert_eq!(
        call(
            &s,
            "AVTransport",
            "Seek",
            &[
                ("InstanceID", "0"),
                ("Unit", "REL_TIME"),
                ("Target", "0:01:02.500")
            ]
        )
        .0,
        200
    );
    assert!(
        call(&s, "AVTransport", "GetPositionInfo", &[("InstanceID", "0")])
            .1
            .contains("0:01:02")
    );
    assert_eq!(
        call(&s, "AVTransport", "Pause", &[("InstanceID", "0")]).0,
        200
    );
    assert!(call(
        &s,
        "AVTransport",
        "GetTransportInfo",
        &[("InstanceID", "0")]
    )
    .1
    .contains("PAUSED_PLAYBACK"));
    let event = event(&s, "AVTransport");
    assert!(event.contains("LastChange"));
    roxmltree::Document::parse(&event).unwrap();
    assert_eq!(
        call(&s, "AVTransport", "Stop", &[("InstanceID", "0")]).0,
        200
    );
    assert!(!s.state.lock().unwrap().loaded);
}
#[test]
fn invalid_soap_and_uri_do_not_change_playback() {
    let s = shared();
    for uri in [
        "file:///sdcard/a.mp3",
        "content://music/1",
        "ftp://host/a.mp3",
        "http://user:password@host/music",
    ] {
        let result = call(
            &s,
            "AVTransport",
            "SetAVTransportURI",
            &[
                ("InstanceID", "0"),
                ("CurrentURI", uri),
                ("CurrentURIMetaData", ""),
            ],
        );
        assert_eq!(result.0, 500);
        assert!(s.state.lock().unwrap().track.is_none());
    }
    assert!(call(
        &s,
        "AVTransport",
        "GetTransportInfo",
        &[("InstanceID", "9")]
    )
    .1
    .contains("718"));
    assert!(call(
        &s,
        "AVTransport",
        "Play",
        &[("InstanceID", "0"), ("Speed", "2")]
    )
    .1
    .contains("717"));
    assert!(call(&s, "AVTransport", "Play", &[("InstanceID", "0")])
        .1
        .contains("402"));
    assert!(soap(&s, "AVTransport", "wrong", "<bad/>").1.contains("402"));
    assert_eq!(parse_time("0:60:00"), None);
    assert_eq!(parse_time("0:01:NaN"), None);
}
#[test]
fn volume_mute_restores_pre_mute_volume() {
    let s = shared();
    assert_eq!(
        call(
            &s,
            "RenderingControl",
            "SetVolume",
            &[
                ("InstanceID", "0"),
                ("Channel", "Master"),
                ("DesiredVolume", "42")
            ]
        )
        .0,
        200
    );
    assert_eq!(
        call(
            &s,
            "RenderingControl",
            "SetMute",
            &[
                ("InstanceID", "0"),
                ("Channel", "Master"),
                ("DesiredMute", "1")
            ]
        )
        .0,
        200
    );
    assert_eq!((s.backend)(json!({"cmd":"status"}))["volume"], 0.0);
    assert!(call(
        &s,
        "RenderingControl",
        "GetVolume",
        &[("InstanceID", "0"), ("Channel", "Master")]
    )
    .1
    .contains(">42<"));
    assert_eq!(
        call(
            &s,
            "RenderingControl",
            "SetMute",
            &[
                ("InstanceID", "0"),
                ("Channel", "Master"),
                ("DesiredMute", "0")
            ]
        )
        .0,
        200
    );
    assert_eq!((s.backend)(json!({"cmd":"status"}))["volume"], 0.42);
    assert_eq!(
        call(
            &s,
            "RenderingControl",
            "SetVolume",
            &[
                ("InstanceID", "0"),
                ("Channel", "Master"),
                ("DesiredVolume", "101")
            ]
        )
        .0,
        500
    );
}
#[test]
fn service_descriptions_reference_existing_state_variables() {
    for service in SERVICES {
        let xml = scpd(service);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let vars: Vec<_> = doc
            .descendants()
            .filter(|n| n.has_tag_name("stateVariable"))
            .filter_map(|n| n.children().find(|n| n.has_tag_name("name")))
            .filter_map(|n| n.text())
            .collect();
        for var in doc
            .descendants()
            .filter(|n| n.has_tag_name("relatedStateVariable"))
        {
            assert!(vars.contains(&var.text().unwrap()));
        }
        if service != "ConnectionManager" {
            assert!(vars.contains(&"LastChange"));
        }
    }
    roxmltree::Document::parse(&description(
        "Rocksky & music",
        "00000000-0000-0000-0000-000000000001",
    ))
    .unwrap();
}
#[test]
fn tcp_discovery_control_and_shutdown() {
    let s = shared();
    let renderer = Renderer::start(
        Config {
            ip: "127.0.0.1".parse().unwrap(),
            prefix_length: 8,
            name: "Test".into(),
            uuid: "00000000-0000-0000-0000-000000000001".into(),
        },
        s.backend.clone(),
    )
    .unwrap();
    let socket = socket2::Socket::new(
        socket2::Domain::IPV4,
        socket2::Type::DGRAM,
        Some(socket2::Protocol::UDP),
    )
    .unwrap();
    socket
        .bind(
            &"127.0.0.1:0"
                .parse::<std::net::SocketAddr>()
                .unwrap()
                .into(),
        )
        .unwrap();
    socket
        .set_multicast_if_v4(&std::net::Ipv4Addr::LOCALHOST)
        .unwrap();
    socket.set_multicast_loop_v4(true).unwrap();
    let discovery: std::net::UdpSocket = socket.into();
    discovery
        .set_read_timeout(Some(std::time::Duration::from_secs(3)))
        .unwrap();
    discovery.send_to(b"M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n", "239.255.255.250:1900").unwrap();
    let mut reply = [0; 8192];
    let (len, _) = discovery.recv_from(&mut reply).unwrap();
    let reply = String::from_utf8_lossy(&reply[..len]);
    assert!(reply.contains(&renderer.location));
    assert!(reply.contains("ST: urn:schemas-upnp-org:device:MediaRenderer:1"));
    let url = reqwest::Url::parse(&renderer.location).unwrap();
    let mut stream = TcpStream::connect(("127.0.0.1", url.port().unwrap())).unwrap();
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .unwrap();
    stream
        .write_all(b"GET /device.xml HTTP/1.1\r\nHost: localhost\r\n\r\n")
        .unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    assert!(response.contains("200 OK"));
    assert!(response.contains("MediaRenderer:1"));
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .build()
        .unwrap();
    let event_url = renderer.location.replace("device.xml", "AVTransport/event");
    let notify = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    notify.set_nonblocking(true).unwrap();
    let sub = client
        .request(
            reqwest::Method::from_bytes(b"SUBSCRIBE").unwrap(),
            &event_url,
        )
        .header(
            "CALLBACK",
            format!("<http://{}/event>", notify.local_addr().unwrap()),
        )
        .header("NT", "upnp:event")
        .send()
        .unwrap();
    assert_eq!(sub.status(), 200);
    let sid = sub.headers()["sid"].to_str().unwrap().to_string();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
    loop {
        if let Ok((mut incoming, _)) = notify.accept() {
            incoming
                .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                .unwrap();
            let mut buf = [0; 8192];
            let n = incoming.read(&mut buf).unwrap();
            let text = String::from_utf8_lossy(&buf[..n]);
            assert!(text.starts_with("NOTIFY"));
            incoming
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n")
                .unwrap();
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "No initial GENA event"
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    let renew = client
        .request(
            reqwest::Method::from_bytes(b"SUBSCRIBE").unwrap(),
            &event_url,
        )
        .header("SID", &sid)
        .send()
        .unwrap();
    assert_eq!(renew.status(), 200);
    let unsub = client
        .request(
            reqwest::Method::from_bytes(b"UNSUBSCRIBE").unwrap(),
            &event_url,
        )
        .header("SID", &sid)
        .send()
        .unwrap();
    assert_eq!(unsub.status(), 200);
    let bad = client
        .request(
            reqwest::Method::from_bytes(b"SUBSCRIBE").unwrap(),
            &event_url,
        )
        .header("CALLBACK", "<http://192.168.1.5/event>")
        .header("NT", "upnp:event")
        .send()
        .unwrap();
    assert_eq!(bad.status(), 412);
    renderer.stop();
    assert!(TcpStream::connect(("127.0.0.1", url.port().unwrap())).is_err());
}

#[test]
fn local_takeover_and_disable_respect_playback_ownership() {
    let s = shared();
    let mut renderer = Renderer {
        shared: s.clone(),
        threads: vec![],
        location: String::new(),
    };
    call(
        &s,
        "AVTransport",
        "SetAVTransportURI",
        &[
            ("InstanceID", "0"),
            ("CurrentURI", "http://192.168.1.2/music.mp3"),
            ("CurrentURIMetaData", ""),
        ],
    );
    call(
        &s,
        "AVTransport",
        "Play",
        &[("InstanceID", "0"), ("Speed", "1")],
    );
    assert!(renderer.track().is_some());
    renderer.release();
    assert!(renderer.track().is_none());
    // Simulate local playback taking over after release. Disabling only stops
    // a stream owned by the renderer, never the unrelated new local queue.
    (s.backend)(json!({"cmd":"open"}));
    renderer.shutdown();
    assert_eq!((s.backend)(json!({"cmd":"status"}))["state"], "playing");
    let s = shared();
    let renderer = Renderer {
        shared: s.clone(),
        threads: vec![],
        location: String::new(),
    };
    call(
        &s,
        "AVTransport",
        "SetAVTransportURI",
        &[
            ("InstanceID", "0"),
            ("CurrentURI", "http://192.168.1.2/music.mp3"),
            ("CurrentURIMetaData", ""),
        ],
    );
    call(
        &s,
        "AVTransport",
        "Play",
        &[("InstanceID", "0"), ("Speed", "1")],
    );
    renderer.stop();
    assert_eq!((s.backend)(json!({"cmd":"status"}))["state"], "stopped");
    assert_eq!(
        call(
            &s,
            "AVTransport",
            "Play",
            &[("InstanceID", "0"), ("Speed", "1")]
        )
        .0,
        500
    );
}
