use serde::Deserialize;

use crate::types::tidal::{include::Include, link::Links};

#[derive(Debug, Deserialize)]
pub struct TracksCollectionResponse {
    pub data: Vec<TrackRef>,
    pub links: Links,
    pub included: Option<Vec<Track>>,
}

#[derive(Debug, Deserialize)]
pub struct TracksResponse {
    pub data: Vec<Track>,
    pub links: Links,
    pub included: Option<Vec<Include>>,
}

#[derive(Debug, Deserialize)]
pub struct TrackResponse {
    pub data: Track,
    pub links: Links,
    pub included: Option<Vec<Include>>,
}

#[derive(Debug, Deserialize)]
pub struct TrackRef {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub meta: TrackMeta,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMeta {
    pub added_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackAttributes {
    pub title: String,
    pub version: Option<String>,
    pub isrc: Option<String>,
    pub duration: Option<String>,
    pub explicit: bool,
    pub popularity: Option<f64>,
    pub access_type: Option<String>,
    pub availability: Option<Vec<String>>,
    pub media_tags: Option<Vec<String>>,
    pub spotlighted: Option<bool>,
    pub external_links: Vec<ExternalLink>,
    pub created_at: Option<String>,
    pub copyright: Option<Copyright>,
}

#[derive(Debug, Deserialize)]
pub struct Track {
    pub id: String,
    pub r#type: String,
    pub attributes: TrackAttributes,
    pub relationships: Option<TrackRelationships>,
}

#[derive(Debug, Deserialize)]
pub struct Copyright {
    pub text: String,
}

#[derive(Debug, Deserialize)]
pub struct ExternalLink {
    pub href: String,
    pub meta: Option<ExternalLinkMeta>,
}

#[derive(Debug, Deserialize)]
pub struct ExternalLinkMeta {
    // e.g. "TIDAL_SHARING"
    #[serde(rename = "type")]
    pub meta_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackRelationships {
    pub shares: Option<Relationship>,
    pub albums: Option<Relationship>,
    pub track_statistics: Option<Relationship>,
    pub artists: Option<Relationship>,
    pub genres: Option<Relationship>,
    pub similar_tracks: Option<Relationship>,
    pub owners: Option<Relationship>,
    pub lyrics: Option<Relationship>,
    pub source_file: Option<Relationship>,
    pub providers: Option<Relationship>,
    pub radio: Option<Relationship>,
}

#[derive(Debug, Deserialize)]
pub struct Relationship {
    pub links: RelationshipLinks,
}

#[derive(Debug)]
pub struct RelationshipLinks {
    pub self_: String,
}

impl<'de> Deserialize<'de> for RelationshipLinks {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // Map {"self": "..."} -> RelationshipLinks { self_: "..." }
        #[derive(Deserialize)]
        struct Raw {
            #[serde(rename = "self")]
            self_field: String,
        }
        let raw = Raw::deserialize(deserializer)?;
        Ok(RelationshipLinks {
            self_: raw.self_field,
        })
    }
}
