use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AddTrackParams {
    pub did: String,
    pub track_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddTracksParams {
    pub did: String,
    pub track_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InsertTrackAtParams {
    pub did: String,
    pub track_id: String,
    pub index: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RemoveTrackAtParams {
    pub did: String,
    pub index: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShuffleQueueParams {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetQueueParams {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClearQueueParams {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetQueueLengthParams {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IsQueueEmptyParams {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetCurrentTrackParams {
    pub did: String,
    pub index: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetCurrentTrackParams {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClearCurrentTrackParams {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveTrackParams {
    pub did: String,
    pub from: usize,
    pub to: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReplaceQueueParams {
    pub did: String,
    pub track_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetTrackAtParams {
    pub did: String,
    pub index: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InsertTracksAtParams {
    pub did: String,
    pub track_ids: Vec<String>,
    pub index: usize,
}
