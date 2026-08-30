//! MusicBrainz ws/2 served from a DuckDB import of the JSON dumps.
//!
//! The dumps at metabrainz.org ship one NDJSON file per entity, each line
//! already in the ws/2 lookup shape with every `inc=` expansion inlined
//! (aliases, tags, genres, ratings, relations). Import extracts the columns
//! lookups and searches filter on and keeps the full document verbatim, so a
//! lookup is an index probe plus echoing stored JSON.
//!
//! Pointing a client at it is a base-URL change:
//!
//! ```text
//! MUSICBRAINZ_API_URL=http://localhost:8094/ws/2
//! ```

pub mod db;
pub mod import;
pub mod routes;
pub mod search;

pub const DEFAULT_PORT: u16 = 8094;

/// One dumped entity and how it maps onto SQL.
pub struct EntitySpec {
    /// Path segment in ws/2 and directory name in the dump (`release-group`).
    pub path: &'static str,
    /// SQL table name (`mb_release_group`).
    pub table: &'static str,
    /// JSON field holding the display name: `name` or `title`.
    pub name_field: &'static str,
    /// Key of the result array in a search/browse response (`release-groups`).
    pub plural: &'static str,
    /// Whether the JSON carries `sort-name`.
    pub has_sort_name: bool,
}

pub const ENTITIES: &[EntitySpec] = &[
    EntitySpec {
        path: "area",
        table: "mb_area",
        name_field: "name",
        plural: "areas",
        has_sort_name: true,
    },
    EntitySpec {
        path: "artist",
        table: "mb_artist",
        name_field: "name",
        plural: "artists",
        has_sort_name: true,
    },
    EntitySpec {
        path: "event",
        table: "mb_event",
        name_field: "name",
        plural: "events",
        has_sort_name: false,
    },
    EntitySpec {
        path: "instrument",
        table: "mb_instrument",
        name_field: "name",
        plural: "instruments",
        has_sort_name: false,
    },
    EntitySpec {
        path: "label",
        table: "mb_label",
        name_field: "name",
        plural: "labels",
        has_sort_name: true,
    },
    EntitySpec {
        path: "place",
        table: "mb_place",
        name_field: "name",
        plural: "places",
        has_sort_name: false,
    },
    EntitySpec {
        path: "recording",
        table: "mb_recording",
        name_field: "title",
        plural: "recordings",
        has_sort_name: false,
    },
    EntitySpec {
        path: "release-group",
        table: "mb_release_group",
        name_field: "title",
        plural: "release-groups",
        has_sort_name: false,
    },
    EntitySpec {
        path: "work",
        table: "mb_work",
        name_field: "title",
        plural: "works",
        has_sort_name: false,
    },
];

pub fn entity(path: &str) -> Option<&'static EntitySpec> {
    ENTITIES.iter().find(|e| e.path == path)
}
