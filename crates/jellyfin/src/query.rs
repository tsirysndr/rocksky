//! Jellyfin query-string parsing.
//!
//! Query parameters are camelCase (JSON bodies are PascalCase), and the spec
//! allows array parameters as repeated keys
//! (`?includeItemTypes=Folder&includeItemTypes=Audio`). `web::Query` rejects
//! duplicates with a 400, so the string is parsed by hand and repeats are
//! joined with commas — which is the other form clients send anyway.

use actix_web::HttpRequest;
use std::collections::HashMap;

#[derive(Debug, Default, Clone)]
pub struct ItemsQuery {
    pub parent_id: Option<String>,
    pub include_item_types: Option<String>,
    pub media_types: Option<String>,
    pub name_starts_with: Option<String>,
    pub name_starts_with_or_greater: Option<String>,
    pub name_less_than: Option<String>,
    pub recursive: Option<bool>,
    pub search_term: Option<String>,
    pub ids: Option<String>,
    pub album_artist_ids: Option<String>,
    pub artist_ids: Option<String>,
    pub album_ids: Option<String>,
    pub genre_ids: Option<String>,
    pub genres: Option<String>,
    pub start_index: Option<i64>,
    pub limit: Option<i64>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub user_id: Option<String>,
    pub is_favorite: Option<bool>,
    pub filters: Option<String>,
    pub years: Option<String>,
}

pub fn collect(req: &HttpRequest) -> HashMap<String, Vec<String>> {
    let pairs: Vec<(String, String)> =
        serde_urlencoded::from_str(req.query_string()).unwrap_or_default();
    let mut out: HashMap<String, Vec<String>> = HashMap::new();
    for (k, v) in pairs {
        out.entry(k).or_default().push(v);
    }
    out
}

pub fn parse(req: &HttpRequest) -> ItemsQuery {
    let q = collect(req);
    // Clients are inconsistent about the leading capital, so look for both.
    let one = |k: &str, alt: &str| {
        q.get(k)
            .or_else(|| q.get(alt))
            .and_then(|v| v.first())
            .cloned()
    };
    let csv = |k: &str, alt: &str| q.get(k).or_else(|| q.get(alt)).map(|v| v.join(","));
    let flag = |k: &str, alt: &str| one(k, alt).and_then(|s| s.parse::<bool>().ok());
    let num = |k: &str, alt: &str| one(k, alt).and_then(|s| s.parse::<i64>().ok());

    ItemsQuery {
        parent_id: one("parentId", "ParentId"),
        include_item_types: csv("includeItemTypes", "IncludeItemTypes"),
        media_types: csv("mediaTypes", "MediaTypes"),
        name_starts_with: one("nameStartsWith", "NameStartsWith"),
        name_starts_with_or_greater: one("nameStartsWithOrGreater", "NameStartsWithOrGreater"),
        name_less_than: one("nameLessThan", "NameLessThan"),
        recursive: flag("recursive", "Recursive"),
        search_term: one("searchTerm", "SearchTerm"),
        ids: csv("ids", "Ids"),
        album_artist_ids: csv("albumArtistIds", "AlbumArtistIds"),
        artist_ids: csv("artistIds", "ArtistIds"),
        album_ids: csv("albumIds", "AlbumIds"),
        genre_ids: csv("genreIds", "GenreIds"),
        genres: csv("genres", "Genres"),
        start_index: num("startIndex", "StartIndex"),
        limit: num("limit", "Limit"),
        sort_by: csv("sortBy", "SortBy"),
        sort_order: one("sortOrder", "SortOrder"),
        user_id: one("userId", "UserId"),
        is_favorite: flag("isFavorite", "IsFavorite"),
        filters: csv("filters", "Filters"),
        years: csv("years", "Years"),
    }
}

impl ItemsQuery {
    pub fn limit_or(&self, default: i64) -> i64 {
        self.limit.unwrap_or(default).clamp(1, 1000)
    }

    pub fn offset(&self) -> i64 {
        self.start_index.unwrap_or(0).max(0)
    }

    pub fn wants(&self, kind: &str) -> bool {
        includes(&self.include_item_types, kind)
    }

    /// No type, no parent, no filter — the "what libraries do you have" call
    /// the reference server answers with `CollectionFolder`s.
    pub fn is_bare(&self) -> bool {
        self.parent_id.is_none()
            && self.ids.is_none()
            && self.search_term.is_none()
            && self.include_item_types.is_none()
            && self.media_types.is_none()
            && self.album_artist_ids.is_none()
            && self.artist_ids.is_none()
            && self.album_ids.is_none()
            && self.genre_ids.is_none()
    }

    /// Favourites-only, asked either as `?isFavorite=true` or as the
    /// `?filters=IsFavorite` CSV enum. Only the affirmative direction counts —
    /// `isFavorite=false` is how clients spell "don't filter".
    pub fn favorites_only(&self) -> bool {
        self.is_favorite == Some(true) || includes(&self.filters, "IsFavorite")
    }

    /// The first id in an artist filter, whichever spelling the client used.
    pub fn first_artist_filter(&self) -> Option<&str> {
        self.album_artist_ids
            .as_deref()
            .or(self.artist_ids.as_deref())
            .and_then(|s| s.split(',').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
    }

    pub fn first_genre_filter(&self) -> Option<&str> {
        self.genre_ids
            .as_deref()
            .and_then(|s| s.split(',').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
    }

    /// Sort key the client asked for, lower-cased, first entry only.
    pub fn sort_key(&self) -> Option<String> {
        self.sort_by
            .as_deref()
            .and_then(|s| s.split(',').next())
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty())
    }

    pub fn descending(&self) -> bool {
        self.sort_order
            .as_deref()
            .map(|s| s.eq_ignore_ascii_case("Descending"))
            .unwrap_or(false)
    }
}

pub fn includes(csv: &Option<String>, want: &str) -> bool {
    match csv {
        None => false,
        Some(s) => s.split(',').any(|p| p.trim().eq_ignore_ascii_case(want)),
    }
}

/// Split a comma-separated id list the way clients send it.
pub fn split_ids(csv: &str) -> Vec<&str> {
    csv.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::test::TestRequest;

    fn q(uri: &str) -> ItemsQuery {
        parse(&TestRequest::default().uri(uri).to_http_request())
    }

    #[test]
    fn repeated_keys_become_a_csv() {
        let parsed = q("/Items?includeItemTypes=Folder&includeItemTypes=Audio");
        assert_eq!(parsed.include_item_types.as_deref(), Some("Folder,Audio"));
        assert!(parsed.wants("Audio"));
        assert!(!parsed.wants("MusicAlbum"));
    }

    #[test]
    fn pascal_case_keys_are_accepted() {
        assert_eq!(q("/Items?ParentId=abc").parent_id.as_deref(), Some("abc"));
        assert_eq!(q("/Items?parentId=abc").parent_id.as_deref(), Some("abc"));
    }

    #[test]
    fn values_are_url_decoded() {
        assert_eq!(
            q("/Items?searchTerm=daft%20punk").search_term.as_deref(),
            Some("daft punk")
        );
    }

    #[test]
    fn favorites_only_reads_both_spellings() {
        assert!(q("/Items?isFavorite=true").favorites_only());
        assert!(q("/Items?filters=IsFavorite").favorites_only());
        assert!(!q("/Items?isFavorite=false").favorites_only());
        assert!(!q("/Items").favorites_only());
    }

    #[test]
    fn bare_query_is_the_library_listing() {
        assert!(q("/Items?userId=x").is_bare());
        assert!(!q("/Items?includeItemTypes=Audio").is_bare());
        assert!(!q("/Items?parentId=x").is_bare());
    }

    #[test]
    fn limit_is_clamped_and_offset_never_negative() {
        assert_eq!(q("/Items?limit=0").limit_or(50), 1);
        assert_eq!(q("/Items?limit=99999").limit_or(50), 1000);
        assert_eq!(q("/Items").limit_or(50), 50);
        assert_eq!(q("/Items?startIndex=-5").offset(), 0);
    }

    #[test]
    fn artist_filter_prefers_album_artist_ids() {
        let parsed = q("/Items?albumArtistIds=a,b&artistIds=c");
        assert_eq!(parsed.first_artist_filter(), Some("a"));
    }
}
