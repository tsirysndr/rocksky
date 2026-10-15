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
	"net"
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

// Persistent cache for the public MusicBrainz API. Search results also seed
// recording lookups, reducing duplicate upstream requests.
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
	err := c.db.QueryRowContext(ctx, `SELECT body,status,expires_at FROM metadata_cache WHERE key=? AND stale_until>? AND quality>0`, key, time.Now().Unix()).Scan(&r.body, &r.status, &expiry)
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

const officialMusicBrainzURL = "https://musicbrainz.org/ws/2"

func officialUpstream(raw string) (string, error) {
	if raw != "" && strings.TrimRight(raw, "/") != officialMusicBrainzURL {
		return "", errors.New("MB_UPSTREAM_URL must be https://musicbrainz.org/ws/2")
	}
	return officialMusicBrainzURL, nil
}

func newMetadataClient(cache *metadataCache, baseURL string) *metadataClient {
	// This server's IPv6 path closes TLS handshakes. Keep DNS and certificate
	// verification intact, but use IPv4 for this client only. No forwarding proxy.
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	dialer := &net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}
	transport.DialContext = func(ctx context.Context, _ string, address string) (net.Conn, error) {
		return dialer.DialContext(ctx, "tcp4", address)
	}
	return &metadataClient{cache: cache, baseURL: strings.TrimRight(baseURL, "/"),
		http: &http.Client{Transport: transport, Timeout: 3 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}, limiter: rate.NewLimiter(rate.Every(time.Second), 1),
		waitBudget: 1100 * time.Millisecond, lookupBudget: 5 * time.Second, flights: make(map[string]*metadataFlight)}
}

// Reasons distinguish our own admission control from upstream failures.
type upstreamError struct {
	reason         string
	status         int
	upstreamStatus int
	retryAt        time.Time
	cause          error
}

func (e *upstreamError) Error() string {
	return fmt.Sprintf("%s upstream_status=%d: %v", e.reason, e.upstreamStatus, e.cause)
}
func (e *upstreamError) Unwrap() error { return e.cause }
func (e *upstreamError) retrySeconds() int {
	if e.retryAt.IsZero() {
		return 0
	}
	return max(1, int(time.Until(e.retryAt).Seconds()+0.999999))
}

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
			return stale(metadataResult{}, &upstreamError{reason: "local_capacity", status: 429, retryAt: time.Now().Add(time.Second)})
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
func (m *metadataClient) admission(ctx context.Context) error {
	m.mu.Lock()
	until := m.cooldown
	m.mu.Unlock()
	if time.Now().Before(until) {
		return &upstreamError{reason: "upstream_cooldown", status: 503, retryAt: until}
	}
	waiting, cancel := context.WithTimeout(ctx, m.waitBudget)
	defer cancel()
	if err := m.limiter.Wait(waiting); err != nil {
		return &upstreamError{reason: "local_rate_limit", status: 429, retryAt: time.Now().Add(time.Second), cause: err}
	}
	m.mu.Lock()
	until = m.cooldown
	m.mu.Unlock()
	if time.Now().Before(until) {
		return &upstreamError{reason: "upstream_cooldown", status: 503, retryAt: until}
	}
	return nil
}

func retryDelay(value string, now time.Time) time.Duration {
	if seconds, err := strconv.ParseInt(value, 10, 64); err == nil && seconds >= 0 {
		// Avoid duration overflow for malformed responses.
		if seconds > int64((time.Duration(1<<63-1))/time.Second) {
			return time.Duration(1<<63 - 1)
		}
		return time.Duration(seconds) * time.Second
	}
	if date, err := http.ParseTime(value); err == nil {
		if date.After(now) {
			return date.Sub(now)
		}
		return 0
	}
	return 5 * time.Second
}

// Follow same-origin redirects explicitly so every hop consumes the shared rate
// budget. The final URL identifies merged MBIDs without accepting unrelated IDs.
func (m *metadataClient) upstream(ctx context.Context, path string) ([]byte, int, string, error) {
	endpoint, err := url.Parse(m.baseURL + path)
	if err != nil {
		return nil, 0, "", err
	}
	origin := *endpoint
	for hop := 0; hop <= 5; hop++ {
		if err := m.admission(ctx); err != nil {
			return nil, 0, "", err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
		if err != nil {
			return nil, 0, "", err
		}
		req.Header.Set("User-Agent", "Rocksky/0.0.1 (https://rocksky.app)")
		resp, err := m.http.Do(req)
		if err != nil {
			m.pause(5 * time.Second)
			return nil, 0, "", &upstreamError{reason: "upstream_transport", status: 502, retryAt: time.Now().Add(5 * time.Second), cause: err}
		}
		status := resp.StatusCode
		if status == 301 || status == 302 || status == 303 || status == 307 || status == 308 {
			next, err := resp.Location()
			resp.Body.Close()
			if err != nil || next.Scheme != origin.Scheme || next.Host != origin.Host || next.User != nil || hop == 5 {
				return nil, status, "", &upstreamError{reason: "upstream_redirect", status: 502, upstreamStatus: status, cause: err}
			}
			// MusicBrainz merged-ID redirects can omit the original expansions.
			query := next.Query()
			for key, values := range endpoint.Query() {
				if _, exists := query[key]; !exists {
					query[key] = values
				}
			}
			next.RawQuery = query.Encode()
			endpoint = next
			continue
		}
		if status == 429 || status >= 500 {
			delay := retryDelay(resp.Header.Get("Retry-After"), time.Now())
			resp.Body.Close()
			m.pause(delay)
			clientStatus := 503
			if status == 429 {
				clientStatus = 429
			}
			return nil, status, "", &upstreamError{reason: "upstream_http", status: clientStatus, upstreamStatus: status, retryAt: time.Now().Add(delay)}
		}
		if status != 200 && status != 404 {
			resp.Body.Close()
			return nil, status, "", &upstreamError{reason: "upstream_http", status: 502, upstreamStatus: status}
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024+1))
		resp.Body.Close()
		if err != nil {
			m.pause(5 * time.Second)
			return nil, status, "", &upstreamError{reason: "upstream_transport", status: 502, retryAt: time.Now().Add(5 * time.Second), cause: err}
		}
		if len(body) > 8*1024*1024 {
			return nil, status, "", errors.New("MusicBrainz response too large")
		}
		return body, status, endpoint.Path, nil
	}
	panic("unreachable")
}
func (m *metadataClient) save(ctx context.Context, key string, r metadataResult, quality int, ttl time.Duration) {
	if err := m.cache.put(ctx, key, r, quality, ttl); err != nil {
		log.Printf("metadata cache write failed: %v", err)
	}
}
func validRecording(rec musicbrainz.MusicBrainzRecording) bool {
	return validMBID(rec.ID) && rec.Title != "" && len(rec.ArtistCredit) > 0
}
func (m *metadataClient) recording(ctx context.Context, id string) (metadataResult, error) {
	return m.lookup(ctx, "recording:"+id, func(work context.Context) (metadataResult, error) {
		body, status, finalPath, err := m.upstream(work, "/recording/"+url.PathEscape(id)+"?inc=artists+releases+isrcs&fmt=json")
		if err != nil {
			return metadataResult{}, err
		}
		if status == 404 {
			r := metadataResult{[]byte(`{"error":"recording not found"}`), 404, "musicbrainz-api"}
			m.save(work, "recording:"+id, r, 2, 5*time.Minute)
			return r, nil
		}
		var rec musicbrainz.MusicBrainzRecording
		canonicalID := finalPath[strings.LastIndex(finalPath, "/")+1:]
		if err := json.Unmarshal(body, &rec); err != nil || !validRecording(rec) || !strings.EqualFold(rec.ID, canonicalID) {
			return metadataResult{}, errors.New("invalid MusicBrainz recording response")
		}
		body, err = json.Marshal(rec)
		if err != nil {
			return metadataResult{}, err
		}
		r := metadataResult{body, 200, "musicbrainz-api"}
		m.save(work, "recording:"+id, r, 2, m.cache.ttl)
		if !strings.EqualFold(id, rec.ID) {
			m.save(work, "recording:"+strings.ToLower(rec.ID), r, 2, m.cache.ttl)
		}
		return r, nil
	})
}
func (m *metadataClient) search(ctx context.Context, p musicbrainz.SearchParams) (metadataResult, error) {
	encoded, _ := json.Marshal(p)
	// Separate from earlier local-first searches, whose cached data may be partial.
	key := fmt.Sprintf("search:upstream:%x", sha256.Sum256(encoded))
	return m.lookup(ctx, key, func(work context.Context) (metadataResult, error) {
		parts := []string{}
		escape := func(s string) string { return strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) }
		for _, part := range []struct{ k, v string }{{"recording", p.Track}, {"artist", p.Artist}, {"release", p.Release}} {
			if part.v != "" {
				parts = append(parts, fmt.Sprintf(`%s:"%s"`, part.k, escape(part.v)))
			}
		}
		if len(parts) == 0 {
			return metadataResult{}, errors.New("empty MusicBrainz query")
		}
		body, status, _, err := m.upstream(work, "/recording?query="+url.QueryEscape(strings.Join(parts, " AND "))+"&fmt=json&inc=artists+releases+isrcs")
		if err != nil {
			return metadataResult{}, err
		}
		if status != 200 {
			return metadataResult{}, errors.New("unexpected MusicBrainz search status")
		}
		var response musicbrainz.MusicBrainzSearchResponse
		if err = json.Unmarshal(body, &response); err != nil || response.Recordings == nil {
			return metadataResult{}, errors.New("invalid MusicBrainz search response")
		}
		for _, rec := range response.Recordings {
			if !validRecording(rec) {
				return metadataResult{}, errors.New("invalid MusicBrainz search recording")
			}
		}
		for _, rec := range response.Recordings {
			body, _ := json.Marshal(rec)
			m.save(work, "recording:"+strings.ToLower(rec.ID), metadataResult{body, 200, "musicbrainz-api"}, 1, m.cache.ttl)
		}
		body, err = json.Marshal(response.Recordings)
		if err != nil {
			return metadataResult{}, err
		}
		r := metadataResult{body, 200, "musicbrainz-api"}
		ttl := time.Hour
		if len(response.Recordings) == 0 {
			ttl = 5 * time.Minute
		}
		m.save(work, key, r, 1, ttl)
		return r, nil
	})
}
