package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/teal-fm/piper/service/musicbrainz"
	"golang.org/x/time/rate"
)

// This is a persistent overlay for the read-only riff-mb catalog. Search
// results seed recording lookups too, including recordings absent from the dump.
type metadataCache struct {
	db  *sql.DB
	ttl time.Duration
}
type metadataResult struct {
	body   []byte
	status int
	source string
}
type cachedMetadata struct {
	metadataResult
	fresh bool
}

func openMetadataCache(path string, ttl time.Duration) (*metadataCache, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	dsn := (&url.URL{Scheme: "file", Path: absolute}).String() + "?_journal_mode=WAL&_busy_timeout=1000&_synchronous=FULL"
	database, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	database.SetMaxOpenConns(4)
	_, err = database.Exec(`CREATE TABLE IF NOT EXISTS metadata_cache (
 key TEXT PRIMARY KEY, body BLOB NOT NULL, status INTEGER NOT NULL,
 quality INTEGER NOT NULL, expires_at INTEGER NOT NULL, stale_until INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS metadata_cache_expiry ON metadata_cache(stale_until);`)
	if err != nil {
		database.Close()
		return nil, err
	}
	return &metadataCache{database, ttl}, nil
}
func (c *metadataCache) get(ctx context.Context, key string) (*cachedMetadata, error) {
	var r cachedMetadata
	var expiry int64
	err := c.db.QueryRowContext(ctx, `SELECT body,status,expires_at FROM metadata_cache WHERE key=? AND stale_until>?`, key, time.Now().Unix()).Scan(&r.body, &r.status, &expiry)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.fresh = expiry > time.Now().Unix()
	r.source = "cache"
	return &r, nil
}
func (c *metadataCache) put(ctx context.Context, key string, r metadataResult, quality int, ttl time.Duration) error {
	now := time.Now()
	stale := now.Add(ttl)
	if r.status == 200 && string(r.body) != "[]" {
		stale = stale.Add(7 * 24 * time.Hour)
	}
	_, err := c.db.ExecContext(ctx, `INSERT INTO metadata_cache(key,body,status,quality,expires_at,stale_until) VALUES(?,?,?,?,?,?)
 ON CONFLICT(key) DO UPDATE SET body=excluded.body,status=excluded.status,quality=excluded.quality,expires_at=excluded.expires_at,stale_until=excluded.stale_until
 WHERE metadata_cache.quality<=excluded.quality OR (metadata_cache.status=404 AND excluded.status=200) OR metadata_cache.expires_at<=?`, key, r.body, r.status, quality, now.Add(ttl).Unix(), stale.Unix(), now.Unix())
	return err
}
func (c *metadataCache) cleanup(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_, err := c.db.ExecContext(ctx, `DELETE FROM metadata_cache WHERE key IN (SELECT key FROM metadata_cache WHERE stale_until<=? ORDER BY stale_until LIMIT 500)`, time.Now().Unix())
			if err != nil && ctx.Err() == nil {
				log.Printf("metadata cache cleanup failed: %v", err)
			}
		}
	}
}

type metadataFlight struct {
	done   chan struct{}
	result metadataResult
	err    error
}
type metadataClient struct {
	cache        *metadataCache
	http         *http.Client
	baseURL      string
	limiter      *rate.Limiter
	waitBudget   time.Duration
	lookupBudget time.Duration
	mu           sync.Mutex
	flights      map[string]*metadataFlight
	cooldown     time.Time
}

func newMetadataClient(cache *metadataCache, baseURL string) *metadataClient {
	return &metadataClient{cache: cache, baseURL: strings.TrimRight(baseURL, "/"),
		http: &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}, limiter: rate.NewLimiter(rate.Every(time.Second), 1),
		waitBudget: 250 * time.Millisecond, lookupBudget: 5 * time.Second, flights: make(map[string]*metadataFlight)}
}

var errUpstreamBusy = errors.New("MusicBrainz fallback temporarily unavailable")

// One bounded operation per key. A disconnected caller does not cancel work
// that other callers need, but the shared operation always has its own deadline.
func (m *metadataClient) lookup(ctx context.Context, key string, fetch func(context.Context) (metadataResult, error)) (metadataResult, error) {
	if err := ctx.Err(); err != nil {
		return metadataResult{}, err
	}
	cached, err := m.cache.get(ctx, key)
	if err != nil {
		log.Printf("metadata cache read failed: %v", err)
	}
	if cached != nil && cached.fresh {
		return cached.metadataResult, nil
	}
	stale := func(r metadataResult, e error) (metadataResult, error) {
		if e != nil && cached != nil && cached.status == 200 {
			cached.source = "stale-cache"
			return cached.metadataResult, nil
		}
		return r, e
	}
	m.mu.Lock()
	f, exists := m.flights[key]
	if !exists {
		if len(m.flights) >= 32 {
			m.mu.Unlock()
			return stale(metadataResult{}, errUpstreamBusy)
		}
		f = &metadataFlight{done: make(chan struct{})}
		m.flights[key] = f
		go func() {
			work, cancel := context.WithTimeout(context.WithoutCancel(ctx), m.lookupBudget)
			defer cancel()
			// Another flight may have populated a recording from a search meanwhile.
			if hit, e := m.cache.get(work, key); e == nil && hit != nil && hit.fresh {
				f.result = hit.metadataResult
			} else {
				f.result, f.err = fetch(work)
			}
			m.mu.Lock()
			delete(m.flights, key)
			close(f.done)
			m.mu.Unlock()
		}()
	}
	m.mu.Unlock()
	select {
	case <-ctx.Done():
		return metadataResult{}, ctx.Err()
	case <-f.done:
		return stale(f.result, f.err)
	}
}
func (m *metadataClient) pause(d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	until := time.Now().Add(d)
	if until.After(m.cooldown) {
		m.cooldown = until
	}
}
func (m *metadataClient) upstream(ctx context.Context, path string) ([]byte, int, error) {
	m.mu.Lock()
	cooling := time.Now().Before(m.cooldown)
	m.mu.Unlock()
	if cooling {
		return nil, 0, errUpstreamBusy
	}
	waiting, cancel := context.WithTimeout(ctx, m.waitBudget)
	err := m.limiter.Wait(waiting)
	cancel()
	if err != nil {
		return nil, 0, errUpstreamBusy
	}
	// A request ahead of us may have started an upstream cooldown.
	m.mu.Lock()
	cooling = time.Now().Before(m.cooldown)
	m.mu.Unlock()
	if cooling {
		return nil, 0, errUpstreamBusy
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, m.baseURL+path, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", "Rocksky/0.0.1 (https://rocksky.app)")
	resp, err := m.http.Do(req)
	if err != nil {
		m.pause(5 * time.Second)
		return nil, 0, fmt.Errorf("MusicBrainz transport failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 429 || resp.StatusCode >= 500 {
		delay := 5 * time.Second
		if seconds, e := strconv.Atoi(resp.Header.Get("Retry-After")); e == nil && seconds > 0 {
			delay = time.Duration(seconds) * time.Second
		} else if date, e := http.ParseTime(resp.Header.Get("Retry-After")); e == nil && time.Until(date) > delay {
			delay = time.Until(date)
		}
		m.pause(delay)
		return nil, resp.StatusCode, errUpstreamBusy
	}
	if resp.StatusCode != 200 && resp.StatusCode != 404 {
		return nil, resp.StatusCode, fmt.Errorf("MusicBrainz returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024+1))
	if err != nil {
		return nil, 0, err
	}
	if len(body) > 8*1024*1024 {
		return nil, 0, errors.New("MusicBrainz response too large")
	}
	return body, resp.StatusCode, nil
}
func (m *metadataClient) save(ctx context.Context, key string, r metadataResult, quality int, ttl time.Duration) {
	if err := m.cache.put(ctx, key, r, quality, ttl); err != nil {
		log.Printf("metadata cache write failed: %v", err)
	}
}
func validRecording(rec musicbrainz.MusicBrainzRecording) bool {
	return validMBID(rec.ID) && rec.Title != "" && len(rec.ArtistCredit) > 0
}
func (m *metadataClient) recording(ctx context.Context, id string, local func(context.Context) (*musicbrainz.MusicBrainzRecording, error)) (metadataResult, error) {
	return m.lookup(ctx, "recording:"+id, func(work context.Context) (metadataResult, error) {
		rec, err := local(work)
		source := "riff-mb"
		quality := 0
		if err != nil || rec == nil || !validRecording(*rec) || !strings.EqualFold(rec.ID, id) {
			source = "musicbrainz-api"
			quality = 2
			body, status, e := m.upstream(work, "/recording/"+url.PathEscape(id)+"?inc=artists+releases+isrcs&fmt=json")
			if e != nil {
				return metadataResult{}, e
			}
			if status == 404 {
				r := metadataResult{[]byte(`{"error":"recording not found"}`), 404, source}
				m.save(work, "recording:"+id, r, 2, 5*time.Minute)
				return r, nil
			}
			rec = &musicbrainz.MusicBrainzRecording{}
			if e = json.Unmarshal(body, rec); e != nil || !validRecording(*rec) || !strings.EqualFold(rec.ID, id) {
				return metadataResult{}, errors.New("invalid MusicBrainz recording response")
			}
		}
		body, err := json.Marshal(rec)
		if err != nil {
			return metadataResult{}, err
		}
		r := metadataResult{body, 200, source}
		m.save(work, "recording:"+id, r, quality, m.cache.ttl)
		return r, nil
	})
}
func (m *metadataClient) search(ctx context.Context, p musicbrainz.SearchParams, local func(context.Context) ([]musicbrainz.MusicBrainzRecording, error)) (metadataResult, error) {
	encoded, _ := json.Marshal(p)
	key := fmt.Sprintf("search:%x", sha256.Sum256(encoded))
	return m.lookup(ctx, key, func(work context.Context) (metadataResult, error) {
		recs, err := local(work)
		source := "riff-mb"
		if err != nil || len(recs) == 0 {
			source = "musicbrainz-api"
			parts := []string{}
			escape := func(s string) string { return strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) }
			for _, p := range []struct{ k, v string }{{"recording", p.Track}, {"artist", p.Artist}, {"release", p.Release}} {
				if p.v != "" {
					parts = append(parts, fmt.Sprintf(`%s:"%s"`, p.k, escape(p.v)))
				}
			}
			if len(parts) == 0 {
				return metadataResult{}, errors.New("empty MusicBrainz query")
			}
			body, status, e := m.upstream(work, "/recording?query="+url.QueryEscape(strings.Join(parts, " AND "))+"&fmt=json&inc=artists+releases+isrcs")
			if e != nil {
				return metadataResult{}, e
			}
			if status != 200 {
				return metadataResult{}, errors.New("unexpected MusicBrainz search status")
			}
			var response musicbrainz.MusicBrainzSearchResponse
			if e = json.Unmarshal(body, &response); e != nil || response.Recordings == nil {
				return metadataResult{}, errors.New("invalid MusicBrainz search response")
			}
			recs = response.Recordings
		}
		if recs == nil {
			recs = []musicbrainz.MusicBrainzRecording{}
		}
		for _, rec := range recs {
			if !validRecording(rec) {
				return metadataResult{}, errors.New("invalid MusicBrainz search recording")
			}
		}
		for _, rec := range recs {
			// Local search documents omit release expansions; let the indexed
			// recording lookup attach them instead of caching a partial result.
			if source == "riff-mb" {
				continue
			}
			body, _ := json.Marshal(rec)
			quality := 0
			if source == "musicbrainz-api" {
				quality = 1
			}
			m.save(work, "recording:"+strings.ToLower(rec.ID), metadataResult{body, 200, source}, quality, m.cache.ttl)
		}
		body, err := json.Marshal(recs)
		if err != nil {
			return metadataResult{}, err
		}
		r := metadataResult{body, 200, source}
		ttl := time.Hour
		if len(recs) == 0 {
			ttl = 5 * time.Minute
		}
		m.save(work, key, r, 1, ttl)
		return r, nil
	})
}
