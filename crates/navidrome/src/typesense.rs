use anyhow::Error;
use serde::Deserialize;
use serde_json::Value;
use std::env;
use std::sync::OnceLock;

static HTTP: OnceLock<reqwest::Client> = OnceLock::new();
fn http() -> &'static reqwest::Client {
    HTTP.get_or_init(reqwest::Client::new)
}

pub struct TypesenseClient {
    base_url: String,
    api_key: String,
}

#[derive(Deserialize)]
pub struct SearchHit {
    pub document: Value,
}

#[derive(Deserialize)]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
    pub found: u64,
}

impl TypesenseClient {
    pub fn from_env() -> Option<Self> {
        let api_key = env::var("TYPESENSE_API_KEY").ok()?;
        let host = env::var("TYPESENSE_HOST").unwrap_or_else(|_| "localhost".to_string());
        let port = env::var("TYPESENSE_PORT").unwrap_or_else(|_| "8108".to_string());
        let protocol = env::var("TYPESENSE_PROTOCOL").unwrap_or_else(|_| "http".to_string());
        Some(Self {
            base_url: format!("{}://{}:{}", protocol, host, port),
            api_key,
        })
    }

    async fn search(
        &self,
        query: &str,
        query_by: &str,
        filter_by: &str,
        per_page: u64,
        page: u64,
    ) -> Result<SearchResponse, Error> {
        let q = if query.trim().is_empty() { "*" } else { query };
        let sort_by = if q == "*" {
            "uploaded_at:desc"
        } else {
            "_text_match:desc,uploaded_at:desc"
        };
        let url = format!(
            "{}/collections/library_tracks/documents/search",
            self.base_url
        );
        let resp = http()
            .get(&url)
            .header("X-TYPESENSE-API-KEY", &self.api_key)
            .query(&[
                ("q", q),
                ("query_by", query_by),
                ("filter_by", filter_by),
                ("per_page", &per_page.to_string()),
                ("page", &page.to_string()),
                ("sort_by", sort_by),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<SearchResponse>()
            .await?;
        Ok(resp)
    }

    /// Returns track_ids for hits, paginated server-side via Typesense.
    pub async fn search_track_ids(
        &self,
        user_id: &str,
        query: &str,
        count: i64,
        offset: i64,
    ) -> Result<Vec<String>, Error> {
        let per_page = count.max(1).min(250) as u64;
        // Typesense pages are 1-indexed. Frontend always advances offset by `count`.
        let page = ((offset / count.max(1)) + 1) as u64;
        let resp = self
            .search(
                query,
                "title,artist,album,album_artist,genre,composer",
                &format!("user_id:={}", user_id),
                per_page,
                page,
            )
            .await?;

        let ids: Vec<String> = resp
            .hits
            .iter()
            .filter_map(|h| h.document["track_id"].as_str().map(|s| s.to_string()))
            .collect();
        Ok(ids)
    }

    /// Returns unique album names + album_artist for hits, for album search.
    pub async fn search_album_names(
        &self,
        user_id: &str,
        query: &str,
        count: i64,
        offset: i64,
    ) -> Result<Vec<(String, String)>, Error> {
        let per_page = ((count + offset) * 3).min(250) as u64;
        let resp = self
            .search(
                query,
                "album,album_artist",
                &format!("user_id:={}", user_id),
                per_page,
                1,
            )
            .await?;

        let mut seen = std::collections::HashSet::new();
        let pairs: Vec<(String, String)> = resp
            .hits
            .iter()
            .filter_map(|h| {
                let album = h.document["album"].as_str()?.to_string();
                let aa = h.document["album_artist"].as_str()?.to_string();
                Some((album, aa))
            })
            .filter(|pair| seen.insert(pair.clone()))
            .skip(offset as usize)
            .take(count as usize)
            .collect();
        Ok(pairs)
    }

    /// Returns unique artist names for hits, for artist search.
    pub async fn search_artist_names(
        &self,
        user_id: &str,
        query: &str,
        count: i64,
        offset: i64,
    ) -> Result<Vec<String>, Error> {
        let per_page = ((count + offset) * 3).min(250) as u64;
        let resp = self
            .search(
                query,
                "artist,album_artist",
                &format!("user_id:={}", user_id),
                per_page,
                1,
            )
            .await?;

        let mut seen = std::collections::HashSet::new();
        let names: Vec<String> = resp
            .hits
            .iter()
            .filter_map(|h| h.document["album_artist"].as_str().map(|s| s.to_string()))
            .filter(|n| seen.insert(n.clone()))
            .skip(offset as usize)
            .take(count as usize)
            .collect();
        Ok(names)
    }
}
