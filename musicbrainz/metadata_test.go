package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/teal-fm/piper/service/musicbrainz"
	"golang.org/x/time/rate"
)

const testMBID = "36ff6858-aa32-4ea4-b8c8-6e30f0a5b5bc"
const recordingJSON = `{"id":"36ff6858-aa32-4ea4-b8c8-6e30f0a5b5bc","title":"Song","length":180000,"artist-credit":[{"name":"Artist","artist":{"id":"ca891d65-d9b0-4258-89f7-e6ba29d83767","name":"Artist"}}]}`

func noRecording(context.Context) (*musicbrainz.MusicBrainzRecording, error) {
	return nil, errors.New("local miss")
}
func noSearch(context.Context) ([]musicbrainz.MusicBrainzRecording, error) {
	return nil, errors.New("local miss")
}
func testClient(t *testing.T, handler http.HandlerFunc) *metadataClient {
	t.Helper()
	upstream := httptest.NewServer(handler)
	t.Cleanup(upstream.Close)
	cache, err := openMetadataCache(filepath.Join(t.TempDir(), "metadata.sqlite"), 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cache.db.Close() })
	return newMetadataClient(cache, upstream.URL)
}
func TestSearchSeedsDurableRecordingCache(t *testing.T) {
	var calls atomic.Int32
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		fmt.Fprint(w, `{"recordings":[`+recordingJSON+`]}`)
	})
	p := musicbrainz.SearchParams{Track: "Song", Artist: "Artist"}
	if _, err := m.search(context.Background(), p, noSearch); err != nil {
		t.Fatal(err)
	}
	var file string
	if err := m.cache.db.QueryRow("SELECT file FROM pragma_database_list WHERE name='main'").Scan(&file); err != nil {
		t.Fatal(err)
	}
	if err := m.cache.db.Close(); err != nil {
		t.Fatal(err)
	}
	cache, err := openMetadataCache(file, 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	defer cache.db.Close()
	restarted := newMetadataClient(cache, "http://127.0.0.1:1")
	r, err := restarted.recording(context.Background(), testMBID, noRecording)
	if err != nil || r.source != "cache" || r.status != 200 {
		t.Fatalf("%+v %v", r, err)
	}
	if calls.Load() != 1 {
		t.Fatal("unexpected extra upstream call")
	}
}
func TestConcurrentLookupsShareWorkAndSurviveCallerCancellation(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			close(entered)
		}
		<-release
		fmt.Fprint(w, recordingJSON)
	})
	ctx, cancel := context.WithCancel(context.Background())
	leader := make(chan error, 1)
	go func() { _, e := m.recording(ctx, testMBID, noRecording); leader <- e }()
	<-entered
	var wg sync.WaitGroup
	errorsOut := make(chan error, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, e := m.recording(context.Background(), testMBID, noRecording)
			if e == nil && r.status != 200 {
				e = errors.New("not successful")
			}
			errorsOut <- e
		}()
	}
	cancel()
	if !errors.Is(<-leader, context.Canceled) {
		t.Fatal("leader did not cancel")
	}
	close(release)
	wg.Wait()
	close(errorsOut)
	for err := range errorsOut {
		if err != nil {
			t.Fatal(err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("upstream called %d times", calls.Load())
	}
}
func TestSearchAndRecordingShareRateBudgetWithoutLongQueue(t *testing.T) {
	var calls atomic.Int32
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); fmt.Fprint(w, `{"recordings":[]}`) })
	if _, err := m.search(context.Background(), musicbrainz.SearchParams{Track: "Missing"}, noSearch); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	_, err := m.recording(context.Background(), testMBID, noRecording)
	if !errors.Is(err, errUpstreamBusy) {
		t.Fatalf("got %v", err)
	}
	if time.Since(started) > 500*time.Millisecond {
		t.Fatal("request queued too long")
	}
	if calls.Load() != 1 {
		t.Fatal("recording bypassed shared limiter")
	}
}
func TestUpstreamCooldownHonorsRetryAfter(t *testing.T) {
	var calls atomic.Int32
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(503)
	})
	m.limiter = rate.NewLimiter(rate.Inf, 1)
	for i := 0; i < 2; i++ {
		if _, err := m.recording(context.Background(), testMBID, noRecording); err == nil {
			t.Fatal("upstream failure hidden")
		}
	}
	if calls.Load() != 1 || time.Until(m.cooldown) < 25*time.Second {
		t.Fatal("cooldown not respected")
	}
	hit, err := m.cache.get(context.Background(), "recording:"+testMBID)
	if err != nil || hit != nil {
		t.Fatal("transient error cached as missing")
	}
}
func TestOnlyUpstreamNotFoundIsNegativelyCached(t *testing.T) {
	var calls atomic.Int32
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(404) })
	for i := 0; i < 2; i++ {
		r, err := m.recording(context.Background(), testMBID, noRecording)
		if err != nil || r.status != 404 {
			t.Fatalf("%+v %v", r, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatal("404 not cached")
	}
}
func TestStalePositiveCacheSurvivesUpstreamOutage(t *testing.T) {
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) })
	ctx := context.Background()
	key := "recording:" + testMBID
	if err := m.cache.put(ctx, key, metadataResult{[]byte(recordingJSON), 200, "test"}, 2, time.Hour); err != nil {
		t.Fatal(err)
	}
	if _, err := m.cache.db.Exec("UPDATE metadata_cache SET expires_at=0 WHERE key=?", key); err != nil {
		t.Fatal(err)
	}
	r, err := m.recording(ctx, testMBID, noRecording)
	if err != nil || r.source != "stale-cache" || string(r.body) != recordingJSON {
		t.Fatalf("%+v %v", r, err)
	}
}
func TestPartialSearchDoesNotOverwriteFullRecording(t *testing.T) {
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { t.Error("unexpected upstream request") })
	ctx := context.Background()
	key := "recording:" + testMBID
	full := metadataResult{[]byte(recordingJSON), 200, "test"}
	if err := m.cache.put(ctx, key, full, 2, time.Hour); err != nil {
		t.Fatal(err)
	}
	if err := m.cache.put(ctx, key, metadataResult{[]byte(`{"title":"partial"}`), 200, "test"}, 1, time.Hour); err != nil {
		t.Fatal(err)
	}
	r, err := m.cache.get(ctx, key)
	if err != nil || string(r.body) != recordingJSON {
		t.Fatal("lost full recording")
	}
}
func TestInvalidUpstreamRecordDoesNotPoisonCache(t *testing.T) {
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, strings.ReplaceAll(recordingJSON, testMBID, "ca891d65-d9b0-4258-89f7-e6ba29d83767"))
	})
	if _, err := m.recording(context.Background(), testMBID, noRecording); err == nil {
		t.Fatal("accepted mismatched ID")
	}
	hit, _ := m.cache.get(context.Background(), "recording:"+testMBID)
	if hit != nil {
		t.Fatal("cached invalid record")
	}
}
func TestSearchFailureIsNotSuccessfulEmptyMatch(t *testing.T) {
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) })
	local := httptest.NewServer(http.NotFoundHandler())
	defer local.Close()
	s := &Server{metadata: m, mbriffURL: local.URL, mbriffClient: local.Client()}
	req := httptest.NewRequest(http.MethodPost, "/search", strings.NewReader(`{"Track":"Song"}`))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	if err := s.searchHandler(echo.New().NewContext(req, recorder)); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != 503 || recorder.Header().Get("Retry-After") == "" {
		t.Fatal(recorder.Code, recorder.Body.String())
	}
}
func TestLocalRecordingMissFallsBackAndCachesSuccess(t *testing.T) {
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, recordingJSON) })
	r, err := m.recording(context.Background(), testMBID, noRecording)
	if err != nil || r.source != "musicbrainz-api" {
		t.Fatal(err, r.source)
	}
	var rec musicbrainz.MusicBrainzRecording
	if err = json.Unmarshal(r.body, &rec); err != nil || rec.ID != testMBID {
		t.Fatal("wrong record")
	}
	r, err = m.recording(context.Background(), testMBID, noRecording)
	if err != nil || r.source != "cache" {
		t.Fatal(err, r.source)
	}
}
