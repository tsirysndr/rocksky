use crate::{protocol, Config, Shared};
use socket2::{Domain, Protocol, Socket, Type};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const GROUP: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
const SERVER: &str = "Android/1 UPnP/1.0 Rocksky/1.0";
const MAX_BODY: usize = 65_536;
const MAX_HEADERS: usize = 16_384;
static SERIAL: AtomicU64 = AtomicU64::new(1);
fn local(peer: SocketAddr, config: &Config) -> bool {
    let SocketAddr::V4(peer) = peer else {
        return false;
    };
    let mask = u32::MAX
        .checked_shl(32 - u32::from(config.prefix_length))
        .unwrap_or(0);
    (u32::from(*peer.ip()) & mask) == (u32::from(config.ip) & mask)
        && !peer.ip().is_multicast()
        && !peer.ip().is_unspecified()
}
fn identities(uuid: &str) -> Vec<(String, String)> {
    let udn = format!("uuid:{uuid}");
    let mut result = vec![(udn.clone(), udn.clone())];
    for st in [
        "upnp:rootdevice".into(),
        "urn:schemas-upnp-org:device:MediaRenderer:1".into(),
    ]
    .into_iter()
    .chain(protocol::SERVICES.map(protocol::urn))
    {
        result.push((st.clone(), format!("{udn}::{st}")));
    }
    result
}
fn headers(text: &str) -> HashMap<String, String> {
    text.lines()
        .skip(1)
        .filter_map(|line| line.split_once(':'))
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))
        .collect()
}
fn announce(socket: &UdpSocket, ids: &[(String, String)], location: &str, alive: bool) {
    for (nt, usn) in ids {
        let packet = format!("NOTIFY * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nCACHE-CONTROL: max-age=180\r\nLOCATION: {location}\r\nNT: {nt}\r\nNTS: ssdp:{}\r\nSERVER: {SERVER}\r\nUSN: {usn}\r\n\r\n", if alive { "alive" } else { "byebye" });
        let _ = socket.send_to(packet.as_bytes(), (GROUP, 1900));
    }
}
fn ssdp(socket: UdpSocket, config: Config, location: String, shared: Arc<Shared>) {
    let ids = identities(&config.uuid);
    let mut next_alive = Instant::now();
    let mut pending: Vec<(Instant, SocketAddr, String)> = vec![];
    let mut buf = [0u8; 8192];
    while !shared.stopped() {
        let now = Instant::now();
        if now >= next_alive {
            announce(&socket, &ids, &location, true);
            next_alive = now + Duration::from_secs(60);
        }
        pending.retain(|(at, peer, packet)| {
            if *at <= now {
                let _ = socket.send_to(packet.as_bytes(), peer);
                false
            } else {
                true
            }
        });
        if let Ok((len, peer)) = socket.recv_from(&mut buf) {
            if !local(peer, &config) || pending.len() >= 64 {
                continue;
            }
            let Ok(text) = std::str::from_utf8(&buf[..len]) else {
                continue;
            };
            if !text.starts_with("M-SEARCH * HTTP/1.1\r\n") {
                continue;
            }
            let h = headers(text);
            if h.get("man").map(|s| s.trim_matches('"')) != Some("ssdp:discover") {
                continue;
            }
            let mx = h
                .get("mx")
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(1)
                .clamp(1, 5);
            let st = h.get("st").map(String::as_str).unwrap_or("");
            for (target, usn) in &ids {
                if st != "ssdp:all" && st != target {
                    continue;
                }
                if pending.len() >= 64 {
                    break;
                }
                let packet = format!("HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=180\r\nEXT:\r\nLOCATION: {location}\r\nSERVER: {SERVER}\r\nST: {target}\r\nUSN: {usn}\r\n\r\n");
                let delay = (SERIAL.fetch_add(1, Ordering::Relaxed) * 137 + peer.port() as u64)
                    % (mx * 1000);
                pending.push((now + Duration::from_millis(delay), peer, packet));
            }
        }
    }
    announce(&socket, &ids, &location, false);
    let _ = socket.leave_multicast_v4(&GROUP, &config.ip);
}
struct Subscription {
    service: String,
    callback: String,
    peer: SocketAddr,
    expires: Instant,
    ready: bool,
    seq: u32,
    last: String,
}
type Subscriptions = Arc<Mutex<HashMap<String, Subscription>>>;
struct Request {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: String,
}
fn request(stream: &mut TcpStream) -> io::Result<Request> {
    let deadline = Instant::now() + Duration::from_secs(4);
    let mut bytes = Vec::new();
    let end = loop {
        if bytes.len() > MAX_HEADERS || Instant::now() > deadline {
            return Err(io::ErrorKind::InvalidData.into());
        }
        // A byte-at-a-time header read keeps pipelined/body bytes separate and
        // bounds the total request; connections are never kept alive.
        let mut b = [0];
        stream.read_exact(&mut b)?;
        bytes.push(b[0]);
        if bytes.ends_with(b"\r\n\r\n") {
            break bytes.len();
        }
    };
    let text = std::str::from_utf8(&bytes[..end]).map_err(|_| io::ErrorKind::InvalidData)?;
    let mut line = text.lines().next().unwrap_or("").split_whitespace();
    let method = line.next().unwrap_or("").to_string();
    let path = line.next().unwrap_or("").to_string();
    let h = headers(text);
    if h.contains_key("transfer-encoding") {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let length = h
        .get("content-length")
        .map(|s| s.parse::<usize>())
        .transpose()
        .map_err(|_| io::ErrorKind::InvalidData)?
        .unwrap_or(0);
    if length > MAX_BODY {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut body = vec![0; length];
    let mut read = 0;
    while read < length {
        if Instant::now() > deadline {
            return Err(io::ErrorKind::TimedOut.into());
        }
        let n = stream.read(&mut body[read..])?;
        if n == 0 {
            return Err(io::ErrorKind::UnexpectedEof.into());
        }
        read += n;
    }
    Ok(Request {
        method,
        path,
        headers: h,
        body: String::from_utf8(body).map_err(|_| io::ErrorKind::InvalidData)?,
    })
}
fn response(stream: &mut TcpStream, code: u16, extra: &str, body: &str) {
    let reason = match code {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        412 => "Precondition Failed",
        503 => "Service Unavailable",
        _ => "Internal Server Error",
    };
    let _ = write!(stream, "HTTP/1.1 {code} {reason}\r\nCONTENT-TYPE: text/xml; charset=\"utf-8\"\r\nCONTENT-LENGTH: {}\r\nSERVER: {SERVER}\r\nCONNECTION: close\r\n{extra}\r\n{body}", body.len());
}
fn subscription(
    req: &Request,
    peer: SocketAddr,
    service: &str,
    config: &Config,
    subs: &Subscriptions,
) -> (u16, String) {
    let mut subs = subs.lock().unwrap();
    subs.retain(|_, s| s.expires > Instant::now());
    let sid = req.headers.get("sid");
    let timeout = req
        .headers
        .get("timeout")
        .and_then(|s| s.strip_prefix("Second-"))
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(1800)
        .clamp(30, 1800);
    if let Some(sid) = sid {
        if req.headers.contains_key("callback") || req.headers.contains_key("nt") {
            return (400, String::new());
        }
        let Some(s) = subs.get_mut(sid) else {
            return (412, String::new());
        };
        if s.peer.ip() != peer.ip() || s.service != service {
            return (412, String::new());
        }
        if req.method == "UNSUBSCRIBE" {
            subs.remove(sid);
            return (200, String::new());
        }
        s.expires = Instant::now() + Duration::from_secs(timeout);
        return (200, format!("SID: {sid}\r\nTIMEOUT: Second-{timeout}\r\n"));
    }
    if req.method != "SUBSCRIBE" || req.headers.get("nt").map(String::as_str) != Some("upnp:event")
    {
        return (412, String::new());
    }
    let callback = req
        .headers
        .get("callback")
        .and_then(|s| s.strip_prefix('<'))
        .and_then(|s| s.strip_suffix('>'))
        .unwrap_or("");
    // GENA callback must be HTTP on the subscribing host: no DNS rebinding,
    // redirected callbacks, loopback probes or third-party request reflection.
    let valid = reqwest::Url::parse(callback).is_ok_and(|u| {
        u.scheme() == "http"
            && u.username().is_empty()
            && u.password().is_none()
            && u.host_str()
                .and_then(|h| h.parse::<std::net::IpAddr>().ok())
                == Some(peer.ip())
    });
    if !valid {
        return (412, String::new());
    }
    if subs.len() >= 16 {
        return (503, String::new());
    }
    let id = SERIAL.fetch_add(1, Ordering::Relaxed);
    let sid = format!("uuid:{}{:012x}", &config.uuid[..24], id & 0xffffffffffff);
    subs.insert(
        sid.clone(),
        Subscription {
            service: service.into(),
            callback: callback.into(),
            peer,
            expires: Instant::now() + Duration::from_secs(timeout),
            ready: false,
            seq: 0,
            last: String::new(),
        },
    );
    (200, format!("SID: {sid}\r\nTIMEOUT: Second-{timeout}\r\n"))
}
fn serve(
    mut stream: TcpStream,
    peer: SocketAddr,
    config: &Config,
    shared: &Shared,
    subs: &Subscriptions,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let req = match request(&mut stream) {
        Ok(r) => r,
        Err(_) => {
            response(&mut stream, 400, "", "");
            return;
        }
    };
    if shared.stopped() {
        response(&mut stream, 503, "", "");
        return;
    }
    if req.method == "GET" && req.path == "/device.xml" {
        response(
            &mut stream,
            200,
            "",
            &protocol::description(&config.name, &config.uuid),
        );
        return;
    }
    for service in protocol::SERVICES {
        if req.method == "GET" && req.path == format!("/{service}/scpd.xml") {
            response(&mut stream, 200, "", &protocol::scpd(service));
            return;
        }
        if req.method == "POST" && req.path == format!("/{service}/control") {
            let (code, body) = protocol::soap(
                shared,
                service,
                req.headers
                    .get("soapaction")
                    .map(String::as_str)
                    .unwrap_or(""),
                &req.body,
            );
            response(&mut stream, code, "", &body);
            return;
        }
        if ["SUBSCRIBE", "UNSUBSCRIBE"].contains(&req.method.as_str())
            && req.path == format!("/{service}/event")
        {
            let (code, extra) = subscription(&req, peer, service, config, subs);
            response(&mut stream, code, &extra, "");
            // Publish the initial event only after the SUBSCRIBE response.
            if code == 200 {
                if let Some(sid) = extra.lines().find_map(|line| line.strip_prefix("SID: ")) {
                    if let Some(subscription) = subs.lock().unwrap().get_mut(sid) {
                        subscription.ready = true;
                    }
                }
            }
            return;
        }
    }
    response(&mut stream, 404, "", "");
}
fn events(shared: Arc<Shared>, subs: Subscriptions) {
    let Ok(client) = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_millis(800))
        .build()
    else {
        return;
    };
    while !shared.stopped() {
        let services: Vec<String> = {
            let mut all = subs.lock().unwrap();
            all.retain(|_, s| s.expires > Instant::now());
            all.values().map(|s| s.service.clone()).collect()
        };
        let bodies: HashMap<_, _> = services
            .iter()
            .map(|s| (s.clone(), protocol::event(&shared, s)))
            .collect();
        let jobs: Vec<_> = {
            let mut all = subs.lock().unwrap();
            all.iter_mut()
                .filter_map(|(sid, s)| {
                    let body = bodies.get(&s.service)?;
                    if !s.ready || &s.last == body {
                        return None;
                    }
                    let seq = s.seq;
                    s.seq = if seq == u32::MAX { 1 } else { seq + 1 };
                    s.last = body.clone();
                    Some((sid.clone(), s.callback.clone(), seq, body.clone()))
                })
                .collect()
        };
        for (sid, url, seq, body) in jobs {
            if shared.stopped() {
                break;
            }
            let success = client
                .request(reqwest::Method::from_bytes(b"NOTIFY").unwrap(), url)
                .header("CONTENT-TYPE", "text/xml; charset=\"utf-8\"")
                .header("NT", "upnp:event")
                .header("NTS", "upnp:propchange")
                .header("SID", &sid)
                .header("SEQ", seq)
                .body(body)
                .send()
                .is_ok_and(|r| r.status().is_success());
            if !success {
                subs.lock().unwrap().remove(&sid);
            }
        }
        thread::sleep(Duration::from_millis(250));
    }
}
pub(super) fn start(
    config: Config,
    shared: Arc<Shared>,
) -> io::Result<(Vec<JoinHandle<()>>, String)> {
    // Bind TCP to the chosen LAN interface, never to cellular/VPN interfaces.
    let listener = TcpListener::bind((config.ip, 0))?;
    listener.set_nonblocking(true)?;
    let location = format!(
        "http://{}:{}/device.xml",
        config.ip,
        listener.local_addr()?.port()
    );
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
    socket.set_reuse_address(true)?;
    #[cfg(target_vendor = "apple")]
    socket.set_reuse_port(true)?;
    socket.bind(&SocketAddr::from(([0, 0, 0, 0], 1900)).into())?;
    socket.join_multicast_v4(&GROUP, &config.ip)?;
    socket.set_multicast_if_v4(&config.ip)?;
    socket.set_multicast_ttl_v4(2)?;
    socket.set_read_timeout(Some(Duration::from_millis(100)))?;
    let socket: UdpSocket = socket.into();
    let subs: Subscriptions = Arc::new(Mutex::new(HashMap::new()));
    let (tx, rx) = mpsc::sync_channel::<(TcpStream, SocketAddr)>(8);
    let rx = Arc::new(Mutex::new(rx));
    let mut threads = vec![];
    // A fixed worker pool and bounded queue keep discovery/control traffic from
    // spawning unbounded threads or keeping an unlimited number of sockets open.
    for _ in 0..4 {
        let (rx, config, shared, subs) = (rx.clone(), config.clone(), shared.clone(), subs.clone());
        threads.push(thread::spawn(move || {
            while !shared.stopped() {
                let next = rx.lock().unwrap().recv_timeout(Duration::from_millis(100));
                if let Ok((stream, peer)) = next {
                    serve(stream, peer, &config, &shared, &subs);
                }
            }
        }));
    }
    {
        let (shared, config) = (shared.clone(), config.clone());
        threads.push(thread::spawn(move || {
            while !shared.stopped() {
                match listener.accept() {
                    Ok((stream, peer)) => {
                        if local(peer, &config) {
                            let _ = tx.try_send((stream, peer));
                        }
                    }
                    Err(_) => thread::sleep(Duration::from_millis(30)),
                }
            }
        }));
    }
    {
        let (shared, location) = (shared.clone(), location.clone());
        threads.push(thread::spawn(move || {
            ssdp(socket, config, location, shared)
        }));
    }
    threads.push(thread::spawn(move || events(shared, subs)));
    Ok((threads, location))
}
