package spotify

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/time/rate"
)

// riffAndSpotify stands up a mock riff and a mock Spotify, wired into a service
// with riff enabled. The returned counters record how often each was hit.
func riffAndSpotify(t *testing.T, riffBody string, riffStatus int, opts ...Option) (*SpotifyService, *atomic.Int64, *atomic.Int64) {
	t.Helper()

	var riffHits, spotifyHits atomic.Int64

	riffSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		riffHits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(riffStatus)
		_, _ = w.Write([]byte(riffBody))
	}))
	t.Cleanup(riffSrv.Close)

	spotifySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		spotifyHits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"from-spotify","name":"From Spotify"}`))
	}))
	t.Cleanup(spotifySrv.Close)

	base := []Option{
		WithBaseURL(spotifySrv.URL),
		WithLimiter(rate.NewLimiter(rate.Inf, 0)),
		WithRiffURL(riffSrv.URL),
	}
	return NewSpotifyService(append(base, opts...)...), &riffHits, &spotifyHits
}

func TestRiffAnswersCatalogReadsWithoutTouchingSpotify(t *testing.T) {
	s, riffHits, spotifyHits := riffAndSpotify(t, `{"id":"abc","name":"From riff"}`, http.StatusOK)

	res, err := s.Proxy(context.Background(), http.MethodGet, "/tracks/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("proxy failed: %v", err)
	}
	if res.Source != SourceRiff {
		t.Fatalf("expected the answer to come from riff, got %q", res.Source)
	}
	if string(res.Body) != `{"id":"abc","name":"From riff"}` {
		t.Fatalf("unexpected body: %s", res.Body)
	}
	if riffHits.Load() != 1 {
		t.Fatalf("expected 1 riff hit, got %d", riffHits.Load())
	}
	if spotifyHits.Load() != 0 {
		t.Fatalf("spotify must not be touched when riff answers, got %d hits", spotifyHits.Load())
	}
}

func TestRiffEmptyResultFallsBackToSpotify(t *testing.T) {
	// A well-formed search response that found nothing: riff mirrors a dump
	// that lags Spotify, so this is exactly when a Spotify call is worth it.
	s, riffHits, spotifyHits := riffAndSpotify(t, `{"tracks":{"items":[],"total":0}}`, http.StatusOK)

	res, err := s.Proxy(context.Background(), http.MethodGet, "/search?q=brand+new&type=track", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("proxy failed: %v", err)
	}
	if res.Source == SourceRiff {
		t.Fatal("an empty riff result must not be served as an answer")
	}
	if riffHits.Load() != 1 {
		t.Fatalf("expected riff to be tried once, got %d", riffHits.Load())
	}
	if spotifyHits.Load() != 1 {
		t.Fatalf("expected 1 spotify fallback, got %d", spotifyHits.Load())
	}
}

func TestRiffBatchOfAllNullsFallsBackToSpotify(t *testing.T) {
	s, _, spotifyHits := riffAndSpotify(t, `{"artists":[null,null]}`, http.StatusOK)

	if _, err := s.Proxy(context.Background(), http.MethodGet, "/artists?ids=a,b", "Bearer user-token", nil); err != nil {
		t.Fatalf("proxy failed: %v", err)
	}
	if spotifyHits.Load() != 1 {
		t.Fatalf("all-null batch should fall back, got %d spotify hits", spotifyHits.Load())
	}
}

func TestRiffPartialBatchIsServed(t *testing.T) {
	// One id resolved is a result. Spotify would return the same null hole, so
	// spending a rate-limit slot to reproduce it buys nothing.
	s, _, spotifyHits := riffAndSpotify(t, `{"artists":[null,{"id":"b"}]}`, http.StatusOK)

	res, err := s.Proxy(context.Background(), http.MethodGet, "/artists?ids=a,b", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("proxy failed: %v", err)
	}
	if res.Source != SourceRiff {
		t.Fatalf("expected riff to answer, got %q", res.Source)
	}
	if spotifyHits.Load() != 0 {
		t.Fatalf("spotify should not be called, got %d hits", spotifyHits.Load())
	}
}

func TestRiff404FallsBackToSpotify(t *testing.T) {
	s, _, spotifyHits := riffAndSpotify(t, `{"error":{"status":404,"message":"non existing id"}}`, http.StatusNotFound)

	res, err := s.Proxy(context.Background(), http.MethodGet, "/albums/unknown", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("proxy failed: %v", err)
	}
	if res.Source == SourceRiff {
		t.Fatal("a riff 404 must fall through to spotify")
	}
	if spotifyHits.Load() != 1 {
		t.Fatalf("expected 1 spotify fallback, got %d", spotifyHits.Load())
	}
}

func TestRiffUnreachableFallsBackToSpotify(t *testing.T) {
	// A closed port: riff being down must never take the proxy down with it.
	closed := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	deadURL := closed.URL
	closed.Close()

	var spotifyHits atomic.Int64
	spotifySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		spotifyHits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"abc"}`))
	}))
	defer spotifySrv.Close()

	s := NewSpotifyService(
		WithBaseURL(spotifySrv.URL),
		WithLimiter(rate.NewLimiter(rate.Inf, 0)),
		WithRiffURL(deadURL),
	)

	res, err := s.Proxy(context.Background(), http.MethodGet, "/tracks/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("proxy should survive riff being down: %v", err)
	}
	if res.Status != http.StatusOK || spotifyHits.Load() != 1 {
		t.Fatalf("expected the spotify fallback to answer, status=%d hits=%d", res.Status, spotifyHits.Load())
	}
}

// The whole point of routing through riff: those calls are loopback, so they
// must not consume a rate limiter slot.
func TestRiffIsNotRateLimited(t *testing.T) {
	// A limiter that never grants anything. Any request that reaches the
	// Spotify path is answered 429 immediately.
	s, riffHits, spotifyHits := riffAndSpotify(t,
		`{"id":"abc","name":"From riff"}`, http.StatusOK,
		WithLimiter(rate.NewLimiter(0, 0)),
		WithMaxQueueWait(50*time.Millisecond),
	)
	ctx := context.Background()

	const calls = 25
	for i := 0; i < calls; i++ {
		res, err := s.Proxy(ctx, http.MethodGet, "/tracks/abc", "Bearer user-token", nil)
		if err != nil {
			t.Fatalf("call %d failed: %v", i, err)
		}
		if res.Status != http.StatusOK || res.Source != SourceRiff {
			t.Fatalf("call %d was throttled: status=%d source=%q", i, res.Status, res.Source)
		}
	}
	if riffHits.Load() != calls {
		t.Fatalf("expected %d riff hits, got %d", calls, riffHits.Load())
	}
	if spotifyHits.Load() != 0 {
		t.Fatalf("spotify must not be touched, got %d hits", spotifyHits.Load())
	}

	// Contrast: a catalog path riff does not implement is still rate limited.
	res, err := s.Proxy(ctx, http.MethodGet, "/artists/abc/related-artists", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("related-artists call failed: %v", err)
	}
	if res.Status != http.StatusTooManyRequests {
		t.Fatalf("a non-riff path should still be rate limited, got status %d", res.Status)
	}
}

func TestRiffResultsAreNotCached(t *testing.T) {
	// riff is loopback; caching its answers would only spend memory duplicating
	// something already local, and would hide a refreshed dump.
	s, riffHits, _ := riffAndSpotify(t, `{"id":"abc"}`, http.StatusOK)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		res, err := s.Proxy(ctx, http.MethodGet, "/tracks/abc", "Bearer user-token", nil)
		if err != nil {
			t.Fatalf("call %d failed: %v", i, err)
		}
		if res.Cached {
			t.Fatalf("call %d was served from cache", i)
		}
	}
	if riffHits.Load() != 3 {
		t.Fatalf("expected riff to be asked every time, got %d", riffHits.Load())
	}
}

func TestSpotifyFallbackIsStillCached(t *testing.T) {
	// The fallback keeps every protection it had: one Spotify call, then cache.
	s, riffHits, spotifyHits := riffAndSpotify(t, `{"tracks":{"items":[]}}`, http.StatusOK)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		if _, err := s.Proxy(ctx, http.MethodGet, "/search?q=nothing&type=track", "Bearer user-token", nil); err != nil {
			t.Fatalf("call %d failed: %v", i, err)
		}
	}
	if spotifyHits.Load() != 1 {
		t.Fatalf("expected the fallback to be cached after one call, got %d spotify hits", spotifyHits.Load())
	}
	// And riff is not re-asked either: a cached entry means riff already missed
	// this path, and repeating that miss is a full parquet scan for a search.
	if riffHits.Load() != 1 {
		t.Fatalf("expected riff to be asked once, got %d", riffHits.Load())
	}
}

func TestRiffIsSkippedForUserScopedAndWrites(t *testing.T) {
	s, riffHits, _ := riffAndSpotify(t, `{"id":"abc"}`, http.StatusOK)
	ctx := context.Background()

	// User-scoped data does not exist in the dump.
	if _, err := s.Proxy(ctx, http.MethodGet, "/me/player/currently-playing", "Bearer user-token", nil); err != nil {
		t.Fatalf("me call failed: %v", err)
	}
	// riff is read-only; a write must never be shadowed by it.
	if _, err := s.Proxy(ctx, http.MethodPut, "/me/player/play", "Bearer user-token", nil); err != nil {
		t.Fatalf("play call failed: %v", err)
	}
	if riffHits.Load() != 0 {
		t.Fatalf("riff must not see user-scoped or write traffic, got %d hits", riffHits.Load())
	}
}

func TestRiffAnswersAudioFeatures(t *testing.T) {
	s, _, spotifyHits := riffAndSpotify(t,
		`{"id":"abc","danceability":0.51,"energy":0.8,"tempo":128.03,"type":"audio_features"}`,
		http.StatusOK)

	res, err := s.Proxy(context.Background(), http.MethodGet, "/audio-features/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("proxy failed: %v", err)
	}
	if res.Source != SourceRiff {
		t.Fatalf("expected riff to answer, got %q", res.Source)
	}
	if spotifyHits.Load() != 0 {
		t.Fatalf("spotify must not be touched, got %d hits", spotifyHits.Load())
	}
}

func TestRiffAudioFeaturesBatchWithSomeAnalysisIsServed(t *testing.T) {
	// null entries are normal here — Spotify has no analysis for plenty of
	// tracks either — so one resolved entry is a result.
	s, _, spotifyHits := riffAndSpotify(t, `{"audio_features":[{"id":"a"},null]}`, http.StatusOK)

	res, err := s.Proxy(context.Background(), http.MethodGet, "/audio-features?ids=a,b", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("proxy failed: %v", err)
	}
	if res.Source != SourceRiff {
		t.Fatalf("expected riff to answer, got %q", res.Source)
	}
	if spotifyHits.Load() != 0 {
		t.Fatalf("spotify must not be touched, got %d hits", spotifyHits.Load())
	}
}

func TestRiffAudioFeaturesWithNoAnalysisFallsBack(t *testing.T) {
	s, _, spotifyHits := riffAndSpotify(t, `{"audio_features":[null,null]}`, http.StatusOK)

	if _, err := s.Proxy(context.Background(), http.MethodGet, "/audio-features?ids=a,b", "Bearer user-token", nil); err != nil {
		t.Fatalf("proxy failed: %v", err)
	}
	if spotifyHits.Load() != 1 {
		t.Fatalf("expected 1 spotify fallback, got %d", spotifyHits.Load())
	}
}

func TestRiffCanServe(t *testing.T) {
	served := []string{
		"/search",
		"/search?q=x&type=track",
		"/artists",
		"/artists?ids=a,b",
		"/artists/abc",
		"/artists/abc/albums",
		"/artists/abc/albums?include_groups=single",
		"/artists/abc/top-tracks",
		"/albums",
		"/albums/abc",
		"/albums/abc/tracks",
		"/tracks",
		"/tracks/abc",
		"/audio-features",
		"/audio-features?ids=a,b",
		"/audio-features/abc",
	}
	for _, p := range served {
		if !riffCanServe(p) {
			t.Errorf("riff should serve %s", p)
		}
	}

	notServed := []string{
		"/me/player",
		"/me/tracks",
		"/artists/abc/related-artists",
		"/albums/abc/something-else",
		"/tracks/abc/nested",
		"/audio-features/abc/nested",
		"/audio-analysis/abc", // riff does not implement audio analysis
		"/recommendations",
		"/playlists/abc",
		"/browse/new-releases",
	}
	for _, p := range notServed {
		if riffCanServe(p) {
			t.Errorf("riff should not be asked for %s", p)
		}
	}
}

func TestRiffHasResults(t *testing.T) {
	cases := []struct {
		name string
		body string
		want bool
	}{
		{"single object", `{"id":"abc","name":"x"}`, true},
		{"single object with empty id", `{"id":""}`, false},
		{"paging with items", `{"items":[{"id":"a"}],"total":1}`, true},
		{"empty paging", `{"items":[],"total":0}`, false},
		{"search with hits", `{"tracks":{"items":[{"id":"a"}],"total":1}}`, true},
		{"search with none", `{"tracks":{"items":[],"total":0}}`, false},
		{"search several types, one empty", `{"tracks":{"items":[]},"artists":{"items":[{"id":"a"}]}}`, true},
		{"search all empty", `{"tracks":{"items":[]},"albums":{"items":[]}}`, false},
		{"batch partly resolved", `{"artists":[null,{"id":"b"}]}`, true},
		{"batch all null", `{"artists":[null,null]}`, false},
		{"batch empty", `{"artists":[]}`, false},
		{"top-tracks", `{"tracks":[{"id":"a"}]}`, true},
		{"top-tracks empty", `{"tracks":[]}`, false},
		{"error envelope", `{"error":{"status":404,"message":"non existing id"}}`, false},
		{"not json", `<html>nope</html>`, false},
		{"empty body", ``, false},
	}
	for _, tc := range cases {
		if got := riffHasResults([]byte(tc.body)); got != tc.want {
			t.Errorf("%s: riffHasResults(%s) = %v, want %v", tc.name, tc.body, got, tc.want)
		}
	}
}
