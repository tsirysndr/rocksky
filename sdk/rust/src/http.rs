//! Low-level XRPC HTTP transport used by every resource module.

use std::sync::Arc;

use reqwest::{Method, Response};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use tokio::sync::RwLock;

use crate::error::{Error, Result};

pub(crate) const DEFAULT_BASE_URL: &str = "https://api.rocksky.app";

#[derive(Debug)]
pub(crate) struct Transport {
    pub(crate) http: reqwest::Client,
    pub(crate) base_url: String,
    pub(crate) token: RwLock<Option<String>>,
    pub(crate) user_agent: String,
}

impl Transport {
    pub(crate) fn new(
        http: reqwest::Client,
        base_url: impl Into<String>,
        token: Option<String>,
        user_agent: impl Into<String>,
    ) -> Self {
        let mut base = base_url.into();
        while base.ends_with('/') {
            base.pop();
        }
        Self {
            http,
            base_url: base,
            token: RwLock::new(token),
            user_agent: user_agent.into(),
        }
    }

    pub(crate) async fn current_token(&self) -> Option<String> {
        self.token.read().await.clone()
    }

    pub(crate) async fn set_token(&self, token: Option<String>) {
        *self.token.write().await = token;
    }

    /// XRPC query (HTTP GET). Returns the parsed JSON body (or `Value::Null`
    /// for empty bodies).
    pub(crate) async fn query<P: Serialize + ?Sized>(
        &self,
        method: &str,
        params: &P,
        auth: bool,
    ) -> Result<Value> {
        self.request_json(Method::GET, method, Some(params), None::<&()>, auth)
            .await
    }

    /// XRPC procedure (HTTP POST). Body is JSON; params, if any, go on the
    /// query string (some procedures use only params, e.g. `removeApikey`).
    pub(crate) async fn procedure<P: Serialize + ?Sized, B: Serialize + ?Sized>(
        &self,
        method: &str,
        params: Option<&P>,
        body: Option<&B>,
        auth: bool,
    ) -> Result<Value> {
        self.request_json(Method::POST, method, params, body, auth).await
    }

    /// Like `query`, but deserializes directly into `T`.
    pub(crate) async fn query_as<T, P>(&self, method: &str, params: &P, auth: bool) -> Result<T>
    where
        T: DeserializeOwned,
        P: Serialize + ?Sized,
    {
        let value = self.query(method, params, auth).await?;
        decode(method, value)
    }

    /// Like `procedure`, but deserializes directly into `T`.
    pub(crate) async fn procedure_as<T, P, B>(
        &self,
        method: &str,
        params: Option<&P>,
        body: Option<&B>,
        auth: bool,
    ) -> Result<T>
    where
        T: DeserializeOwned,
        P: Serialize + ?Sized,
        B: Serialize + ?Sized,
    {
        let value = self.procedure(method, params, body, auth).await?;
        decode(method, value)
    }

    async fn request_json<P, B>(
        &self,
        verb: Method,
        method: &str,
        params: Option<&P>,
        body: Option<&B>,
        auth: bool,
    ) -> Result<Value>
    where
        P: Serialize + ?Sized,
        B: Serialize + ?Sized,
    {
        let url = format!("{}/xrpc/{}", self.base_url, method);
        let mut req = self
            .http
            .request(verb, &url)
            .header("user-agent", &self.user_agent)
            .header("accept", "application/json");

        if auth {
            let token = self.current_token().await;
            let Some(tok) = token else {
                return Err(Error::MissingToken {
                    method: method.to_string(),
                });
            };
            req = req.bearer_auth(tok);
        }

        if let Some(p) = params {
            // Strip None / nulls from the serialized params before they hit
            // the wire. (Serde's #[skip_serializing_if = "Option::is_none"]
            // covers struct-shaped params; this is a belt-and-braces clean.)
            let cleaned = clean_params(p, method)?;
            if !cleaned.is_empty() {
                req = req.query(&cleaned);
            }
        }

        if let Some(b) = body {
            req = req.json(b);
        }

        let response = req.send().await.map_err(|source| Error::Transport {
            method: method.to_string(),
            source,
        })?;

        parse_response(response, method).await
    }
}

fn clean_params<P: Serialize + ?Sized>(
    params: &P,
    method: &str,
) -> Result<Vec<(String, String)>> {
    let value = serde_json::to_value(params).map_err(|source| Error::Json {
        method: method.to_string(),
        source,
    })?;
    let mut out = Vec::new();
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                push_param(&mut out, k, v);
            }
        }
        Value::Null => {}
        _ => {} // ignore non-object/non-null params
    }
    Ok(out)
}

fn push_param(out: &mut Vec<(String, String)>, key: String, value: Value) {
    match value {
        Value::Null => {}
        Value::Bool(b) => out.push((key, if b { "true".into() } else { "false".into() })),
        Value::Number(n) => out.push((key, n.to_string())),
        Value::String(s) => out.push((key, s)),
        Value::Array(items) => {
            // Repeat the parameter per array element — matches reqwest's default
            // for [(k, v), (k, v)] and the API's tolerance for multi-value query
            // strings.
            for item in items {
                push_param(out, key.clone(), item);
            }
        }
        Value::Object(_) => {
            // Objects can't ride the query string sensibly; serialize as JSON
            // string so callers can opt in if they really mean it.
            if let Ok(s) = serde_json::to_string(&value) {
                out.push((key, s));
            }
        }
    }
}

async fn parse_response(response: Response, method: &str) -> Result<Value> {
    let status = response.status();
    if status.is_success() {
        if status.as_u16() == 204 {
            return Ok(Value::Null);
        }
        let bytes = response.bytes().await.map_err(|source| Error::Transport {
            method: method.to_string(),
            source,
        })?;
        if bytes.is_empty() {
            return Ok(Value::Null);
        }
        return serde_json::from_slice(&bytes).map_err(|source| Error::Json {
            method: method.to_string(),
            source,
        });
    }

    // Error response — try JSON first; fall back to text.
    let bytes = response.bytes().await.unwrap_or_default();
    let (error_code, message, body) = if bytes.is_empty() {
        (None, None, None)
    } else if let Ok(json) = serde_json::from_slice::<Value>(&bytes) {
        let err = json
            .get("error")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let msg = json
            .get("message")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        (err, msg, Some(json))
    } else {
        let text = String::from_utf8_lossy(&bytes).to_string();
        (None, Some(text.clone()), Some(Value::String(text)))
    };

    Err(Error::Api {
        status: status.as_u16(),
        method: method.to_string(),
        error: error_code,
        message,
        body,
    })
}

fn decode<T: DeserializeOwned>(method: &str, value: Value) -> Result<T> {
    let v = if value.is_null() { Value::Object(Default::default()) } else { value };
    serde_json::from_value(v).map_err(|source| Error::Json {
        method: method.to_string(),
        source,
    })
}

/// Shared handle owned by the [`Client`](crate::Client). Cheap to clone.
pub(crate) type Shared = Arc<Transport>;
