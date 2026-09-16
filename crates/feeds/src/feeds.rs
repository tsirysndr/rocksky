//! The feeds this generator serves, and the one query behind all of them.
//!
//! # Fifty-two files became one table
//!
//! `apps/feeds/src/algos/` has one module per feed — `metalcore.ts`,
//! `nu-metal.ts`, `vaporwave.ts` — and all fifty-two are the same twenty lines
//! with a different genre string. That is fifty-two places for the cursor
//! logic to drift, and it did not, but only by luck.
//!
//! Here the query is written once and the feeds are data. Adding one is a row.
//!
//! # `rkey` is not the genre
//!
//! Mostly it is the genre with spaces hyphenated, but not always: the `rnb`
//! feed matches the genre `r&b`, and `alternative-rnb` matches
//! `alternative rnb`. The table is generated from the TypeScript source rather
//! than transcribed, because that is exactly the kind of mapping a person
//! copying fifty-two files gets wrong once.

use rocksky_db::schema::{Artists, Scrobbles, Tracks, Users};
use rocksky_db::sea_query::{Alias, Expr, JoinType, Order, Query, SelectStatement};
use rocksky_db::Backend;

/// One feed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Feed {
    /// The record key, which is the last segment of the feed's AT-URI.
    pub rkey: &'static str,
    /// The genre an artist must be tagged with. `None` means every scrobble,
    /// which is what the `all` feed is.
    pub genre: Option<&'static str>,
}

/// Every feed, in the order `describeFeedGenerator` lists them.
///
/// Alphabetical by `rkey`, matching the order the TypeScript registry imports
/// them in, so the two services advertise the same list in the same order.
pub const FEEDS: &[Feed] = &[
    Feed {
        rkey: "afrobeat",
        genre: Some("afrobeat"),
    },
    Feed {
        rkey: "afrobeats",
        genre: Some("afrobeats"),
    },
    Feed {
        rkey: "all",
        genre: None,
    },
    Feed {
        rkey: "alternative-metal",
        genre: Some("alternative metal"),
    },
    Feed {
        rkey: "alternative-rnb",
        genre: Some("alternative rnb"),
    },
    Feed {
        rkey: "anime",
        genre: Some("anime"),
    },
    Feed {
        rkey: "art-pop",
        genre: Some("art pop"),
    },
    Feed {
        rkey: "breakcore",
        genre: Some("breakcore"),
    },
    Feed {
        rkey: "chicago-drill",
        genre: Some("chicago drill"),
    },
    Feed {
        rkey: "chillwave",
        genre: Some("chillwave"),
    },
    Feed {
        rkey: "country-hip-hop",
        genre: Some("country hip hop"),
    },
    Feed {
        rkey: "crunk",
        genre: Some("crunk"),
    },
    Feed {
        rkey: "dance-pop",
        genre: Some("dance pop"),
    },
    Feed {
        rkey: "deep-house",
        genre: Some("deep house"),
    },
    Feed {
        rkey: "drill",
        genre: Some("drill"),
    },
    Feed {
        rkey: "dubstep",
        genre: Some("dubstep"),
    },
    Feed {
        rkey: "emo",
        genre: Some("emo"),
    },
    Feed {
        rkey: "grunge",
        genre: Some("grunge"),
    },
    Feed {
        rkey: "hard-rock",
        genre: Some("hard rock"),
    },
    Feed {
        rkey: "heavy-metal",
        genre: Some("heavy metal"),
    },
    Feed {
        rkey: "hip-hop",
        genre: Some("hip hop"),
    },
    Feed {
        rkey: "house",
        genre: Some("house"),
    },
    Feed {
        rkey: "hyperpop",
        genre: Some("hyperpop"),
    },
    Feed {
        rkey: "indie-rock",
        genre: Some("indie rock"),
    },
    Feed {
        rkey: "indie",
        genre: Some("indie"),
    },
    Feed {
        rkey: "j-pop",
        genre: Some("j-pop"),
    },
    Feed {
        rkey: "j-rock",
        genre: Some("j-rock"),
    },
    Feed {
        rkey: "jazz",
        genre: Some("jazz"),
    },
    Feed {
        rkey: "k-pop",
        genre: Some("k-pop"),
    },
    Feed {
        rkey: "lo-fi",
        genre: Some("lo-fi"),
    },
    Feed {
        rkey: "metal",
        genre: Some("metal"),
    },
    Feed {
        rkey: "metalcore",
        genre: Some("metalcore"),
    },
    Feed {
        rkey: "midwest-emo",
        genre: Some("midwest emo"),
    },
    Feed {
        rkey: "nu-metal",
        genre: Some("nu metal"),
    },
    Feed {
        rkey: "pop-punk",
        genre: Some("pop punk"),
    },
    Feed {
        rkey: "post-grunge",
        genre: Some("post-grunge"),
    },
    Feed {
        rkey: "rap-metal",
        genre: Some("rap metal"),
    },
    Feed {
        rkey: "rap",
        genre: Some("rap"),
    },
    // Not `rnb`: the genre really is spelled with an ampersand.
    Feed {
        rkey: "rnb",
        genre: Some("r&b"),
    },
    Feed {
        rkey: "rock",
        genre: Some("rock"),
    },
    Feed {
        rkey: "southern-hip-hop",
        genre: Some("southern hip hop"),
    },
    Feed {
        rkey: "speedcore",
        genre: Some("speedcore"),
    },
    Feed {
        rkey: "swedish-pop",
        genre: Some("swedish pop"),
    },
    Feed {
        rkey: "synthwave",
        genre: Some("synthwave"),
    },
    Feed {
        rkey: "thrash-metal",
        genre: Some("thrash metal"),
    },
    Feed {
        rkey: "trap-soul",
        genre: Some("trap soul"),
    },
    Feed {
        rkey: "trap",
        genre: Some("trap"),
    },
    Feed {
        rkey: "tropical-house",
        genre: Some("tropical house"),
    },
    Feed {
        rkey: "vaporwave",
        genre: Some("vaporwave"),
    },
    Feed {
        rkey: "visual-kei",
        genre: Some("visual kei"),
    },
    Feed {
        rkey: "vocaloid",
        genre: Some("vocaloid"),
    },
    Feed {
        rkey: "west-coast-hip-hop",
        genre: Some("west coast hip hop"),
    },
];

/// The feed with this record key.
pub fn find(rkey: &str) -> Option<&'static Feed> {
    FEEDS.iter().find(|feed| feed.rkey == rkey)
}

/// Scrobbles to return when the caller does not say.
pub const DEFAULT_LIMIT: i64 = 50;

/// The most any caller may ask for in one page.
///
/// Upstream has no cap at all, so `?limit=100000` is a request to serialize
/// the entire history. A feed is read by an infinite scroller, which never
/// needs more than a screenful.
pub const MAX_LIMIT: i64 = 100;

/// A row of the feed query.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct FeedRow {
    pub id: String,
    pub uri: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    pub album_uri: Option<String>,
    pub artist_uri: Option<String>,
    pub sha256: String,
    pub track_id: String,
    pub track_uri: Option<String>,
    pub did: String,
    pub handle: String,
    pub avatar: String,
}

/// The query behind every feed.
///
/// Newest first, with the cursor as a strict upper bound on the timestamp.
/// That is keyset paging, not an offset: an offset over a table growing at the
/// head — which is exactly what a scrobble feed is — skips rows on every page
/// after the first.
pub fn query(db: &Backend, feed: &Feed, limit: i64, cursor: Option<&str>) -> SelectStatement {
    let scrobbles = Alias::new("s");
    let tracks = Alias::new("t");
    let artists = Alias::new("a");
    let users = Alias::new("u");

    let mut query = Query::select();
    query
        .expr_as(
            Expr::col((scrobbles.clone(), Scrobbles::XataId)),
            Alias::new("id"),
        )
        .expr_as(
            Expr::col((scrobbles.clone(), Scrobbles::Uri)),
            Alias::new("uri"),
        )
        .expr_as(
            db.cast_timestamp(Expr::col((scrobbles.clone(), Scrobbles::Timestamp))),
            Alias::new("timestamp"),
        )
        .expr(Expr::col((tracks.clone(), Tracks::Title)))
        .expr(Expr::col((tracks.clone(), Tracks::Artist)))
        .expr(Expr::col((tracks.clone(), Tracks::Album)))
        .expr(Expr::col((tracks.clone(), Tracks::AlbumArtist)))
        .expr(Expr::col((tracks.clone(), Tracks::AlbumArt)))
        .expr(Expr::col((tracks.clone(), Tracks::AlbumUri)))
        .expr(Expr::col((tracks.clone(), Tracks::ArtistUri)))
        .expr(Expr::col((tracks.clone(), Tracks::Sha256)))
        .expr_as(
            Expr::col((tracks.clone(), Tracks::XataId)),
            Alias::new("track_id"),
        )
        .expr_as(
            Expr::col((tracks.clone(), Tracks::Uri)),
            Alias::new("track_uri"),
        )
        .expr(Expr::col((users.clone(), Users::Did)))
        .expr(Expr::col((users.clone(), Users::Handle)))
        .expr(Expr::col((users.clone(), Users::Avatar)))
        .from_as(Scrobbles::Table, scrobbles.clone())
        .join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            tracks.clone(),
            Expr::col((tracks.clone(), Tracks::XataId))
                .equals((scrobbles.clone(), Scrobbles::TrackId)),
        )
        .join_as(
            JoinType::InnerJoin,
            Users::Table,
            users.clone(),
            Expr::col((users.clone(), Users::XataId))
                .equals((scrobbles.clone(), Scrobbles::UserId)),
        );

    // The artist row is only needed for its genres, so the unfiltered feed
    // does not join it — and must not, since a scrobble with no artist row
    // would then be dropped from the "all" feed.
    if let Some(genre) = feed.genre {
        query
            .join_as(
                JoinType::InnerJoin,
                Artists::Table,
                artists.clone(),
                Expr::col((artists.clone(), Artists::XataId))
                    .equals((scrobbles.clone(), Scrobbles::ArtistId)),
            )
            .and_where(db.array_contains("a.genres", genre));
    }

    if let Some(after) = parse_cursor(cursor) {
        query.and_where(
            Expr::col((scrobbles.clone(), Scrobbles::Timestamp))
                .lt(db.timestamp_value(rocksky_db::format_timestamp(after))),
        );
    }

    query
        .order_by((scrobbles.clone(), Scrobbles::Timestamp), Order::Desc)
        // Ties broken by id, or two scrobbles with the same timestamp can swap
        // between pages and one is served twice while another is never served.
        .order_by((scrobbles, Scrobbles::XataId), Order::Desc)
        .limit(limit.clamp(1, MAX_LIMIT) as u64);

    query
}

/// The cursor is epoch milliseconds, as `apps/feeds` emits and consumes.
///
/// A malformed one is treated as absent rather than as an error: a stale
/// client should get the first page back, not a 400 it cannot recover from.
pub fn parse_cursor(cursor: Option<&str>) -> Option<chrono::DateTime<chrono::Utc>> {
    let millis: i64 = cursor?.trim().parse().ok()?;
    chrono::DateTime::from_timestamp_millis(millis)
}

/// The cursor for the page after these rows.
pub fn next_cursor(rows: &[FeedRow]) -> Option<String> {
    rows.last()
        .map(|row| row.timestamp.timestamp_millis().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The table is the port of fifty-two files; a missing or duplicated entry
    /// is a feed that 404s or shadows another.
    #[test]
    fn every_feed_is_unique_and_the_count_matches_upstream() {
        assert_eq!(FEEDS.len(), 52, "apps/feeds has 52 algorithms");

        let mut keys: Vec<&str> = FEEDS.iter().map(|feed| feed.rkey).collect();
        keys.sort_unstable();
        let before = keys.len();
        keys.dedup();
        assert_eq!(keys.len(), before, "duplicate rkey");

        // Exactly one unfiltered feed.
        assert_eq!(FEEDS.iter().filter(|feed| feed.genre.is_none()).count(), 1);
        assert_eq!(find("all").unwrap().genre, None);
    }

    /// The mappings a transcription would get wrong.
    #[test]
    fn an_rkey_is_not_always_its_genre() {
        assert_eq!(find("rnb").unwrap().genre, Some("r&b"));
        assert_eq!(
            find("alternative-rnb").unwrap().genre,
            Some("alternative rnb")
        );
        assert_eq!(find("nu-metal").unwrap().genre, Some("nu metal"));
        assert_eq!(find("post-grunge").unwrap().genre, Some("post-grunge"));
        assert_eq!(find("j-pop").unwrap().genre, Some("j-pop"));
    }

    #[test]
    fn an_unknown_rkey_has_no_feed() {
        assert!(find("does-not-exist").is_none());
        assert!(find("").is_none());
        // Not a prefix match, or `rock` would serve `rockabilly`.
        assert!(find("roc").is_none());
    }

    /// Epoch milliseconds in, epoch milliseconds out, and a bad cursor reads
    /// as absent rather than failing the request.
    #[test]
    fn the_cursor_round_trips() {
        assert_eq!(parse_cursor(None), None);
        assert_eq!(parse_cursor(Some("")), None);
        assert_eq!(parse_cursor(Some("not-a-number")), None);

        let at = parse_cursor(Some("1700000000000")).unwrap();
        assert_eq!(at.timestamp_millis(), 1_700_000_000_000);

        let rows = vec![FeedRow {
            id: "rec_s1".into(),
            uri: None,
            timestamp: at,
            title: "t".into(),
            artist: "a".into(),
            album: "al".into(),
            album_artist: "aa".into(),
            album_art: None,
            album_uri: None,
            artist_uri: None,
            sha256: "s".into(),
            track_id: "rec_t1".into(),
            track_uri: None,
            did: "did:plc:alice".into(),
            handle: "alice".into(),
            avatar: String::new(),
        }];
        assert_eq!(next_cursor(&rows).as_deref(), Some("1700000000000"));
        assert_eq!(next_cursor(&[]), None);
    }
}
