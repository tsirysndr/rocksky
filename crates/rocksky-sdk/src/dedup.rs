//! Duplicate prevention for repo writes.
//!
//! Rocksky derives a stable **identity hash** for every song, album and artist
//! (SHA-256, lowercase-hex) and treats a scrobble as unique per
//! `(actor, song, timestamp)`. Writing the same song/album/artist twice, or two
//! scrobbles of the same track at the same instant, creates junk records the
//! AppView then has to de-duplicate. This module lets the SDK avoid that at the
//! source.
//!
//! The hash helpers ([`song_hash`], [`album_hash`], [`artist_hash`]) are always
//! available and match the server byte-for-byte. The [`RepoIndex`] — a local
//! RocksDB mirror of the user's repo, built from a `com.atproto.sync.getRepo`
//! CAR — is gated behind the `dedup` feature.
//!
//! ```text
//!   did + song_hash                  -> existing app.rocksky.song  at-uri
//!   did + album_hash                 -> existing app.rocksky.album  at-uri
//!   did + artist_hash                -> existing app.rocksky.artist at-uri
//!   did + song_hash + unix_seconds   -> existing app.rocksky.scrobble at-uri
//! ```

use sha2::{Digest, Sha256};

/// Lowercase-hex SHA-256 of `s.to_lowercase()`. The lowercasing is applied to
/// the whole string (not per field), matching Rocksky's `createHash`/`sha256::digest`.
fn sha256_lower(s: &str) -> String {
    let digest = Sha256::digest(s.to_lowercase().as_bytes());
    let mut out = String::with_capacity(64);
    for b in digest {
        use core::fmt::Write;
        let _ = write!(out, "{b:02x}");
    }
    out
}

/// Identity hash of a song/track: `sha256(lower("{title} - {artist} - {album}"))`.
/// Uses the per-track `artist`, not the album artist.
pub fn song_hash(title: &str, artist: &str, album: &str) -> String {
    sha256_lower(&format!("{title} - {artist} - {album}"))
}

/// Identity hash of an album: `sha256(lower("{album} - {album_artist}"))`.
pub fn album_hash(album: &str, album_artist: &str) -> String {
    sha256_lower(&format!("{album} - {album_artist}"))
}

/// Identity hash of an artist: `sha256(lower(album_artist))` — a single field.
pub fn artist_hash(album_artist: &str) -> String {
    sha256_lower(album_artist)
}

/// The Rocksky collection NSIDs this index tracks. Only referenced by the
/// feature-gated index module.
#[cfg_attr(not(feature = "dedup"), allow(dead_code))]
pub(crate) const C_ARTIST: &str = "app.rocksky.artist";
#[cfg_attr(not(feature = "dedup"), allow(dead_code))]
pub(crate) const C_ALBUM: &str = "app.rocksky.album";
#[cfg_attr(not(feature = "dedup"), allow(dead_code))]
pub(crate) const C_SONG: &str = "app.rocksky.song";
#[cfg_attr(not(feature = "dedup"), allow(dead_code))]
pub(crate) const C_SCROBBLE: &str = "app.rocksky.scrobble";

#[cfg(feature = "dedup")]
pub use index::{IndexStats, RepoIndex};

#[cfg(feature = "dedup")]
mod index {
    use std::collections::HashMap;
    use std::io::Read;
    use std::path::Path;

    use ipld_core::cid::Cid;
    use ipld_core::ipld::Ipld;
    use redb::{Database, Durability, TableDefinition};
    use serde::Deserialize;

    use super::{album_hash, artist_hash, song_hash, C_ALBUM, C_ARTIST, C_SCROBBLE, C_SONG};
    use crate::error::{Result, SdkError};

    /// The single key→value table backing the whole index (keys are the
    /// NUL-separated byte strings below; values are at-uris or small metadata).
    const TABLE: TableDefinition<&[u8], &[u8]> = TableDefinition::new("index");

    fn db_err<E: core::fmt::Display>(e: E) -> SdkError {
        SdkError::Other(format!("dedup index: {e}"))
    }

    /// What a [`RepoIndex::index_car`] pass added.
    #[derive(Clone, Copy, Debug, Default)]
    pub struct IndexStats {
        pub artists: usize,
        pub albums: usize,
        pub songs: usize,
        pub scrobbles: usize,
    }

    impl IndexStats {
        /// Total records indexed in this pass.
        pub fn total(&self) -> usize {
            self.artists + self.albums + self.songs + self.scrobbles
        }
    }

    /// A local [redb](https://docs.rs/redb) mirror of the parts of a user's repo
    /// needed to prevent duplicate writes. Pure Rust (no libclang / C++), so it
    /// builds on every target. Shared behind an `Arc`; safe to keep across syncs.
    pub struct RepoIndex {
        db: Database,
    }

    // Key layout (NUL-separated so segments can't collide):
    //   "<did>\0<collection>\0<hash>"                -> at-uri   (song/album/artist)
    //   "<did>\0scrobble\0<song_hash>\0<unix_secs>"  -> at-uri   (scrobble)
    //   "\0rk\0<did>\0<collection>\0<rkey>"          -> primary key above (reverse, for deletes)
    //   "\0meta\0rev\0<did>"                          -> commit rev  (CAR incremental cursor)
    //   "\0meta\0cursor\0<did>"                       -> time_us     (jetstream cursor)
    const SEP: char = '\u{0}';

    fn ident_key(did: &str, collection: &str, hash: &str) -> Vec<u8> {
        format!("{did}{SEP}{collection}{SEP}{hash}").into_bytes()
    }

    fn scrobble_key(did: &str, song_hash: &str, unix_secs: i64) -> Vec<u8> {
        format!("{did}{SEP}scrobble{SEP}{song_hash}{SEP}{unix_secs}").into_bytes()
    }

    /// Reverse index: `rkey` -> the primary key above, so a delete event (which
    /// carries only the rkey, not the record) can find and drop the entry.
    fn rk_key(did: &str, collection: &str, rkey: &str) -> Vec<u8> {
        format!("{SEP}rk{SEP}{did}{SEP}{collection}{SEP}{rkey}").into_bytes()
    }

    fn rev_key(did: &str) -> Vec<u8> {
        format!("{SEP}meta{SEP}rev{SEP}{did}").into_bytes()
    }

    fn cursor_key(did: &str) -> Vec<u8> {
        format!("{SEP}meta{SEP}cursor{SEP}{did}").into_bytes()
    }

    /// The primary index key for a record, from field accessors. `None` when the
    /// record lacks the fields needed to identify it, or isn't a tracked type.
    fn primary_key_for<'a>(
        did: &str,
        collection: &str,
        field: impl Fn(&str) -> Option<&'a str>,
    ) -> Option<Vec<u8>> {
        match collection {
            C_ARTIST => field("name").map(|n| ident_key(did, C_ARTIST, &artist_hash(n))),
            C_ALBUM => match (field("title"), field("artist")) {
                (Some(t), Some(a)) => Some(ident_key(did, C_ALBUM, &album_hash(t, a))),
                _ => None,
            },
            C_SONG => match (field("title"), field("artist"), field("album")) {
                (Some(t), Some(a), Some(al)) => Some(ident_key(did, C_SONG, &song_hash(t, a, al))),
                _ => None,
            },
            C_SCROBBLE => match (
                field("title"),
                field("artist"),
                field("album"),
                field("createdAt"),
            ) {
                (Some(t), Some(a), Some(al), Some(c)) => {
                    rfc3339_secs(c).map(|s| scrobble_key(did, &song_hash(t, a, al), s))
                }
                _ => None,
            },
            _ => None,
        }
    }

    impl RepoIndex {
        /// Open (creating if needed) the index at `path`.
        pub fn open(path: impl AsRef<Path>) -> Result<Self> {
            let db = Database::create(path).map_err(db_err)?;
            // Create the table up front so read transactions never race a
            // not-yet-created table on a fresh index.
            let w = db.begin_write().map_err(db_err)?;
            w.open_table(TABLE).map_err(db_err)?;
            w.commit().map_err(db_err)?;
            Ok(Self { db })
        }

        /// Raw value for `key`, if present.
        fn get_bytes(&self, key: &[u8]) -> Result<Option<Vec<u8>>> {
            let r = self.db.begin_read().map_err(db_err)?;
            let t = r.open_table(TABLE).map_err(db_err)?;
            Ok(t.get(key).map_err(db_err)?.map(|v| v.value().to_vec()))
        }

        // ---- point lookups used on the write path (one get each) ----

        /// The at-uri of the caller's existing song with this identity, if any.
        pub fn song_uri(
            &self,
            did: &str,
            title: &str,
            artist: &str,
            album: &str,
        ) -> Result<Option<String>> {
            self.get_ident(did, C_SONG, &song_hash(title, artist, album))
        }

        /// The at-uri of the caller's existing album with this identity, if any.
        pub fn album_uri(
            &self,
            did: &str,
            album: &str,
            album_artist: &str,
        ) -> Result<Option<String>> {
            self.get_ident(did, C_ALBUM, &album_hash(album, album_artist))
        }

        /// The at-uri of the caller's existing artist with this identity, if any.
        pub fn artist_uri(&self, did: &str, album_artist: &str) -> Result<Option<String>> {
            self.get_ident(did, C_ARTIST, &artist_hash(album_artist))
        }

        /// The at-uri of an existing scrobble of this track at `unix_secs`, if any
        /// — the "no same scrobble at the same time" guard.
        pub fn scrobble_uri(
            &self,
            did: &str,
            title: &str,
            artist: &str,
            album: &str,
            unix_secs: i64,
        ) -> Result<Option<String>> {
            let key = scrobble_key(did, &song_hash(title, artist, album), unix_secs);
            self.get_str(&key)
        }

        fn get_ident(&self, did: &str, collection: &str, hash: &str) -> Result<Option<String>> {
            self.get_str(&ident_key(did, collection, hash))
        }

        fn get_str(&self, key: &[u8]) -> Result<Option<String>> {
            Ok(self
                .get_bytes(key)?
                .map(|v| String::from_utf8_lossy(&v).into_owned()))
        }

        // ---- index updates after a successful write ----

        pub(crate) fn record_song(
            &self,
            did: &str,
            title: &str,
            artist: &str,
            album: &str,
            uri: &str,
        ) -> Result<()> {
            self.put_primary(
                did,
                C_SONG,
                ident_key(did, C_SONG, &song_hash(title, artist, album)),
                uri,
            )
        }
        pub(crate) fn record_album(
            &self,
            did: &str,
            album: &str,
            album_artist: &str,
            uri: &str,
        ) -> Result<()> {
            self.put_primary(
                did,
                C_ALBUM,
                ident_key(did, C_ALBUM, &album_hash(album, album_artist)),
                uri,
            )
        }
        pub(crate) fn record_artist(&self, did: &str, album_artist: &str, uri: &str) -> Result<()> {
            self.put_primary(
                did,
                C_ARTIST,
                ident_key(did, C_ARTIST, &artist_hash(album_artist)),
                uri,
            )
        }
        pub(crate) fn record_scrobble(
            &self,
            did: &str,
            title: &str,
            artist: &str,
            album: &str,
            unix_secs: i64,
            uri: &str,
        ) -> Result<()> {
            self.put_primary(
                did,
                C_SCROBBLE,
                scrobble_key(did, &song_hash(title, artist, album), unix_secs),
                uri,
            )
        }

        /// Write a primary key -> uri mapping plus its reverse rkey mapping (rkey
        /// taken from the uri's last segment), so a later delete can find it.
        fn put_primary(
            &self,
            did: &str,
            collection: &str,
            primary: Vec<u8>,
            uri: &str,
        ) -> Result<()> {
            let w = self.db.begin_write().map_err(db_err)?;
            {
                let mut t = w.open_table(TABLE).map_err(db_err)?;
                if let Some(rkey) = uri.rsplit('/').next() {
                    t.insert(rk_key(did, collection, rkey).as_slice(), primary.as_slice())
                        .map_err(db_err)?;
                }
                t.insert(primary.as_slice(), uri.as_bytes()).map_err(db_err)?;
            }
            w.commit().map_err(db_err)
        }

        /// The last commit `rev` indexed for `did`, used as the `since` cursor for
        /// an incremental [`RepoIndex::index_car`].
        pub fn last_rev(&self, did: &str) -> Result<Option<String>> {
            self.get_str(&rev_key(did))
        }

        /// The last Jetstream `time_us` cursor processed for `did`, if any.
        pub fn cursor(&self, did: &str) -> Result<Option<i64>> {
            Ok(self
                .get_bytes(&cursor_key(did))?
                .and_then(|v| std::str::from_utf8(&v).ok().and_then(|s| s.parse().ok())))
        }

        /// Persist the Jetstream cursor for `did`. Non-durable — a lost cursor
        /// only costs a small, idempotent replay on restart.
        pub fn set_cursor(&self, did: &str, time_us: i64) -> Result<()> {
            let mut w = self.db.begin_write().map_err(db_err)?;
            w.set_durability(Durability::None);
            {
                let mut t = w.open_table(TABLE).map_err(db_err)?;
                t.insert(cursor_key(did).as_slice(), time_us.to_string().as_bytes())
                    .map_err(db_err)?;
            }
            w.commit().map_err(db_err)
        }

        /// Apply a single Jetstream commit event to the index. `create`/`update`
        /// upsert the record's identity (and its reverse rkey mapping); `delete`
        /// drops the entry via the reverse mapping. Records of untracked
        /// `app.rocksky.*` collections are ignored.
        pub fn apply_commit(
            &self,
            did: &str,
            collection: &str,
            operation: &str,
            rkey: &str,
            record: Option<&serde_json::Value>,
        ) -> Result<()> {
            match operation {
                "create" | "update" => {
                    let Some(rec) = record else { return Ok(()) };
                    let Some(primary) =
                        primary_key_for(did, collection, |k| rec.get(k).and_then(|v| v.as_str()))
                    else {
                        return Ok(());
                    };
                    let uri = format!("at://{did}/{collection}/{rkey}");
                    let w = self.db.begin_write().map_err(db_err)?;
                    {
                        let mut t = w.open_table(TABLE).map_err(db_err)?;
                        t.insert(rk_key(did, collection, rkey).as_slice(), primary.as_slice())
                            .map_err(db_err)?;
                        t.insert(primary.as_slice(), uri.as_bytes()).map_err(db_err)?;
                    }
                    w.commit().map_err(db_err)?;
                }
                "delete" => {
                    let rk = rk_key(did, collection, rkey);
                    if let Some(primary) = self.get_bytes(&rk)? {
                        let w = self.db.begin_write().map_err(db_err)?;
                        {
                            let mut t = w.open_table(TABLE).map_err(db_err)?;
                            t.remove(primary.as_slice()).map_err(db_err)?;
                            t.remove(rk.as_slice()).map_err(db_err)?;
                        }
                        w.commit().map_err(db_err)?;
                    }
                }
                _ => {}
            }
            Ok(())
        }

        /// Ingest a repo CAR (full or an incremental `since=` diff) for `did`,
        /// indexing every song/album/artist/scrobble it contains. Records are
        /// batched into a single write. Returns what was added.
        ///
        /// The MST walk tolerates missing CIDs, so a `since=` diff — which only
        /// carries the changed path plus new records — indexes exactly the new
        /// leaves without needing the untouched nodes.
        pub fn index_car(&self, did: &str, car: &[u8]) -> Result<IndexStats> {
            let (roots, blocks) = parse_car(car)?;
            let root = *roots.first().ok_or_else(|| db_err("CAR has no root"))?;
            let commit: Commit = blocks
                .get(&root)
                .ok_or_else(|| db_err("CAR missing commit block"))
                .and_then(|b| decode(b))?;

            // In-order MST walk collecting "<collection>/<rkey>" -> record CID.
            let mut leaves: Vec<(String, Cid)> = Vec::new();
            walk_mst(&blocks, &commit.data, &mut leaves);

            let mut stats = IndexStats::default();
            // The index is a rebuildable cache, so the bulk load is non-durable
            // (Durability::None) for speed; a single write transaction keeps it
            // atomic.
            let mut w = self.db.begin_write().map_err(db_err)?;
            w.set_durability(Durability::None);
            {
                let mut t = w.open_table(TABLE).map_err(db_err)?;
                for (path, value_cid) in &leaves {
                    let Some((collection, rkey)) = path.split_once('/') else {
                        continue;
                    };
                    if !matches!(collection, C_ARTIST | C_ALBUM | C_SONG | C_SCROBBLE) {
                        continue;
                    }
                    let Some(bytes) = blocks.get(value_cid) else {
                        continue;
                    };
                    let Ok(rec): core::result::Result<Ipld, _> = decode(bytes) else {
                        continue;
                    };
                    let Some(primary) = primary_key_for(did, collection, |k| str_field(&rec, k))
                    else {
                        continue;
                    };
                    let uri = format!("at://{did}/{collection}/{rkey}");
                    t.insert(rk_key(did, collection, rkey).as_slice(), primary.as_slice())
                        .map_err(db_err)?;
                    t.insert(primary.as_slice(), uri.as_bytes()).map_err(db_err)?;
                    match collection {
                        C_ARTIST => stats.artists += 1,
                        C_ALBUM => stats.albums += 1,
                        C_SONG => stats.songs += 1,
                        C_SCROBBLE => stats.scrobbles += 1,
                        _ => {}
                    }
                }

                // Advance the incremental cursor to this commit's rev.
                if let Some(rev) = &commit.rev {
                    t.insert(rev_key(did).as_slice(), rev.as_bytes())
                        .map_err(db_err)?;
                }
            }
            w.commit().map_err(db_err)?;
            Ok(stats)
        }
    }

    // ---- CAR v1 + MST parsing ------------------------------------------------

    /// The repo commit block (only the fields we need).
    #[derive(Deserialize)]
    struct Commit {
        data: Cid,
        #[serde(default)]
        rev: Option<String>,
    }

    /// An MST node: optional left subtree `l` and sorted entries `e`.
    #[derive(Deserialize)]
    struct MstNode {
        #[serde(default, rename = "l")]
        l: Option<Cid>,
        #[serde(rename = "e")]
        e: Vec<MstEntry>,
    }

    #[derive(Deserialize)]
    struct MstEntry {
        /// Bytes of the key shared with the previous entry (prefix compression).
        #[serde(rename = "p")]
        p: usize,
        /// The remainder of the key after the shared prefix.
        #[serde(rename = "k")]
        k: serde_bytes::ByteBuf,
        /// The record CID.
        #[serde(rename = "v")]
        v: Cid,
        /// Right subtree (keys between this entry and the next).
        #[serde(default, rename = "t")]
        t: Option<Cid>,
    }

    fn decode<T: for<'de> Deserialize<'de>>(bytes: &[u8]) -> Result<T> {
        serde_ipld_dagcbor::from_slice(bytes).map_err(db_err)
    }

    /// Read a single unsigned LEB128 varint from `cur`. Returns `None` at EOF.
    fn read_varint(cur: &mut std::io::Cursor<&[u8]>) -> Option<u64> {
        let mut result: u64 = 0;
        let mut shift = 0;
        loop {
            let mut byte = [0u8; 1];
            if cur.read_exact(&mut byte).is_err() {
                return None;
            }
            result |= ((byte[0] & 0x7f) as u64) << shift;
            if byte[0] & 0x80 == 0 {
                return Some(result);
            }
            shift += 7;
            if shift >= 64 {
                return None;
            }
        }
    }

    /// Roots plus a CID -> block-bytes map borrowed from the CAR buffer.
    type CarBlocks<'a> = (Vec<Cid>, HashMap<Cid, &'a [u8]>);

    /// Parse a CAR v1 buffer into (roots, CID -> block bytes). Block bytes are
    /// borrowed from `car` — no per-block copy.
    fn parse_car(car: &[u8]) -> Result<CarBlocks<'_>> {
        let mut cur = std::io::Cursor::new(car);

        let header_len = read_varint(&mut cur).ok_or_else(|| db_err("empty CAR"))? as usize;
        let hstart = cur.position() as usize;
        let hend = hstart + header_len;
        if hend > car.len() {
            return Err(db_err("truncated CAR header"));
        }
        let header: CarHeader = decode(&car[hstart..hend])?;
        cur.set_position(hend as u64);

        let mut blocks: HashMap<Cid, &[u8]> = HashMap::new();
        while let Some(len) = read_varint(&mut cur) {
            let start = cur.position() as usize;
            let end = start + len as usize;
            if end > car.len() {
                return Err(db_err("truncated CAR block"));
            }
            let section = &car[start..end];
            let mut sec = std::io::Cursor::new(section);
            let cid = Cid::read_bytes(&mut sec).map_err(db_err)?;
            let cid_len = sec.position() as usize;
            blocks.insert(cid, &section[cid_len..]);
            cur.set_position(end as u64);
        }
        Ok((header.roots, blocks))
    }

    #[derive(Deserialize)]
    struct CarHeader {
        roots: Vec<Cid>,
        #[allow(dead_code)]
        version: u64,
    }

    /// In-order MST traversal, reconstructing each leaf's full key. Skips any CID
    /// absent from `blocks` (an incremental diff omits unchanged subtrees).
    fn walk_mst(blocks: &HashMap<Cid, &[u8]>, cid: &Cid, out: &mut Vec<(String, Cid)>) {
        let Some(bytes) = blocks.get(cid) else {
            return;
        };
        let Ok(node): core::result::Result<MstNode, _> = decode(bytes) else {
            return;
        };
        if let Some(l) = &node.l {
            walk_mst(blocks, l, out);
        }
        let mut last: Vec<u8> = Vec::new();
        for e in &node.e {
            let prefix = last.get(..e.p).unwrap_or(&last);
            let mut key = prefix.to_vec();
            key.extend_from_slice(&e.k);
            if let Ok(s) = std::str::from_utf8(&key) {
                out.push((s.to_string(), e.v));
            }
            last = key;
            if let Some(t) = &e.t {
                walk_mst(blocks, t, out);
            }
        }
    }

    /// Read a string field from a decoded dag-cbor record map.
    fn str_field<'a>(rec: &'a Ipld, key: &str) -> Option<&'a str> {
        match rec {
            Ipld::Map(m) => match m.get(key) {
                Some(Ipld::String(s)) => Some(s.as_str()),
                _ => None,
            },
            _ => None,
        }
    }

    /// Parse an RFC 3339 timestamp to whole Unix seconds.
    fn rfc3339_secs(s: &str) -> Option<i64> {
        chrono::DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|dt| dt.timestamp())
    }
}
