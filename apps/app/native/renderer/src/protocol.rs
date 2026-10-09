//! UPnP AV v1 audio renderer: service contracts, SOAP and LastChange events.
use crate::{Shared, Track};
use serde_json::{json, Value};

pub const SERVICES: [&str; 3] = ["AVTransport", "RenderingControl", "ConnectionManager"];
pub const PROTOCOL: &str = "http-get:*:audio/mpeg:*,http-get:*:audio/flac:*,http-get:*:audio/x-flac:*,http-get:*:audio/wav:*,http-get:*:audio/x-wav:*,http-get:*:audio/ogg:*,http-get:*:application/ogg:*,http-get:*:audio/aac:*,http-get:*:audio/mp4:*";
pub fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
pub fn urn(service: &str) -> String {
    format!("urn:schemas-upnp-org:service:{service}:1")
}
pub fn field(name: &str, value: impl ToString) -> String {
    format!("<{name}>{}</{name}>", esc(&value.to_string()))
}
pub fn time(ms: u64) -> String {
    let s = ms / 1000;
    format!("{}:{:02}:{:02}", s / 3600, s / 60 % 60, s % 60)
}
pub fn parse_time(s: &str) -> Option<u64> {
    let parts: Vec<_> = s.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h = parts[0].parse::<u64>().ok()?;
    let m = parts[1].parse::<u64>().ok()?;
    let sec = parts[2].parse::<f64>().ok()?;
    if m >= 60 || !(0.0..60.0).contains(&sec) {
        return None;
    }
    h.checked_mul(3_600_000)?
        .checked_add(m * 60_000)?
        .checked_add((sec * 1000.0) as u64)
}
pub fn valid_uri(uri: &str) -> bool {
    reqwest::Url::parse(uri).is_ok_and(|u| {
        matches!(u.scheme(), "http" | "https")
            && u.host_str().is_some()
            && u.username().is_empty()
            && u.password().is_none()
    })
}
pub fn track(uri: &str, metadata: &str, generation: u64) -> Track {
    let doc = roxmltree::Document::parse(metadata).ok();
    let get = |name| {
        doc.as_ref()
            .and_then(|d| d.descendants().find(|n| n.has_tag_name(name)))
            .and_then(|n| n.text())
            .unwrap_or("")
            .to_string()
    };
    let duration = doc
        .as_ref()
        .and_then(|d| d.descendants().find(|n| n.has_tag_name("res")))
        .and_then(|n| n.attribute("duration"))
        .and_then(parse_time)
        .unwrap_or(0);
    let title = get("title");
    let art = get("albumArtURI");
    Track {
        uri: uri.into(),
        title: if title.is_empty() {
            "Network audio".into()
        } else {
            title
        },
        artist: get("artist"),
        album: get("album"),
        album_art: valid_uri(&art).then_some(art),
        duration_ms: duration,
        generation,
    }
}

// name, input arguments, output arguments. Both dispatch and SCPD use these
// contracts, so a controller never sees an advertised but missing argument.
fn actions(service: &str) -> Vec<(&'static str, &'static str, &'static str)> {
    match service {
        "AVTransport" => vec![
            ("SetAVTransportURI", "InstanceID CurrentURI CurrentURIMetaData", ""),
            ("Play", "InstanceID Speed", ""), ("Pause", "InstanceID", ""), ("Stop", "InstanceID", ""),
            ("Next", "InstanceID", ""), ("Previous", "InstanceID", ""),
            ("Seek", "InstanceID Unit Target", ""),
            ("GetTransportInfo", "InstanceID", "CurrentTransportState CurrentTransportStatus CurrentSpeed"),
            ("GetPositionInfo", "InstanceID", "Track TrackDuration TrackMetaData TrackURI RelTime AbsTime RelCount AbsCount"),
            ("GetMediaInfo", "InstanceID", "NrTracks MediaDuration CurrentURI CurrentURIMetaData NextURI NextURIMetaData PlayMedium RecordMedium WriteStatus"),
            ("GetDeviceCapabilities", "InstanceID", "PlayMedia RecMedia RecQualityModes"),
            ("GetTransportSettings", "InstanceID", "PlayMode RecQualityMode"),
            ("GetCurrentTransportActions", "InstanceID", "Actions"),
        ],
        "RenderingControl" => vec![
            ("ListPresets", "InstanceID", "CurrentPresetNameList"), ("SelectPreset", "InstanceID PresetName", ""),
            ("GetVolume", "InstanceID Channel", "CurrentVolume"), ("SetVolume", "InstanceID Channel DesiredVolume", ""),
            ("GetMute", "InstanceID Channel", "CurrentMute"), ("SetMute", "InstanceID Channel DesiredMute", ""),
        ],
        "ConnectionManager" => vec![
            ("GetProtocolInfo", "", "Source Sink"), ("GetCurrentConnectionIDs", "", "ConnectionIDs"),
            ("GetCurrentConnectionInfo", "ConnectionID", "RcsID AVTransportID ProtocolInfo PeerConnectionManager PeerConnectionID Direction Status"),
        ],
        _ => vec![],
    }
}
fn variable(arg: &str) -> (&str, &str) {
    match arg {
        "InstanceID" => ("A_ARG_TYPE_InstanceID", "ui4"),
        "CurrentURI" => ("AVTransportURI", "string"),
        "CurrentURIMetaData" => ("AVTransportURIMetaData", "string"),
        "NextURI" => ("NextAVTransportURI", "string"),
        "NextURIMetaData" => ("NextAVTransportURIMetaData", "string"),
        "CurrentTransportState" => ("TransportState", "string"),
        "CurrentTransportStatus" => ("TransportStatus", "string"),
        "Speed" | "CurrentSpeed" => ("TransportPlaySpeed", "string"),
        "Unit" => ("A_ARG_TYPE_SeekMode", "string"),
        "Target" => ("A_ARG_TYPE_SeekTarget", "string"),
        "Track" => ("CurrentTrack", "ui4"),
        "TrackDuration" => ("CurrentTrackDuration", "string"),
        "TrackMetaData" => ("CurrentTrackMetaData", "string"),
        "TrackURI" => ("CurrentTrackURI", "string"),
        "RelTime" => ("RelativeTimePosition", "string"),
        "AbsTime" => ("AbsoluteTimePosition", "string"),
        "RelCount" => ("RelativeCounterPosition", "i4"),
        "AbsCount" => ("AbsoluteCounterPosition", "i4"),
        "NrTracks" => ("NumberOfTracks", "ui4"),
        "MediaDuration" => ("CurrentMediaDuration", "string"),
        "PlayMedium" => ("PlaybackStorageMedium", "string"),
        "RecordMedium" => ("RecordStorageMedium", "string"),
        "WriteStatus" => ("RecordMediumWriteStatus", "string"),
        "PlayMedia" => ("PossiblePlaybackStorageMedia", "string"),
        "RecMedia" => ("PossibleRecordStorageMedia", "string"),
        "RecQualityModes" => ("PossibleRecordQualityModes", "string"),
        "PlayMode" => ("CurrentPlayMode", "string"),
        "RecQualityMode" => ("CurrentRecordQualityMode", "string"),
        "Actions" => ("CurrentTransportActions", "string"),
        "Channel" => ("A_ARG_TYPE_Channel", "string"),
        "DesiredVolume" | "CurrentVolume" => ("Volume", "ui2"),
        "DesiredMute" | "CurrentMute" => ("Mute", "boolean"),
        "CurrentPresetNameList" => ("PresetNameList", "string"),
        "PresetName" => ("A_ARG_TYPE_PresetName", "string"),
        "Source" => ("SourceProtocolInfo", "string"),
        "Sink" => ("SinkProtocolInfo", "string"),
        "ConnectionIDs" => ("CurrentConnectionIDs", "string"),
        "ConnectionID" | "PeerConnectionID" => ("A_ARG_TYPE_ConnectionID", "i4"),
        "RcsID" => ("A_ARG_TYPE_RcsID", "i4"),
        "AVTransportID" => ("A_ARG_TYPE_AVTransportID", "i4"),
        "ProtocolInfo" => ("A_ARG_TYPE_ProtocolInfo", "string"),
        "PeerConnectionManager" => ("A_ARG_TYPE_ConnectionManager", "string"),
        "Direction" => ("A_ARG_TYPE_Direction", "string"),
        "Status" => ("A_ARG_TYPE_ConnectionStatus", "string"),
        _ => unreachable!("Unknown UPnP argument {arg}"),
    }
}
pub fn scpd(service: &str) -> String {
    let mut list = String::new();
    let mut vars = std::collections::BTreeMap::new();
    for (name, input, output) in actions(service) {
        list += &format!("<action><name>{name}</name><argumentList>");
        for (args, direction) in [(input, "in"), (output, "out")] {
            for arg in args.split_whitespace() {
                let (var, ty) = variable(arg);
                vars.insert(var, ty);
                list += &format!("<argument><name>{arg}</name><direction>{direction}</direction><relatedStateVariable>{var}</relatedStateVariable></argument>");
            }
        }
        list += "</argumentList></action>";
    }
    if service != "ConnectionManager" {
        vars.insert("LastChange", "string");
    }
    let mut table = String::new();
    for (var, ty) in vars {
        let event = if [
            "LastChange",
            "SourceProtocolInfo",
            "SinkProtocolInfo",
            "CurrentConnectionIDs",
        ]
        .contains(&var)
        {
            "yes"
        } else {
            "no"
        };
        let values: &[&str] = match var {
            "TransportState" => &["STOPPED", "PLAYING", "PAUSED_PLAYBACK", "NO_MEDIA_PRESENT"],
            "TransportStatus" => &["OK", "ERROR_OCCURRED"],
            "TransportPlaySpeed" => &["1"],
            "PlaybackStorageMedium" | "PossiblePlaybackStorageMedia" => &["NETWORK"],
            "RecordStorageMedium"
            | "PossibleRecordStorageMedia"
            | "RecordMediumWriteStatus"
            | "CurrentRecordQualityMode"
            | "PossibleRecordQualityModes" => &["NOT_IMPLEMENTED"],
            "CurrentPlayMode" => &["NORMAL"],
            "A_ARG_TYPE_SeekMode" => &["REL_TIME", "ABS_TIME"],
            "A_ARG_TYPE_Channel" => &["Master"],
            "A_ARG_TYPE_PresetName" => &["FactoryDefaults"],
            "A_ARG_TYPE_Direction" => &["Input", "Output"],
            "A_ARG_TYPE_ConnectionStatus" => &[
                "OK",
                "ContentFormatMismatch",
                "InsufficientBandwidth",
                "UnreliableChannel",
                "Unknown",
            ],
            _ => &[],
        };
        table += &format!(
            "<stateVariable sendEvents=\"{event}\"><name>{var}</name><dataType>{ty}</dataType>"
        );
        if !values.is_empty() {
            table += "<allowedValueList>";
            for v in values {
                table += &field("allowedValue", v);
            }
            table += "</allowedValueList>";
        }
        if var == "Volume" {
            table += "<allowedValueRange><minimum>0</minimum><maximum>100</maximum><step>1</step></allowedValueRange>";
        }
        table += "</stateVariable>";
    }
    format!("<?xml version=\"1.0\"?><scpd xmlns=\"urn:schemas-upnp-org:service-1-0\"><specVersion><major>1</major><minor>0</minor></specVersion><actionList>{list}</actionList><serviceStateTable>{table}</serviceStateTable></scpd>")
}
pub fn description(name: &str, uuid: &str) -> String {
    let services = SERVICES.iter().map(|s| format!("<service><serviceType>{}</serviceType><serviceId>urn:upnp-org:serviceId:{s}</serviceId><SCPDURL>/{s}/scpd.xml</SCPDURL><controlURL>/{s}/control</controlURL><eventSubURL>/{s}/event</eventSubURL></service>", urn(s))).collect::<String>();
    format!("<?xml version=\"1.0\"?><root xmlns=\"urn:schemas-upnp-org:device-1-0\"><specVersion><major>1</major><minor>0</minor></specVersion><device><deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType><friendlyName>{}</friendlyName><manufacturer>Rocksky</manufacturer><manufacturerURL>https://rocksky.app</manufacturerURL><modelDescription>Rocksky network audio player</modelDescription><modelName>Rocksky Android</modelName><UDN>uuid:{}</UDN><serviceList>{services}</serviceList></device></root>", esc(name), esc(uuid))
}
fn envelope(inner: &str) -> String {
    format!("<?xml version=\"1.0\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>{inner}</s:Body></s:Envelope>")
}
pub fn fault(code: u32) -> (u16, String) {
    let message = match code {
        401 => "Invalid Action",
        402 => "Invalid Args",
        701 => "Transition not available",
        702 => "No contents",
        703 => "Read error",
        704 => "Format not supported",
        710 => "Seek mode not supported",
        711 => "Illegal seek target",
        712 => "Play mode not supported",
        717 => "Play speed not supported",
        718 => "Invalid InstanceID",
        _ => "Action Failed",
    };
    (500, envelope(&format!("<s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns=\"urn:schemas-upnp-org:control-1-0\"><errorCode>{code}</errorCode><errorDescription>{message}</errorDescription></UPnPError></detail></s:Fault>")))
}
pub fn soap(shared: &Shared, service: &str, header: &str, body: &str) -> (u16, String) {
    let result = (|| -> Result<(String, String), u32> {
        let doc = roxmltree::Document::parse(body).map_err(|_| 402u32)?;
        let node = doc
            .descendants()
            .find(|n| n.has_tag_name(("http://schemas.xmlsoap.org/soap/envelope/", "Body")))
            .and_then(|n| n.children().find(|c| c.is_element()))
            .ok_or(402u32)?;
        let action = node.tag_name().name();
        if node.tag_name().namespace() != Some(urn(service).as_str())
            || header.trim_matches('"') != format!("{}#{action}", urn(service))
        {
            return Err(401);
        }
        let contract = actions(service)
            .into_iter()
            .find(|a| a.0 == action)
            .ok_or(401u32)?;
        let arg = |key: &str| -> Result<&str, u32> {
            node.children()
                .find(|n| n.has_tag_name(key))
                .map(|n| n.text().unwrap_or(""))
                .ok_or(402)
        };
        for key in contract.1.split_whitespace() {
            arg(key)?;
        }
        if service != "ConnectionManager" && arg("InstanceID")? != "0" {
            return Err(718);
        }
        if contract.1.contains("Channel") && arg("Channel")? != "Master" {
            return Err(402);
        }
        // Serialize transport changes with shutdown/release and snapshot reads.
        let mut state = shared.state.lock().unwrap();
        if shared.stopped() {
            return Err(501);
        }
        let send = |v: Value| -> Result<Value, u32> {
            let r = (shared.backend)(v);
            if r["ok"] == true {
                Ok(r)
            } else {
                Err(501)
            }
        };
        let status = if state.loaded {
            send(json!({"cmd":"status"}))?
        } else {
            json!({"state":"stopped","positionMs":0,"durationMs":0,"volume":state.volume})
        };
        let transport = state.transport(&status);
        let duration = status["durationMs"]
            .as_u64()
            .filter(|n| *n > 0)
            .unwrap_or_else(|| state.track.as_ref().map_or(0, |t| t.duration_ms));
        let out = match (service, action) {
            ("AVTransport", "SetAVTransportURI") => {
                let uri = arg("CurrentURI")?;
                if !uri.is_empty() && !valid_uri(uri) {
                    return Err(704);
                }
                let metadata = arg("CurrentURIMetaData")?;
                if !metadata.is_empty() && roxmltree::Document::parse(metadata).is_err() {
                    return Err(402);
                }
                // Empty URI clears the transport, as required by AVTransport.
                if !uri.is_empty() || state.loaded {
                    send(json!({"cmd":"stop"}))?;
                }
                state.generation += 1;
                state.track = (!uri.is_empty()).then(|| track(uri, metadata, state.generation));
                state.metadata = metadata.into();
                state.loaded = false;
                String::new()
            }
            ("AVTransport", "Play") => {
                if arg("Speed")? != "1" {
                    return Err(717);
                }
                let uri = state.track.as_ref().ok_or(702u32)?.uri.clone();
                if !state.loaded || status["state"] == "stopped" {
                    send(json!({"cmd":"setRepeat","mode":"off"}))?;
                    send(json!({"cmd":"setShuffle","enabled":false}))?;
                    send(json!({"cmd":"open","paths":[uri],"startIndex":0}))?;
                    state.loaded = true;
                } else {
                    send(json!({"cmd":"play"}))?;
                }
                String::new()
            }
            ("AVTransport", "Pause") => {
                if !state.loaded || transport != "PLAYING" {
                    return Err(701);
                }
                send(json!({"cmd":"pause"}))?;
                String::new()
            }
            ("AVTransport", "Stop") => {
                if state.loaded {
                    send(json!({"cmd":"stop"}))?;
                }
                state.loaded = false;
                String::new()
            }
            ("AVTransport", "Next" | "Previous") => return Err(701), // single URI transport; controller supplies next track
            ("AVTransport", "Seek") => {
                if !["REL_TIME", "ABS_TIME"].contains(&arg("Unit")?) {
                    return Err(710);
                }
                if !state.loaded {
                    return Err(701);
                }
                let ms = parse_time(arg("Target")?).ok_or(711u32)?;
                if duration > 0 && ms > duration {
                    return Err(711);
                }
                send(json!({"cmd":"seek","positionMs":ms}))?;
                String::new()
            }
            ("AVTransport", "GetTransportInfo") => {
                field("CurrentTransportState", transport)
                    + &field("CurrentTransportStatus", "OK")
                    + &field("CurrentSpeed", "1")
            }
            ("AVTransport", "GetPositionInfo") => {
                field("Track", usize::from(state.track.is_some()))
                    + &field("TrackDuration", time(duration))
                    + &field("TrackMetaData", &state.metadata)
                    + &field("TrackURI", state.uri())
                    + &field("RelTime", time(status["positionMs"].as_u64().unwrap_or(0)))
                    + &field("AbsTime", time(status["positionMs"].as_u64().unwrap_or(0)))
                    + &field("RelCount", i32::MAX)
                    + &field("AbsCount", i32::MAX)
            }
            ("AVTransport", "GetMediaInfo") => {
                field("NrTracks", usize::from(state.track.is_some()))
                    + &field("MediaDuration", time(duration))
                    + &field("CurrentURI", state.uri())
                    + &field("CurrentURIMetaData", &state.metadata)
                    + &field("NextURI", "")
                    + &field("NextURIMetaData", "")
                    + &field("PlayMedium", "NETWORK")
                    + &field("RecordMedium", "NOT_IMPLEMENTED")
                    + &field("WriteStatus", "NOT_IMPLEMENTED")
            }
            ("AVTransport", "GetDeviceCapabilities") => {
                field("PlayMedia", "NETWORK")
                    + &field("RecMedia", "NOT_IMPLEMENTED")
                    + &field("RecQualityModes", "NOT_IMPLEMENTED")
            }
            ("AVTransport", "GetTransportSettings") => {
                field("PlayMode", "NORMAL") + &field("RecQualityMode", "NOT_IMPLEMENTED")
            }
            ("AVTransport", "GetCurrentTransportActions") => field(
                "Actions",
                if state.track.is_none() {
                    ""
                } else if transport == "PLAYING" {
                    "Stop,Pause,Seek"
                } else {
                    "Play,Stop"
                },
            ),
            ("RenderingControl", "ListPresets") => {
                field("CurrentPresetNameList", "FactoryDefaults")
            }
            ("RenderingControl", "SelectPreset") => {
                if arg("PresetName")? != "FactoryDefaults" {
                    return Err(402);
                }
                String::new()
            }
            ("RenderingControl", "GetVolume") => {
                if !state.muted {
                    state.volume = send(json!({"cmd":"status"}))?["volume"]
                        .as_f64()
                        .unwrap_or(state.volume);
                }
                field("CurrentVolume", (state.volume * 100.0).round() as u32)
            }
            ("RenderingControl", "SetVolume") => {
                let v = arg("DesiredVolume")?.parse::<u32>().map_err(|_| 402u32)?;
                if v > 100 {
                    return Err(402);
                }
                state.volume = v as f64 / 100.0;
                if !state.muted {
                    send(json!({"cmd":"setVolume","volume":state.volume}))?;
                }
                String::new()
            }
            ("RenderingControl", "GetMute") => field("CurrentMute", u8::from(state.muted)),
            ("RenderingControl", "SetMute") => {
                let mute = match arg("DesiredMute")? {
                    "1" | "true" => true,
                    "0" | "false" => false,
                    _ => return Err(402),
                };
                if mute && !state.muted {
                    state.volume = send(json!({"cmd":"status"}))?["volume"]
                        .as_f64()
                        .unwrap_or(state.volume);
                }
                state.muted = mute;
                send(json!({"cmd":"setVolume","volume":if mute {0.0} else {state.volume}}))?;
                String::new()
            }
            ("ConnectionManager", "GetProtocolInfo") => {
                field("Source", "") + &field("Sink", PROTOCOL)
            }
            ("ConnectionManager", "GetCurrentConnectionIDs") => field("ConnectionIDs", "0"),
            ("ConnectionManager", "GetCurrentConnectionInfo") => {
                if arg("ConnectionID")? != "0" {
                    return Err(706);
                }
                field("RcsID", 0)
                    + &field("AVTransportID", 0)
                    + &field("ProtocolInfo", "http-get:*:audio/*:*")
                    + &field("PeerConnectionManager", "")
                    + &field("PeerConnectionID", -1)
                    + &field("Direction", "Input")
                    + &field("Status", "OK")
            }
            _ => return Err(401),
        };
        Ok((action.into(), out))
    })();
    match result {
        Ok((action, out)) => (
            200,
            envelope(&format!(
                "<u:{action}Response xmlns:u=\"{}\">{out}</u:{action}Response>",
                urn(service)
            )),
        ),
        Err(code) => fault(code),
    }
}
pub fn event(shared: &Shared, service: &str) -> String {
    let mut state = shared.state.lock().unwrap();
    let status = if state.loaded || service == "RenderingControl" {
        (shared.backend)(json!({"cmd":"status"}))
    } else {
        json!({})
    };
    let val = |name: &str, value: &str| format!("<{name} val=\"{}\"/>", esc(value));
    let properties = match service {
        "AVTransport" => field("LastChange", format!("<Event xmlns=\"urn:schemas-upnp-org:metadata-1-0/AVT/\"><InstanceID val=\"0\">{}{}{}{}{}{}{}{}{}</InstanceID></Event>", val("TransportState", state.transport(&status)), val("TransportStatus", "OK"), val("CurrentTrackURI", state.uri()), val("AVTransportURI", state.uri()), val("AVTransportURIMetaData", &state.metadata), val("CurrentTrackMetaData", &state.metadata), val("CurrentTrack", if state.track.is_some(){"1"}else{"0"}), val("CurrentTrackDuration", &time(status["durationMs"].as_u64().unwrap_or(0))), val("TransportPlaySpeed", "1"))),
        "RenderingControl" => {
            if !state.muted { state.volume = status["volume"].as_f64().unwrap_or(state.volume); }
            field("LastChange", format!("<Event xmlns=\"urn:schemas-upnp-org:metadata-1-0/RCS/\"><InstanceID val=\"0\"><Volume channel=\"Master\" val=\"{}\"/><Mute channel=\"Master\" val=\"{}\"/></InstanceID></Event>", (state.volume * 100.0).round() as u32, u8::from(state.muted)))
        }
        _ => return format!("<?xml version=\"1.0\"?><e:propertyset xmlns:e=\"urn:schemas-upnp-org:event-1-0\"><e:property>{}</e:property><e:property>{}</e:property><e:property>{}</e:property></e:propertyset>", field("SourceProtocolInfo", ""), field("SinkProtocolInfo", PROTOCOL), field("CurrentConnectionIDs", "0")),
    };
    format!("<?xml version=\"1.0\"?><e:propertyset xmlns:e=\"urn:schemas-upnp-org:event-1-0\"><e:property>{properties}</e:property></e:propertyset>")
}
