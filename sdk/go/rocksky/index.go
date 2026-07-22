package rocksky

import (
	"bytes"
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/bluesky-social/indigo/repo"
	"github.com/ipfs/go-cid"
	ipldcbor "github.com/ipfs/go-ipld-cbor"
	bolt "go.etcd.io/bbolt"
)

// Index is a local duplicate-prevention mirror of a user's repo, keyed by
// Rocksky's identity hashes. It lets the write verbs skip records that already
// exist. Built from the repo CAR by [Agent.SyncRepo] and kept live by
// [Agent.HydrateFromJetstream]. Backed by an embedded bbolt KV (pure Go — no
// RocksDB/cgo needed for a hash→uri map).
type Index struct {
	db *bolt.DB
}

// IndexStats reports what an index pass added.
type IndexStats struct {
	Artists, Albums, Songs, Scrobbles int
}

// Total is the sum of all indexed records.
func (s IndexStats) Total() int { return s.Artists + s.Albums + s.Songs + s.Scrobbles }

const sep = "\x00"

var (
	bktIdx  = []byte("idx")  // did\0collection\0hash  ->  at-uri  (+ scrobble: \0secs)
	bktRk   = []byte("rk")   // did\0collection\0rkey   ->  the idx key above (for deletes)
	bktMeta = []byte("meta") // rev\0did, cursor\0did
)

// OpenIndex opens (creating if needed) the dedup index at path.
func OpenIndex(path string) (*Index, error) {
	db, err := bolt.Open(path, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, err
	}
	err = db.Update(func(tx *bolt.Tx) error {
		for _, b := range [][]byte{bktIdx, bktRk, bktMeta} {
			if _, err := tx.CreateBucketIfNotExists(b); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Index{db: db}, nil
}

// Close closes the underlying database.
func (i *Index) Close() error { return i.db.Close() }

func identKey(did, col, hash string) []byte { return []byte(did + sep + col + sep + hash) }
func scrobbleKey(did, songHash string, secs int64) []byte {
	return []byte(did + sep + colScrobble + sep + songHash + sep + strconv.FormatInt(secs, 10))
}

func (i *Index) getStr(key []byte) (string, error) {
	var v string
	err := i.db.View(func(tx *bolt.Tx) error {
		if b := tx.Bucket(bktIdx).Get(key); b != nil {
			v = string(b)
		}
		return nil
	})
	return v, err
}

// SongURI returns the caller's existing song URI for this identity, or "".
func (i *Index) SongURI(did, title, artist, album string) (string, error) {
	return i.getStr(identKey(did, colSong, SongHash(title, artist, album)))
}

// AlbumURI returns the caller's existing album URI for this identity, or "".
func (i *Index) AlbumURI(did, album, albumArtist string) (string, error) {
	return i.getStr(identKey(did, colAlbum, AlbumHash(album, albumArtist)))
}

// ArtistURI returns the caller's existing artist URI for this identity, or "".
func (i *Index) ArtistURI(did, albumArtist string) (string, error) {
	return i.getStr(identKey(did, colArtist, ArtistHash(albumArtist)))
}

// ScrobbleURI returns an existing scrobble of this track at unixSecs, or "" —
// the "no same scrobble at the same time" guard.
func (i *Index) ScrobbleURI(did, title, artist, album string, unixSecs int64) (string, error) {
	return i.getStr(scrobbleKey(did, SongHash(title, artist, album), unixSecs))
}

// putPrimary writes a primary key -> uri plus its reverse rkey mapping.
func (i *Index) putPrimary(did, col string, primary []byte, uri string) error {
	rkey := uri[strings.LastIndex(uri, "/")+1:]
	return i.db.Update(func(tx *bolt.Tx) error {
		if err := tx.Bucket(bktIdx).Put(primary, []byte(uri)); err != nil {
			return err
		}
		return tx.Bucket(bktRk).Put([]byte(did+sep+col+sep+rkey), primary)
	})
}

func (i *Index) recordSong(did, title, artist, album, uri string) error {
	return i.putPrimary(did, colSong, identKey(did, colSong, SongHash(title, artist, album)), uri)
}
func (i *Index) recordAlbum(did, album, albumArtist, uri string) error {
	return i.putPrimary(did, colAlbum, identKey(did, colAlbum, AlbumHash(album, albumArtist)), uri)
}
func (i *Index) recordArtist(did, albumArtist, uri string) error {
	return i.putPrimary(did, colArtist, identKey(did, colArtist, ArtistHash(albumArtist)), uri)
}
func (i *Index) recordScrobble(did, title, artist, album string, secs int64, uri string) error {
	return i.putPrimary(did, colScrobble, scrobbleKey(did, SongHash(title, artist, album), secs), uri)
}

// LastRev returns the last commit rev indexed for did (metadata for callers).
func (i *Index) LastRev(did string) (string, error) {
	var v string
	err := i.db.View(func(tx *bolt.Tx) error {
		if b := tx.Bucket(bktMeta).Get([]byte("rev" + sep + did)); b != nil {
			v = string(b)
		}
		return nil
	})
	return v, err
}

// Cursor returns the last Jetstream time_us cursor processed for did.
func (i *Index) Cursor(did string) (int64, error) {
	var v int64
	err := i.db.View(func(tx *bolt.Tx) error {
		if b := tx.Bucket(bktMeta).Get([]byte("cursor" + sep + did)); b != nil {
			v, _ = strconv.ParseInt(string(b), 10, 64)
		}
		return nil
	})
	return v, err
}

// SetCursor persists the Jetstream cursor for did.
func (i *Index) SetCursor(did string, timeUS int64) error {
	return i.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bktMeta).Put([]byte("cursor"+sep+did), []byte(strconv.FormatInt(timeUS, 10)))
	})
}

func tracked(col string) bool {
	switch col {
	case colArtist, colAlbum, colSong, colScrobble:
		return true
	}
	return false
}

func str(m map[string]interface{}, key string) string {
	s, _ := m[key].(string)
	return s
}

func rfc3339Secs(s string) (int64, bool) {
	for _, layout := range []string{"2006-01-02T15:04:05.000Z07:00", time.RFC3339, time.RFC3339Nano} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Unix(), true
		}
	}
	return 0, false
}

// primaryFor computes the idx key for a decoded record, or (nil,false) if it
// lacks the identifying fields or isn't a tracked collection.
func primaryFor(did, col string, m map[string]interface{}) ([]byte, bool) {
	switch col {
	case colArtist:
		if name := str(m, "name"); name != "" {
			return identKey(did, colArtist, ArtistHash(name)), true
		}
	case colAlbum:
		if t, a := str(m, "title"), str(m, "artist"); t != "" && a != "" {
			return identKey(did, colAlbum, AlbumHash(t, a)), true
		}
	case colSong:
		if t, a, al := str(m, "title"), str(m, "artist"), str(m, "album"); t != "" && a != "" && al != "" {
			return identKey(did, colSong, SongHash(t, a, al)), true
		}
	case colScrobble:
		t, a, al, c := str(m, "title"), str(m, "artist"), str(m, "album"), str(m, "createdAt")
		if t != "" && a != "" && al != "" && c != "" {
			if secs, ok := rfc3339Secs(c); ok {
				return scrobbleKey(did, SongHash(t, a, al), secs), true
			}
		}
	}
	return nil, false
}

// IndexCAR ingests a full repo CAR for did, indexing every song/album/artist/
// scrobble it contains. Returns what was added.
func (i *Index) IndexCAR(ctx context.Context, did string, car []byte) (IndexStats, error) {
	r, err := repo.ReadRepoFromCar(ctx, bytes.NewReader(car))
	if err != nil {
		return IndexStats{}, err
	}
	var stats IndexStats
	err = i.db.Update(func(tx *bolt.Tx) error {
		bkt := tx.Bucket(bktIdx)
		rk := tx.Bucket(bktRk)
		walkErr := r.ForEach(ctx, "", func(k string, _ cid.Cid) error {
			col, rkey, ok := strings.Cut(k, "/")
			if !ok || !tracked(col) {
				return nil
			}
			_, recB, err := r.GetRecordBytes(ctx, k)
			if err != nil || recB == nil {
				return nil
			}
			var m map[string]interface{}
			if err := ipldcbor.DecodeInto(*recB, &m); err != nil {
				return nil
			}
			primary, ok := primaryFor(did, col, m)
			if !ok {
				return nil
			}
			uri := "at://" + did + "/" + col + "/" + rkey
			if err := bkt.Put(primary, []byte(uri)); err != nil {
				return err
			}
			if err := rk.Put([]byte(did+sep+col+sep+rkey), primary); err != nil {
				return err
			}
			switch col {
			case colArtist:
				stats.Artists++
			case colAlbum:
				stats.Albums++
			case colSong:
				stats.Songs++
			case colScrobble:
				stats.Scrobbles++
			}
			return nil
		})
		if walkErr != nil {
			return walkErr
		}
		rev := r.SignedCommit().Rev
		return tx.Bucket(bktMeta).Put([]byte("rev"+sep+did), []byte(rev))
	})
	return stats, err
}

// applyCommit applies a single Jetstream commit event to the index.
func (i *Index) applyCommit(did, col, operation, rkey string, record map[string]interface{}) error {
	switch operation {
	case "create", "update":
		if record == nil {
			return nil
		}
		primary, ok := primaryFor(did, col, record)
		if !ok {
			return nil
		}
		uri := "at://" + did + "/" + col + "/" + rkey
		return i.db.Update(func(tx *bolt.Tx) error {
			if err := tx.Bucket(bktIdx).Put(primary, []byte(uri)); err != nil {
				return err
			}
			return tx.Bucket(bktRk).Put([]byte(did+sep+col+sep+rkey), primary)
		})
	case "delete":
		return i.db.Update(func(tx *bolt.Tx) error {
			rk := tx.Bucket(bktRk)
			key := []byte(did + sep + col + sep + rkey)
			if primary := rk.Get(key); primary != nil {
				if err := tx.Bucket(bktIdx).Delete(primary); err != nil {
					return err
				}
				return rk.Delete(key)
			}
			return nil
		})
	}
	return nil
}
