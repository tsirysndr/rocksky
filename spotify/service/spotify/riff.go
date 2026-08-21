package spotify

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Catalog reads are answered by riff — the local Spotify-API-shaped service
// backed by our Parquet dump — before Spotify is considered at all.
//
// riff runs on loopback, so these calls take **no rate limiter slot, no
// cooldown and no cache entry**. That is the entire point: the catalog
// endpoints are the bulk of what we ask Spotify for, and serving them locally
// means the quota is left for the requests that genuinely need Spotify.
//
// Spotify is only reached when riff produces no results, and that fallback
// still goes through the normal rate-limited, cached path.

const (
	// defaultRiffURL is where riff listens by default. Loopback is deliberate:
	// this must never become a remote call that reintroduces network latency
	// and failure modes into every catalog lookup.
	defaultRiffURL = "http://127.0.0.1:8092/v1"

	// riffTimeout bounds a riff lookup. Exceeding it is treated as "no
	// results", so a wedged riff costs one timeout and then falls back rather
	// than failing the request.
	defaultRiffTimeout = 10 * time.Second

	// maxRiffBody caps how much we read from riff. A single Spotify catalog
	// response is orders of magnitude below this.
	maxRiffBody = 8 << 20

	// riffLogInterval throttles "riff is unreachable" logging: if riff is down,
	// every catalog request would otherwise log a line.
	riffLogInterval = 30 * time.Second
)

// riffClient is a minimal HTTP client for the local riff instance.
type riffClient struct {
	baseURL string
	http    *http.Client
	logger  *log.Logger

	mu         sync.Mutex
	lastLogged time.Time
}

func newRiffClient(baseURL string, logger *log.Logger) *riffClient {
	baseURL = strings.TrimRight(baseURL, "/")
	if baseURL == "" {
		return nil
	}
	return &riffClient{
		baseURL: baseURL,
		http:    &http.Client{Timeout: envDuration("RIFF_TIMEOUT", defaultRiffTimeout)},
		logger:  logger,
	}
}

// riffCanServe reports whether riff implements the endpoint behind a GET path.
//
// The list is explicit rather than a prefix match on /artists, /albums and
// /tracks: riff does not implement every sub-resource (related-artists, for
// one), and sending it a path it cannot answer would spend a local round trip
// to learn what we already know.
func riffCanServe(path string) bool {
	if i := strings.IndexByte(path, '?'); i >= 0 {
		path = path[:i]
	}
	if path == "/search" {
		return true
	}

	seg := strings.Split(strings.Trim(path, "/"), "/")
	switch seg[0] {
	case "artists":
		// /artists, /artists/{id}, /artists/{id}/albums, /artists/{id}/top-tracks
		switch len(seg) {
		case 1, 2:
			return true
		case 3:
			return seg[2] == "albums" || seg[2] == "top-tracks"
		}
	case "albums":
		// /albums, /albums/{id}, /albums/{id}/tracks
		switch len(seg) {
		case 1, 2:
			return true
		case 3:
			return seg[2] == "tracks"
		}
	case "tracks":
		// /tracks, /tracks/{id}
		return len(seg) <= 2
	}
	return false
}

// get asks riff for a path. The second return is false whenever Spotify should
// be tried instead — riff unreachable, a non-200, or a well-formed response
// that simply contains nothing.
func (r *riffClient) get(ctx context.Context, path string) (*ProxyResult, bool) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.baseURL+path, nil)
	if err != nil {
		return nil, false
	}

	res, err := r.http.Do(req)
	if err != nil {
		// riff being down must never take the proxy down with it; Spotify is
		// still there.
		r.warn("unreachable, falling back to spotify: %v", err)
		return nil, false
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		// 404 is the common case here and is not an error: riff simply does not
		// have that object, so Spotify gets a turn.
		io.Copy(io.Discard, io.LimitReader(res.Body, maxRiffBody))
		return nil, false
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, maxRiffBody))
	if err != nil {
		r.warn("could not read response: %v", err)
		return nil, false
	}
	if !riffHasResults(body) {
		return nil, false
	}

	contentType := res.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	return &ProxyResult{
		Status:      http.StatusOK,
		ContentType: contentType,
		Body:        body,
		Source:      SourceRiff,
	}, true
}

func (r *riffClient) warn(format string, args ...any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if time.Since(r.lastLogged) < riffLogInterval {
		return
	}
	r.lastLogged = time.Now()
	r.logger.Printf("riff "+format, args...)
}

// riffHasResults reports whether a 200 from riff actually carries data.
//
// An empty answer is not good enough to stop at: riff mirrors a dump that lags
// Spotify, so a brand-new release is exactly the case where we do want to spend
// a Spotify call. The shapes checked mirror the Web API:
//
//	{"id": "..."}                       a single object
//	{"items": [...]}                    a paging object
//	{"tracks": {"items": [...]}}        search
//	{"artists": [null, {...}]}          a batch ?ids= lookup
//	{"tracks": [...]}                   top-tracks
func riffHasResults(body []byte) bool {
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(body, &doc); err != nil {
		return false
	}

	// A single object: 200 with a non-empty id means riff found it.
	if raw, ok := doc["id"]; ok {
		var id string
		return json.Unmarshal(raw, &id) == nil && id != ""
	}

	if raw, ok := doc["items"]; ok {
		return hasNonNullElement(raw)
	}

	for _, key := range []string{"tracks", "artists", "albums", "audio_features"} {
		raw, ok := doc[key]
		if !ok {
			continue
		}
		// Batch and top-tracks form: a bare array. Entries of a ?ids= lookup are
		// null for ids riff does not have, so nulls alone do not count.
		if hasNonNullElement(raw) {
			return true
		}
		// Search form: a paging object.
		var page struct {
			Items []json.RawMessage `json:"items"`
		}
		if err := json.Unmarshal(raw, &page); err == nil && len(page.Items) > 0 {
			return true
		}
	}
	return false
}

// hasNonNullElement reports whether raw is a JSON array with at least one
// non-null element. A non-array yields false.
func hasNonNullElement(raw json.RawMessage) bool {
	var list []json.RawMessage
	if err := json.Unmarshal(raw, &list); err != nil {
		return false
	}
	for _, item := range list {
		if string(item) != "null" {
			return true
		}
	}
	return false
}

// riffURLFromEnv resolves where riff lives. Setting RIFF_URL to an empty string
// disables riff entirely and sends every request straight to Spotify.
func riffURLFromEnv() string {
	if v, ok := os.LookupEnv("RIFF_URL"); ok {
		return v
	}
	return defaultRiffURL
}
