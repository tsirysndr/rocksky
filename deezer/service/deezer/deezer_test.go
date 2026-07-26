package deezer

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/time/rate"
)

// --- Mock Deezer API ---------------------------------------------------------

// These payloads mirror the shape of the real Deezer API
// (https://api.deezer.com) for the track "Get Lucky" by Daft Punk.

const searchResponseJSON = `{
  "data": [
    {
      "id": 67238735,
      "title": "Get Lucky",
      "title_short": "Get Lucky",
      "title_version": "",
      "link": "https://www.deezer.com/track/67238735",
      "duration": 369,
      "rank": 812000,
      "explicit_lyrics": false,
      "preview": "https://cdns-preview-a.dzcdn.net/stream/get-lucky.mp3",
      "artist": {
        "id": 27,
        "name": "Daft Punk",
        "link": "https://www.deezer.com/artist/27",
        "picture_medium": "https://api.deezer.com/artist/27/image?size=medium",
        "picture_xl": "https://api.deezer.com/artist/27/image?size=xl"
      },
      "album": {
        "id": 6575789,
        "title": "Random Access Memories",
        "cover": "https://api.deezer.com/album/6575789/image",
        "cover_medium": "https://api.deezer.com/album/6575789/image?size=medium",
        "cover_xl": "https://api.deezer.com/album/6575789/image?size=xl",
        "tracklist": "https://api.deezer.com/album/6575789/tracks"
      },
      "type": "track"
    },
    {
      "id": 999999,
      "title": "Get Lucky (Live)",
      "title_short": "Get Lucky",
      "link": "https://www.deezer.com/track/999999",
      "duration": 380,
      "rank": 120000,
      "explicit_lyrics": false,
      "artist": { "id": 5555, "name": "Tribute Band", "link": "" },
      "album": { "id": 8888, "title": "Live Covers", "cover_medium": "https://api.deezer.com/album/8888/image" },
      "type": "track"
    }
  ],
  "total": 2
}`

const trackResponseJSON = `{
  "id": 67238735,
  "title": "Get Lucky",
  "title_short": "Get Lucky",
  "isrc": "GBDUW1300109",
  "link": "https://www.deezer.com/track/67238735",
  "duration": 369,
  "rank": 812000,
  "track_position": 8,
  "disk_number": 1,
  "release_date": "2013-05-17",
  "explicit_lyrics": false,
  "preview": "https://cdns-preview-a.dzcdn.net/stream/get-lucky.mp3",
  "bpm": 116.1,
  "gain": -8.9,
  "contributors": [
    { "id": 27, "name": "Daft Punk" },
    { "id": 141, "name": "Pharrell Williams" }
  ],
  "artist": {
    "id": 27,
    "name": "Daft Punk",
    "picture_xl": "https://api.deezer.com/artist/27/image?size=xl"
  },
  "album": {
    "id": 6575789,
    "title": "Random Access Memories",
    "cover_xl": "https://api.deezer.com/album/6575789/image?size=xl",
    "release_date": "2013-05-17"
  }
}`

const albumResponseJSON = `{
  "id": 6575789,
  "title": "Random Access Memories",
  "upc": "888837168526",
  "link": "https://www.deezer.com/album/6575789",
  "cover_xl": "https://api.deezer.com/album/6575789/image?size=xl",
  "release_date": "2013-05-17",
  "label": "Columbia",
  "nb_tracks": 13,
  "genres": {
    "data": [
      { "id": 113, "name": "Dance" },
      { "id": 152, "name": "Rock" }
    ]
  }
}`

const artistResponseJSON = `{
  "id": 27,
  "name": "Daft Punk",
  "picture_xl": "https://api.deezer.com/artist/27/image?size=xl"
}`

const emptySearchJSON = `{ "data": [], "total": 0 }`

const quotaErrorJSON = `{ "error": { "type": "Exception", "message": "Quota limit exceeded", "code": 4 } }`

// mockDeezer spins up an httptest server that mimics the real Deezer API and
// records how many times each endpoint was hit.
type mockDeezer struct {
	server      *httptest.Server
	searchHits  int64
	trackHits   int64
	albumHits   int64
	artistHits  int64
	searchBody  string // override for the /search response
	lastSearchQ string
}

func newMockDeezer() *mockDeezer {
	m := &mockDeezer{searchBody: searchResponseJSON}
	mux := http.NewServeMux()

	mux.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&m.searchHits, 1)
		m.lastSearchQ = r.URL.Query().Get("q")
		writeJSON(w, m.searchBody)
	})
	mux.HandleFunc("/track/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&m.trackHits, 1)
		writeJSON(w, trackResponseJSON)
	})
	mux.HandleFunc("/album/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&m.albumHits, 1)
		writeJSON(w, albumResponseJSON)
	})
	mux.HandleFunc("/artist/", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&m.artistHits, 1)
		writeJSON(w, artistResponseJSON)
	})

	m.server = httptest.NewServer(mux)
	return m
}

func writeJSON(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}

func (m *mockDeezer) close() { m.server.Close() }

// newTestService returns a service pointed at the mock with throttling
// effectively disabled (huge burst) so unit tests stay fast.
func newTestService(m *mockDeezer, opts ...Option) *DeezerService {
	base := []Option{
		WithBaseURL(m.server.URL),
		WithLimiter(rate.NewLimiter(rate.Inf, 1)),
	}
	return NewDeezerService(append(base, opts...)...)
}

// --- Tests -------------------------------------------------------------------

func TestSearch(t *testing.T) {
	m := newMockDeezer()
	defer m.close()
	svc := newTestService(m)

	tracks, err := svc.Search(context.Background(), SearchParams{Title: "Get Lucky", Artist: "Daft Punk"})
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if len(tracks) != 2 {
		t.Fatalf("expected 2 tracks, got %d", len(tracks))
	}
	if tracks[0].Title != "Get Lucky" || tracks[0].Artist.Name != "Daft Punk" {
		t.Fatalf("unexpected first track: %+v", tracks[0])
	}

	// The advanced query should carry track: and artist: operators.
	if !strings.Contains(m.lastSearchQ, `track:"Get Lucky"`) ||
		!strings.Contains(m.lastSearchQ, `artist:"Daft Punk"`) {
		t.Fatalf("unexpected search query: %q", m.lastSearchQ)
	}
}

func TestSearchRequiresInput(t *testing.T) {
	m := newMockDeezer()
	defer m.close()
	svc := newTestService(m)

	if _, err := svc.Search(context.Background(), SearchParams{}); err == nil {
		t.Fatal("expected error for empty search params")
	}
}

func TestSearchCaching(t *testing.T) {
	m := newMockDeezer()
	defer m.close()
	svc := newTestService(m)

	params := SearchParams{Title: "Get Lucky", Artist: "Daft Punk"}
	for i := 0; i < 3; i++ {
		if _, err := svc.Search(context.Background(), params); err != nil {
			t.Fatalf("Search #%d error: %v", i, err)
		}
	}
	if got := atomic.LoadInt64(&m.searchHits); got != 1 {
		t.Fatalf("expected 1 upstream search hit (cached), got %d", got)
	}
}

func TestCacheTTLExpiry(t *testing.T) {
	m := newMockDeezer()
	defer m.close()
	svc := newTestService(m, WithCacheTTL(20*time.Millisecond))

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
	m := newMockDeezer()
	defer m.close()
	svc := newTestService(m)

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

	// From the full track endpoint.
	if tr.ISRC != "GBDUW1300109" {
		t.Errorf("ISRC not filled from full track: %q", tr.ISRC)
	}
	if tr.DurationMs != 369000 {
		t.Errorf("expected duration 369000ms, got %d", tr.DurationMs)
	}
	if tr.TrackNumber != 8 || tr.DiscNumber != 1 {
		t.Errorf("track/disc position not filled: track=%d disc=%d", tr.TrackNumber, tr.DiscNumber)
	}
	if tr.ReleaseDate != "2013-05-17" || tr.Year != 2013 {
		t.Errorf("release date/year not filled: %q / %d", tr.ReleaseDate, tr.Year)
	}
	// From the full album endpoint.
	if tr.Label != "Columbia" {
		t.Errorf("label not filled from album: %q", tr.Label)
	}
	if tr.UPC != "888837168526" {
		t.Errorf("UPC not filled from album: %q", tr.UPC)
	}
	if len(tr.Genres) != 2 || tr.Genres[0] != "Dance" {
		t.Errorf("genres not filled from album: %+v", tr.Genres)
	}
	// Highest-res assets preferred.
	if !strings.Contains(tr.AlbumArt, "size=xl") {
		t.Errorf("expected XL album art, got %q", tr.AlbumArt)
	}
	if !strings.Contains(tr.ArtistPicture, "size=xl") {
		t.Errorf("expected XL artist picture, got %q", tr.ArtistPicture)
	}
	// Deezer identifiers + link.
	if tr.DeezerTrackID != 67238735 || tr.DeezerAlbumID != 6575789 || tr.DeezerArtistID != 27 {
		t.Errorf("deezer ids not set: %+v", tr)
	}
	if tr.DeezerLink == "" {
		t.Error("deezer link not set")
	}
}

func TestEnrichReturnsRankedMatches(t *testing.T) {
	m := newMockDeezer()
	defer m.close()
	svc := newTestService(m)

	resp, err := svc.Enrich(context.Background(), SearchParams{Title: "Get Lucky", Artist: "Daft Punk"})
	if err != nil {
		t.Fatalf("Enrich error: %v", err)
	}

	if len(resp.Matches) != 2 {
		t.Fatalf("expected 2 matches, got %d", len(resp.Matches))
	}
	// The exact Daft Punk match should outrank the tribute-band live version.
	if resp.Matches[0].ID != 67238735 {
		t.Errorf("expected exact match first, got id=%d", resp.Matches[0].ID)
	}
	if resp.Matches[0].Score <= resp.Matches[1].Score {
		t.Errorf("matches not sorted by score: %v <= %v",
			resp.Matches[0].Score, resp.Matches[1].Score)
	}
	if resp.Matches[0].Score < 0.9 {
		t.Errorf("expected high score for exact match, got %v", resp.Matches[0].Score)
	}
	if resp.Matches[0].DurationMs != 369000 {
		t.Errorf("match duration should be ms: %d", resp.Matches[0].DurationMs)
	}
}

func TestEnrichNoResults(t *testing.T) {
	m := newMockDeezer()
	m.searchBody = emptySearchJSON
	defer m.close()
	svc := newTestService(m)

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

func TestDeezerAPIErrorEnvelope(t *testing.T) {
	m := newMockDeezer()
	m.searchBody = quotaErrorJSON
	defer m.close()
	svc := newTestService(m)

	_, err := svc.Search(context.Background(), SearchParams{Title: "Get Lucky", Artist: "Daft Punk"})
	if err == nil {
		t.Fatal("expected error for Deezer quota error envelope")
	}
	if !strings.Contains(err.Error(), "Quota limit exceeded") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestGetTrackCaching(t *testing.T) {
	m := newMockDeezer()
	defer m.close()
	svc := newTestService(m)

	for i := 0; i < 3; i++ {
		if _, err := svc.GetTrack(context.Background(), 67238735); err != nil {
			t.Fatalf("GetTrack #%d error: %v", i, err)
		}
	}
	if got := atomic.LoadInt64(&m.trackHits); got != 1 {
		t.Fatalf("expected 1 track fetch (cached), got %d", got)
	}
}

func TestRateLimiter(t *testing.T) {
	m := newMockDeezer()
	defer m.close()

	// 10 req/window, burst 2, over a short window: the 3rd request must wait
	// for a token, proving the limiter throttles.
	window := 100 * time.Millisecond
	svc := newTestService(m, WithLimiter(rate.NewLimiter(rate.Every(window/10), 2)))

	ctx := context.Background()
	start := time.Now()
	for i := 0; i < 3; i++ {
		// Distinct ids to avoid the cache short-circuiting the limiter.
		if _, err := svc.GetTrack(ctx, int64(1000+i)); err != nil {
			t.Fatalf("GetTrack error: %v", err)
		}
	}
	elapsed := time.Since(start)

	perToken := window / 10
	if elapsed < perToken {
		t.Fatalf("expected limiter to throttle 3rd request by ~%v, elapsed=%v", perToken, elapsed)
	}
}

func TestSearchFallsBackToLooseQuery(t *testing.T) {
	m := newMockDeezer()
	defer m.close()

	// First (advanced) query returns empty; loose free-text query returns hits.
	var calls int64
	mux := http.NewServeMux()
	mux.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt64(&calls, 1)
		if n == 1 {
			writeJSON(w, emptySearchJSON)
			return
		}
		writeJSON(w, searchResponseJSON)
	})
	m.server.Config.Handler = mux // swap handler
	m.server.Close()
	m.server = httptest.NewServer(mux)
	svc := newTestService(m)

	tracks, err := svc.Search(context.Background(), SearchParams{Title: "Get Lucky", Artist: "Daft Punk"})
	if err != nil {
		t.Fatalf("Search error: %v", err)
	}
	if len(tracks) == 0 {
		t.Fatal("expected loose-query fallback to return tracks")
	}
	if atomic.LoadInt64(&calls) != 2 {
		t.Fatalf("expected 2 search calls (advanced + loose), got %d", calls)
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

func TestScoreCandidateRanking(t *testing.T) {
	params := SearchParams{Title: "Get Lucky", Artist: "Daft Punk"}
	exact := DeezerTrack{Title: "Get Lucky", Artist: DeezerArtist{Name: "Daft Punk"}}
	wrong := DeezerTrack{Title: "Something Else", Artist: DeezerArtist{Name: "Other Band"}}

	if scoreCandidate(params, exact) <= scoreCandidate(params, wrong) {
		t.Fatal("exact match should score higher than unrelated track")
	}
	if s := scoreCandidate(params, exact); s < 0.95 {
		t.Fatalf("expected near-perfect score for exact match, got %v", s)
	}
}

// Sanity: ensure the mock URLs are well formed (guards against accidental
// hard-coded api.deezer.com in code paths under test).
func TestServiceUsesConfiguredBaseURL(t *testing.T) {
	m := newMockDeezer()
	defer m.close()
	svc := newTestService(m)
	if !strings.HasPrefix(svc.baseURL, "http://127.0.0.1") &&
		!strings.HasPrefix(svc.baseURL, fmt.Sprintf("http://%s", "127.0.0.1")) {
		t.Fatalf("service base URL not pointed at mock: %s", svc.baseURL)
	}
}
