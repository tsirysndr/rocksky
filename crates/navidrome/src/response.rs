use actix_web::HttpResponse;
use serde_json::{json, Value};

const VERSION: &str = "1.16.1";
const SERVER_TYPE: &str = "navidrome";
const SERVER_VERSION: &str = "0.49.3";

pub fn ok(format: &str, data: Value) -> HttpResponse {
    let mut base = json!({
        "status": "ok",
        "version": VERSION,
        "type": SERVER_TYPE,
        "serverVersion": SERVER_VERSION,
    });

    if let (Some(obj), Some(inner)) = (base.as_object_mut(), data.as_object()) {
        for (k, v) in inner {
            obj.insert(k.clone(), v.clone());
        }
    }

    if format == "xml" {
        let xml = to_xml(&base);
        HttpResponse::Ok()
            .content_type("text/xml; charset=utf-8")
            .body(xml)
    } else {
        HttpResponse::Ok().json(json!({ "subsonic-response": base }))
    }
}

pub fn err(format: &str, code: u32, message: &str) -> HttpResponse {
    let base = json!({
        "status": "failed",
        "version": VERSION,
        "type": SERVER_TYPE,
        "serverVersion": SERVER_VERSION,
        "error": {
            "code": code,
            "message": message
        }
    });

    if format == "xml" {
        let xml = to_xml(&base);
        HttpResponse::Ok()
            .content_type("text/xml; charset=utf-8")
            .body(xml)
    } else {
        HttpResponse::Ok().json(json!({ "subsonic-response": base }))
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn value_to_xml(tag: &str, value: &Value, buf: &mut String) {
    match value {
        Value::Object(map) => {
            let mut attrs = String::new();
            let mut children: Vec<(&str, &Value)> = Vec::new();

            for (key, val) in map {
                match val {
                    Value::String(s) => {
                        attrs.push_str(&format!(r#" {}="{}""#, key, xml_escape(s)));
                    }
                    Value::Number(n) => {
                        attrs.push_str(&format!(r#" {}="{}""#, key, n));
                    }
                    Value::Bool(b) => {
                        attrs.push_str(&format!(r#" {}="{}""#, key, b));
                    }
                    Value::Null => {}
                    _ => {
                        children.push((key.as_str(), val));
                    }
                }
            }

            if children.is_empty() {
                buf.push_str(&format!("<{}{}/>", tag, attrs));
            } else {
                buf.push_str(&format!("<{}{}>", tag, attrs));
                for (child_tag, child_val) in children {
                    value_to_xml(child_tag, child_val, buf);
                }
                buf.push_str(&format!("</{}>", tag));
            }
        }
        Value::Array(arr) => {
            for item in arr {
                value_to_xml(tag, item, buf);
            }
        }
        _ => {}
    }
}

fn to_xml(response: &Value) -> String {
    let mut buf = String::from(r#"<?xml version="1.0" encoding="UTF-8"?>"#);

    let status = response
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("ok");
    let version = response
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or(VERSION);
    let server_type = response
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or(SERVER_TYPE);
    let server_version = response
        .get("serverVersion")
        .and_then(|v| v.as_str())
        .unwrap_or(SERVER_VERSION);

    buf.push_str(&format!(
        r#"<subsonic-response xmlns="http://subsonic.org/restapi" status="{}" version="{}" type="{}" serverVersion="{}">"#,
        status, version, server_type, server_version
    ));

    if let Value::Object(map) = response {
        let skip = ["status", "version", "type", "serverVersion"];
        for (key, val) in map {
            if !skip.contains(&key.as_str()) {
                value_to_xml(key, val, &mut buf);
            }
        }
    }

    buf.push_str("</subsonic-response>");
    buf
}
