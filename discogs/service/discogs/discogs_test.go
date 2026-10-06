package discogs

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// --- Mock Discogs API --------------------------------------------------------

// These payloads mirror the shape of the real Discogs API for "Get Lucky" on a
// reissue of Daft Punk's Random Access Memories.

const searchResponseJSON = `{
  "pagination": { "page": 1, "pages": 1, "per_page": 10, "items": 2 },
  "results": [
    {
      "id": 4570366,
      "master_id": 525058,
      "type": "release",
      "title": "Daft Punk - Random Access Memories",
      "year": "2013",
      "country": "Europe",
      "catno": "88883716861",
      "barcode": ["888837168618"],
      "format": ["Vinyl", "2xLP", "Album"],
      "label": ["Columbia", "Daft Life Ltd."],
      "genre": ["Electronic"],
      "style": ["Disco", "Synth-pop"],
      "thumb": "https://i.discogs.com/thumb.jpeg",
      "cover_image": "https://i.discogs.com/cover.jpeg",
      "uri": "/Daft-Punk-Random-Access-Memories/release/4570366",
      "resource_url": "https://api.discogs.com/releases/4570366",
      "community": { "have": 30000, "want": 12000 }
    },
    {
      "id": 999999,
      "type": "release",
      "title": "Daft Punk - Random Access Memories",
      "year": 2013,
      "format": ["Vinyl", "2xLP", "Promo", "Test Pressing"],
      "label": ["Columbia"],
      "uri": "/release/999999",
      "community": { "have": 12, "want": 400 }
    }
  ]
}`

const releaseResponseJSON = `{
  "id": 4570366,
  "title": "Random Access Memories",
  "year": 2021,
  "released": "2021-02-19",
  "country": "Europe",
  "uri": "https://www.discogs.com/release/4570366",
  "master_id": 525058,
  "artists": [{ "id": 1289, "name": "Daft Punk", "join": "" }],
  "labels": [{ "id": 1866, "name": "Columbia", "catno": "88883716861" }],
  "formats": [
    { "name": "Vinyl", "qty": "2", "descriptions": ["LP", "Album", "Reissue"] }
  ],
  "genres": ["Electronic"],
  "styles": ["Disco", "Synth-pop"],
  "identifiers": [
    { "type": "Barcode", "value": "888837168618", "description": "Printed" },
    { "type": "Matrix / Runout", "value": "88883716861-A" }
  ],
  "images": [
    { "type": "secondary", "uri": "https://i.discogs.com/back.jpeg" },
    { "type": "primary", "uri": "https://i.discogs.com/primary.jpeg" }
  ],
  "tracklist": [
    { "position": "A1", "type_": "track", "title": "Give Life Back To Music", "duration": "4:35" },
    { "position": "", "type_": "heading", "title": "Side C" },
    { "position": "C2", "type_": "track", "title": "Get Lucky", "duration": "6:09",
      "artists": [{ "id": 1289, "name": "Daft Punk", "join": "Feat." },
                  { "id": 141, "name": "Pharrell Williams", "join": "" }] }
  ],
  "community": { "have": 30000, "want": 12000 }
}`

const masterResponseJSON = `{
  "id": 525058,
  "title": "Random Access Memories",
  "year": 2013,
  "main_release": 4570366,
  "uri": "https://www.discogs.com/master/525058",
  "genres": ["Electronic"]
}`

const emptySearchJSON = `{ "pagination": { "items": 0 }, "results": [] }`

type mockDiscogs struct {
	server      *httptest.Server
	searchHits  int64
	releaseHits int64
	masterHits  int64
	searchBody  string
	mu          sync.Mutex
	lastQuery   url.Values
	lastUA      string
	lastAuth    string
}

func newMockDiscogs() *mockDiscogs {
	m := &mockDiscogs{searchBody: searchResponseJSON}
	mux := http.NewServeMux()

	mux.HandleFunc("/database/search", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&m.searchHits, 1)
		m.record(r)
		writeJSON(w, m.searchBody)
	})
	mux.HandleFunc("/releases/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&m.releaseHits, 1)
		m.record(r)
		writeJSON(w, releaseResponseJSON)
	})
	mux.HandleFunc("/masters/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&m.masterHits, 1)
		m.record(r)
		writeJSON(w, masterResponseJSON)
	})

	m.server = httptest.NewServer(mux)
	return m
}

func (m *mockDiscogs) record(r *http.Request) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastQuery = r.URL.Query()
	m.lastUA = r.Header.Get("User-Agent")
	m.lastAuth = r.Header.Get("Authorization")
}

func (m *mockDiscogs) headers() (ua, auth string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastUA, m.lastAuth
}

func (m *mockDiscogs) query() url.Values {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastQuery
}

func writeJSON(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Discogs-Ratelimit", "60")
	w.Header().Set("X-Discogs-Ratelimit-Used", "3")
	w.Header().Set("X-Discogs-Ratelimit-Remaining", "57")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}

func (m *mockDiscogs) close() { m.server.Close() }

func newTestService(t *testing.T, baseURL string, opts ...Option) *DiscogsService {
	t.Helper()
	base := []Option{
		WithBaseURL(baseURL),
		WithToken("test-token"),
		WithLimiter(NewWindowLimiter(1_000_000, time.Nanosecond)),
	}
	svc, err := NewDiscogsService(append(base, opts...)...)
	if err != nil {
		t.Fatalf("NewDiscogsService: %v", err)
	}
	return svc
}

// --- Tests -------------------------------------------------------------------

func TestMissingTokenIsFatal(t *testing.T) {
	t.Setenv("DISCOGS_TOKEN", "")
	if _, err := NewDiscogsService(); !errors.Is(err, ErrMissingToken) {
		t.Fatalf("expected ErrMissingToken without a token, got %v", err)
	}
	t.Setenv("DISCOGS_TOKEN", "from-env")
	svc, err := NewDiscogsService()
	if err != nil {
		t.Fatalf("expected the token to be read from the environment: %v", err)
	}
	if svc.token != "from-env" {
		t.Fatalf("token not read from DISCOGS_TOKEN: %q", svc.token)
	}
}

// Discogs rejects requests that do not identify themselves, and the token
// travels in an Authorization header of its own form.
func TestRequestsCarryUserAgentAndToken(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL)

	if _, err := svc.Search(context.Background(), SearchParams{Title: "Get Lucky", Artist: "Daft Punk"}); err != nil {
		t.Fatalf("Search error: %v", err)
	}

	ua, auth := m.headers()
	if ua != userAgent || strings.Contains(strings.ToLower(ua), "go-http-client") {
		t.Fatalf("unexpected User-Agent: %q", ua)
	}
	if auth != "Discogs token=test-token" {
		t.Fatalf("unexpected Authorization: %q", auth)
	}
}

func TestSearchUsesFieldedQuery(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL)

	results, err := svc.Search(context.Background(), SearchParams{
		Title:  "Get Lucky",
		Artist: "Daft Punk feat. Pharrell Williams",
		Album:  "Random Access Memories",
	})
	if err != nil {
		t.Fatalf("Search error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	q := m.query()
	if q.Get("track") != "Get Lucky" {
		t.Errorf("track param: %q", q.Get("track"))
	}
	// Only the primary artist: combined credits rarely match Discogs.
	if q.Get("artist") != "Daft Punk" {
		t.Errorf("artist param: %q", q.Get("artist"))
	}
	if q.Get("release_title") != "Random Access Memories" {
		t.Errorf("release_title param: %q", q.Get("release_title"))
	}
	if q.Get("type") != "release" {
		t.Errorf("type param: %q", q.Get("type"))
	}
}

func TestSearchRequiresInput(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL)

	if _, err := svc.Search(context.Background(), SearchParams{}); err == nil {
		t.Fatal("expected error for empty search params")
	}
}

func TestSearchCaching(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL)

	params := SearchParams{Title: "Get Lucky", Artist: "Daft Punk"}
	for i := range 3 {
		if _, err := svc.Search(context.Background(), params); err != nil {
			t.Fatalf("Search #%d error: %v", i, err)
		}
	}
	if got := atomic.LoadInt64(&m.searchHits); got != 1 {
		t.Fatalf("expected 1 upstream search hit (cached), got %d", got)
	}
}

func TestCacheTTLExpiry(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL, WithCacheTTL(20*time.Millisecond))

	params := SearchParams{Title: "Get Lucky", Artist: "Daft Punk"}
	if _, err := svc.Search(context.Background(), params); err != nil {
		t.Fatal(err)
	}
	time.Sleep(40 * time.Millisecond)
	if _, err := svc.Search(context.Background(), params); err != nil {
		t.Fatal(err)
	}
	if got := atomic.LoadInt64(&m.searchHits); got != 2 {
		t.Fatalf("expected 2 upstream hits after TTL expiry, got %d", got)
	}
}

func TestEnrichFillsAllMetadata(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL)

	resp, err := svc.Enrich(context.Background(), SearchParams{
		Title:  "Get Lucky",
		Artist: "Daft Punk",
		Album:  "Random Access Memories",
	})
	if err != nil {
		t.Fatalf("Enrich error: %v", err)
	}
	if resp.Track == nil {
		t.Fatal("expected an enriched track")
	}
	tr := resp.Track

	if tr.Title != "Get Lucky" {
		t.Errorf("title not taken from the tracklist: %q", tr.Title)
	}
	if tr.Album != "Random Access Memories" {
		t.Errorf("album: %q", tr.Album)
	}
	if tr.Artist != "Daft Punk Feat. Pharrell Williams" {
		t.Errorf("track credit not joined: %q", tr.Artist)
	}
	if tr.AlbumArtist != "Daft Punk" {
		t.Errorf("album artist: %q", tr.AlbumArtist)
	}
	// "C2" is side C, track 2 — the second disc of a 2xLP.
	if tr.TrackPosition != "C2" || tr.DiscNumber != 2 || tr.TrackNumber != 2 {
		t.Errorf("position not parsed: pos=%q disc=%d track=%d", tr.TrackPosition, tr.DiscNumber, tr.TrackNumber)
	}
	if tr.DurationMs != 369000 {
		t.Errorf("expected 6:09 as 369000ms, got %d", tr.DurationMs)
	}
	if tr.Label != "Columbia" || tr.CatalogNumber != "88883716861" {
		t.Errorf("label/catno: %q / %q", tr.Label, tr.CatalogNumber)
	}
	if tr.Barcode != "888837168618" {
		t.Errorf("barcode not read from identifiers: %q", tr.Barcode)
	}
	if tr.Country != "Europe" {
		t.Errorf("country: %q", tr.Country)
	}
	if tr.ReleaseDate != "2021-02-19" || tr.Year != 2021 {
		t.Errorf("release date/year: %q / %d", tr.ReleaseDate, tr.Year)
	}
	// The pressing is a reissue, so the master supplies the original year.
	if tr.OriginalYear != 2013 {
		t.Errorf("original year not taken from the master: %d", tr.OriginalYear)
	}
	if len(tr.Genres) != 1 || tr.Genres[0] != "Electronic" {
		t.Errorf("genres: %+v", tr.Genres)
	}
	if len(tr.Styles) != 2 {
		t.Errorf("styles: %+v", tr.Styles)
	}
	if len(tr.Formats) != 1 || !strings.Contains(tr.Formats[0], "Vinyl") {
		t.Errorf("formats: %+v", tr.Formats)
	}
	if tr.AlbumArt != "https://i.discogs.com/primary.jpeg" {
		t.Errorf("expected the primary image, got %q", tr.AlbumArt)
	}
	if tr.DiscogsReleaseID != 4570366 || tr.DiscogsMasterID != 525058 || tr.DiscogsArtistID != 1289 {
		t.Errorf("discogs ids: %+v", tr)
	}
	if tr.DiscogsURL == "" {
		t.Error("discogs url not set")
	}
}

// One enrichment is a search plus a release fetch, plus the master only when
// the pressing is a reissue. At 60 requests a minute that budget is the point.
func TestEnrichCostsThreeUpstreamCalls(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL)

	if _, err := svc.Enrich(context.Background(), SearchParams{
		Title: "Get Lucky", Artist: "Daft Punk", Album: "Random Access Memories",
	}); err != nil {
		t.Fatalf("Enrich error: %v", err)
	}

	if got := atomic.LoadInt64(&m.searchHits); got != 1 {
		t.Errorf("expected 1 search, got %d", got)
	}
	if got := atomic.LoadInt64(&m.releaseHits); got != 1 {
		t.Errorf("expected 1 release fetch, got %d", got)
	}
	if got := atomic.LoadInt64(&m.masterHits); got != 1 {
		t.Errorf("expected 1 master fetch, got %d", got)
	}
}

func TestEnrichReturnsRankedMatches(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL)

	resp, err := svc.Enrich(context.Background(), SearchParams{
		Title: "Get Lucky", Artist: "Daft Punk", Album: "Random Access Memories",
	})
	if err != nil {
		t.Fatalf("Enrich error: %v", err)
	}

	if len(resp.Matches) != 2 {
		t.Fatalf("expected 2 matches, got %d", len(resp.Matches))
	}
	// The catalogued album edition must outrank the promo test pressing.
	if resp.Matches[0].ID != 4570366 {
		t.Errorf("expected the album edition first, got id=%d", resp.Matches[0].ID)
	}
	if resp.Matches[0].Score <= resp.Matches[1].Score {
		t.Errorf("matches not sorted by score: %v <= %v", resp.Matches[0].Score, resp.Matches[1].Score)
	}
	if resp.Matches[0].Score < 0.9 {
		t.Errorf("expected a high score for the exact match, got %v", resp.Matches[0].Score)
	}
	best := resp.Matches[0]
	if best.Artist != "Daft Punk" || best.Album != "Random Access Memories" {
		t.Errorf("match title not split: artist=%q album=%q", best.Artist, best.Album)
	}
	if best.Year != 2013 || best.Label != "Columbia" || best.CatalogNumber != "88883716861" {
		t.Errorf("match fields: %+v", best)
	}
	if !strings.HasPrefix(best.URL, "https://www.discogs.com/") {
		t.Errorf("match url not absolute: %q", best.URL)
	}
	// A second result given as a JSON number, not a string, still parses.
	if resp.Matches[1].Year != 2013 {
		t.Errorf("numeric year not parsed: %d", resp.Matches[1].Year)
	}
}

func TestEnrichNoResults(t *testing.T) {
	m := newMockDiscogs()
	m.searchBody = emptySearchJSON
	defer m.close()
	svc := newTestService(t, m.server.URL)

	resp, err := svc.Enrich(context.Background(), SearchParams{Title: "zzzzz", Artist: "nobody"})
	if err != nil {
		t.Fatalf("Enrich error: %v", err)
	}
	if resp.Track != nil {
		t.Errorf("expected nil track for no results, got %+v", resp.Track)
	}
	if len(resp.Matches) != 0 {
		t.Errorf("expected no matches, got %d", len(resp.Matches))
	}
}

func TestSearchFallsBackToLooseQuery(t *testing.T) {
	var calls int64
	var looseQ string
	mux := http.NewServeMux()
	mux.HandleFunc("/database/search", func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt64(&calls, 1) == 1 {
			writeJSON(w, emptySearchJSON)
			return
		}
		looseQ = r.URL.Query().Get("q")
		writeJSON(w, searchResponseJSON)
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	svc := newTestService(t, server.URL)

	results, err := svc.Search(context.Background(), SearchParams{Title: "Get Lucky", Artist: "Daft Punk"})
	if err != nil {
		t.Fatalf("Search error: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected the loose-query fallback to return results")
	}
	if atomic.LoadInt64(&calls) != 2 {
		t.Fatalf("expected 2 search calls (fielded + loose), got %d", calls)
	}
	if !strings.Contains(looseQ, "Get Lucky") || !strings.Contains(looseQ, "Daft Punk") {
		t.Errorf("unexpected loose query: %q", looseQ)
	}
}

func TestRateLimitHeadersAreObserved(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL)

	if _, err := svc.Search(context.Background(), SearchParams{Title: "Get Lucky"}); err != nil {
		t.Fatalf("Search error: %v", err)
	}
	quota := svc.RateLimit()
	if quota.Limit != 60 || quota.Used != 3 || quota.Remaining != 57 {
		t.Fatalf("quota not read from headers: %+v", quota)
	}
	if quota.ObservedAt.IsZero() {
		t.Error("quota observation time not set")
	}
}

// A 404 is Discogs answering, so it must be reported as 404 and must not count
// toward the breaker.
func TestNotFoundIsAnsweredNotFailed(t *testing.T) {
	var calls int64
	mux := http.NewServeMux()
	mux.HandleFunc("/releases/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&calls, 1)
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"Release not found."}`))
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	svc := newTestService(t, server.URL)

	for i := range 8 {
		_, err := svc.GetRelease(context.Background(), int64(1000+i))
		var upstream *UpstreamError
		if !errors.As(err, &upstream) || upstream.Status != http.StatusNotFound {
			t.Fatalf("lookup #%d: expected a 404 UpstreamError, got %v", i, err)
		}
		if !strings.Contains(upstream.Message, "Release not found.") {
			t.Errorf("discogs message not surfaced: %q", upstream.Message)
		}
	}
	if got := atomic.LoadInt64(&calls); got != 8 {
		t.Fatalf("404s should not open the breaker, got %d of 8 calls through", got)
	}
	if cooldown := svc.Cooldown(); cooldown != 0 {
		t.Fatalf("breaker opened on 404s, cooling down for %v", cooldown)
	}
}

func TestUpstreamFailureIsNegativelyCached(t *testing.T) {
	var calls int64
	mux := http.NewServeMux()
	mux.HandleFunc("/database/search", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&calls, 1)
		w.WriteHeader(http.StatusInternalServerError)
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	svc := newTestService(t, server.URL)

	params := SearchParams{Title: "Tokka", Artist: "Agnes Obel"}
	for i := range 5 {
		if _, err := svc.Search(context.Background(), params); err == nil {
			t.Fatalf("Search #%d should have failed", i)
		}
	}
	if got := atomic.LoadInt64(&calls); got != 1 {
		t.Fatalf("expected the failing query to be asked once, got %d upstream calls", got)
	}
}

func TestBreakerStopsCallingRefusingUpstream(t *testing.T) {
	var calls int64
	mux := http.NewServeMux()
	mux.HandleFunc("/database/search", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&calls, 1)
		w.WriteHeader(http.StatusUnauthorized)
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	svc := newTestService(t, server.URL)

	var last error
	for i := range 12 {
		_, last = svc.Search(context.Background(), SearchParams{Title: fmt.Sprintf("song %d", i)})
	}

	if got := atomic.LoadInt64(&calls); got != breakerThreshold {
		t.Fatalf("expected the breaker to stop calls after %d failures, got %d", breakerThreshold, got)
	}
	var upstream *UpstreamError
	if !errors.As(last, &upstream) || upstream.Status != http.StatusServiceUnavailable {
		t.Fatalf("expected a 503 once the breaker is open, got %v", last)
	}
	if upstream.RetryAfter <= 0 {
		t.Fatal("an open breaker should tell the caller when to come back")
	}
}

func TestUpstreamStatusIsReported(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/database/search", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "7")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"message":"You are making requests too quickly."}`))
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	svc := newTestService(t, server.URL)

	_, err := svc.Search(context.Background(), SearchParams{Title: "Tokka", Artist: "Agnes Obel"})
	var upstream *UpstreamError
	if !errors.As(err, &upstream) {
		t.Fatalf("expected an UpstreamError, got %v", err)
	}
	if upstream.Upstream != http.StatusTooManyRequests {
		t.Fatalf("upstream status not reported, got %d", upstream.Upstream)
	}
	if upstream.RetryAfter != 7*time.Second {
		t.Fatalf("Retry-After not honored, got %v", upstream.RetryAfter)
	}
}

func TestConcurrentIdenticalSearchesCollapse(t *testing.T) {
	release := make(chan struct{})
	var calls int64
	mux := http.NewServeMux()
	mux.HandleFunc("/database/search", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&calls, 1)
		<-release
		writeJSON(w, searchResponseJSON)
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	svc := newTestService(t, server.URL)

	params := SearchParams{Title: "Get Lucky", Artist: "Daft Punk"}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := svc.Search(context.Background(), params); err != nil {
				t.Errorf("Search error: %v", err)
			}
		}()
	}

	time.Sleep(50 * time.Millisecond)
	close(release)
	wg.Wait()

	if got := atomic.LoadInt64(&calls); got != 1 {
		t.Fatalf("expected 8 concurrent identical searches to cost 1 upstream call, got %d", got)
	}
}

func TestRateLimiterSpacesRequests(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()

	window := 100 * time.Millisecond
	svc := newTestService(t, m.server.URL, WithLimiter(NewWindowLimiter(2, window)))

	start := time.Now()
	for i := range 3 {
		if _, err := svc.GetRelease(context.Background(), int64(1000+i)); err != nil {
			t.Fatalf("GetRelease error: %v", err)
		}
	}
	if elapsed := time.Since(start); elapsed < window {
		t.Fatalf("expected the 3rd request to wait a full window (%v), elapsed=%v", window, elapsed)
	}
}

func TestWindowLimiterNeverExceedsQuotaInAnyWindow(t *testing.T) {
	const (
		n      = 5
		window = 60 * time.Millisecond
		sends  = 30
	)
	limiter := NewWindowLimiter(n, window)
	deadline := time.Now().Add(10 * time.Second)

	sent := make([]time.Time, 0, sends)
	for range sends {
		if err := limiter.Wait(context.Background(), deadline); err != nil {
			t.Fatalf("Wait returned error: %v", err)
		}
		sent = append(sent, time.Now())
	}

	for i, at := range sent {
		count := 1
		for j := i - 1; j >= 0 && at.Sub(sent[j]) < window; j-- {
			count++
		}
		if count > n {
			t.Fatalf("send %d: %d requests inside one %v window, quota is %d", i, count, window, n)
		}
	}
}

func TestWindowLimiterRejectsPastDeadline(t *testing.T) {
	limiter := NewWindowLimiter(1, time.Hour)
	now := time.Now()

	if _, ok := limiter.reserve(now, now.Add(time.Second)); !ok {
		t.Fatal("first reservation should be admitted immediately")
	}
	if _, ok := limiter.reserve(now, now.Add(time.Second)); ok {
		t.Fatal("second reservation should not fit before its deadline")
	}
	wait, ok := limiter.reserve(now, now.Add(2*time.Hour))
	if !ok {
		t.Fatal("a caller with a long enough deadline should be admitted")
	}
	if wait < time.Hour-time.Second {
		t.Fatalf("expected to wait ~1h for the window to roll, got %v", wait)
	}
}

func TestWaitReturnsQueueFullPastDeadline(t *testing.T) {
	limiter := NewWindowLimiter(1, time.Hour)
	if err := limiter.Wait(context.Background(), time.Now().Add(time.Second)); err != nil {
		t.Fatalf("first Wait should be admitted: %v", err)
	}
	if err := limiter.Wait(context.Background(), time.Now().Add(time.Second)); !errors.Is(err, errQueueFull) {
		t.Fatalf("expected errQueueFull, got %v", err)
	}
}

func TestNormalize(t *testing.T) {
	cases := map[string]string{
		"Beyoncé":                 "beyonce",
		"  Guns N' Roses  ":       "guns n roses",
		"Song - Radio Edit":       "song",
		"Café del Mar (Explicit)": "cafe del mar",
	}
	for in, want := range cases {
		if got := normalize(in); got != want {
			t.Errorf("normalize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSplitResultTitleAndDisambiguator(t *testing.T) {
	artist, album := splitResultTitle("Daft Punk (2) - Random Access Memories")
	if stripDisambiguator(artist) != "Daft Punk" || album != "Random Access Memories" {
		t.Fatalf("split: artist=%q album=%q", artist, album)
	}
	if _, album := splitResultTitle("Untitled"); album != "Untitled" {
		t.Fatalf("a title with no separator is the album: %q", album)
	}
}

func TestParsePosition(t *testing.T) {
	cases := []struct {
		pos         string
		disc, track int
	}{
		{"7", 0, 7},
		{"2-04", 2, 4},
		{"1.3", 1, 3},
		{"A1", 1, 1},
		{"B2", 1, 2},
		{"C2", 2, 2},
		{"D1", 2, 1},
		{"", 0, 0},
		{"Video", 0, 0},
	}
	for _, c := range cases {
		disc, track := parsePosition(c.pos)
		if disc != c.disc || track != c.track {
			t.Errorf("parsePosition(%q) = (%d,%d), want (%d,%d)", c.pos, disc, track, c.disc, c.track)
		}
	}
}

func TestParseDuration(t *testing.T) {
	cases := map[string]int64{
		"6:09":    369000,
		"4:35":    275000,
		"1:02:03": 3723000,
		"":        0,
		"nope":    0,
	}
	for in, want := range cases {
		if got := parseDuration(in); got != want {
			t.Errorf("parseDuration(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestScoreCandidateRanking(t *testing.T) {
	params := SearchParams{Title: "Get Lucky", Artist: "Daft Punk", Album: "Random Access Memories"}
	album := SearchResult{
		Title: "Daft Punk - Random Access Memories", MasterID: 525058,
		Format: []string{"Vinyl", "2xLP", "Album"},
	}
	promo := SearchResult{
		Title:  "Daft Punk - Random Access Memories",
		Format: []string{"Vinyl", "Promo", "Test Pressing"},
	}
	wrong := SearchResult{Title: "Other Band - Something Else"}

	if scoreCandidate(params, album) <= scoreCandidate(params, promo) {
		t.Error("a catalogued album edition should outscore a promo test pressing")
	}
	if scoreCandidate(params, album) <= scoreCandidate(params, wrong) {
		t.Error("the exact match should outscore an unrelated release")
	}
	if s := scoreCandidate(params, album); s < 0.95 {
		t.Errorf("expected a near-perfect score for the exact match, got %v", s)
	}
}

func TestServiceUsesConfiguredBaseURL(t *testing.T) {
	m := newMockDiscogs()
	defer m.close()
	svc := newTestService(t, m.server.URL)
	if !strings.HasPrefix(svc.baseURL, "http://127.0.0.1") {
		t.Fatalf("service base URL not pointed at the mock: %s", svc.baseURL)
	}
}
