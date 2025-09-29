use serde_json::Value;

#[derive(Debug, Clone)]
pub struct Request {
    pub cursor: Option<String>,
    pub feed: String,
    pub limit: Option<u8>,
}

#[derive(Debug, Clone)]
pub struct Cid(pub String);

#[derive(Debug, Clone)]
pub struct Did(pub String);

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct Uri(pub String);

#[derive(Debug, Clone)]
pub struct FeedResult {
    pub cursor: Option<String>,
    pub feed: Vec<Uri>,
}

pub struct FeedSkeletonQuery {}

#[derive(Deserialize)]
pub struct FeedSkeletonParameters {}

impl Into<FeedSkeletonQuery> for FeedSkeletonParameters {
    fn into(self) -> FeedSkeletonQuery {
        FeedSkeletonQuery {}
    }
}

#[derive(Debug, Clone)]
pub struct Scrobble {}

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub(crate) struct DidDocument {
    #[serde(rename = "@context")]
    pub(crate) context: Vec<String>,
    pub(crate) id: String,
    pub(crate) service: Vec<Service>,
}

#[derive(Serialize)]
pub(crate) struct Service {
    pub(crate) id: String,
    #[serde(rename = "type")]
    pub(crate) type_: String,
    #[serde(rename = "serviceEndpoint")]
    pub(crate) service_endpoint: String,
}

#[derive(Debug, Deserialize)]
pub struct Commit {
    pub rev: String,
    pub operation: String,
    pub collection: String,
    pub rkey: String,
    pub record: Value,
    pub cid: String,
}

#[derive(Debug, Deserialize)]
pub struct Root {
    pub did: String,
    pub time_us: i64,
    pub kind: String,
    pub commit: Option<Commit>,
}
