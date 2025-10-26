use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Include {
    pub id: String,
    pub r#type: String,
    pub attributes: Attributes,
    pub relationships: Option<Relationships>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attributes {
    // track specific
    pub title: Option<String>,
    pub version: Option<String>,
    pub isrc: Option<String>,
    pub duration: Option<String>,
    pub copyright: Option<Copyright>,
    pub explicit: Option<bool>,
    pub popularity: Option<f64>,
    pub access_type: Option<String>,
    pub availability: Option<Vec<String>>,
    pub media_tags: Option<Vec<String>>,
    pub external_links: Option<Vec<ExternalLink>>,
    pub spotlighted: Option<bool>,
    pub created_at: Option<String>,

    // album specific
    pub barcode_id: Option<String>,
    pub number_of_volumes: Option<u32>,
    pub number_of_items: Option<u32>,
    pub release_date: Option<String>,

    // artist specific
    pub name: Option<String>,

    // artwork specific
    pub media_type: Option<String>,
    pub files: Option<Vec<ArtworkFile>>,
}

#[derive(Debug, Deserialize)]
pub struct ArtworkFile {
    pub href: String,
    pub meta: ArtworkFileMeta,
}

#[derive(Debug, Deserialize)]
pub struct ArtworkFileMeta {
    pub width: u32,
    pub height: u32,
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
pub struct Relationships {
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
    pub similar_albums: Option<Relationship>,
    pub cover_art: Option<Relationship>,
    pub items: Option<Relationship>,
    pub biography: Option<Relationship>,
    pub profile_art: Option<Relationship>,
    pub roles: Option<Relationship>,
    pub videos: Option<Relationship>,
    pub tracks: Option<Relationship>,
}

#[derive(Debug, Deserialize)]
pub struct Relationship {
    pub data: Option<serde_json::Value>,
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
