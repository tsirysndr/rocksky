package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/teal-fm/piper/models"
	"github.com/teal-fm/piper/service/musicbrainz"
	"golang.org/x/time/rate"
)

const testMBID = "36ff6858-aa32-4ea4-b8c8-6e30f0a5b5bc"
const recordingJSON = `{"id":"36ff6858-aa32-4ea4-b8c8-6e30f0a5b5bc","title":"Song","length":180000,"artist-credit":[{"name":"Artist","artist":{"id":"ca891d65-d9b0-4258-89f7-e6ba29d83767","name":"Artist"}}]}`

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
	if _, err := m.search(context.Background(), p); err != nil {
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
	r, err := restarted.recording(context.Background(), testMBID)
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
	go func() { _, e := m.recording(ctx, testMBID); leader <- e }()
	<-entered
	var wg sync.WaitGroup
	errorsOut := make(chan error, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, e := m.recording(context.Background(), testMBID)
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
	if _, err := m.search(context.Background(), musicbrainz.SearchParams{Track: "Missing"}); err != nil {
		t.Fatal(err)
	}
	m.waitBudget = 20 * time.Millisecond
	started := time.Now()
	_, err := m.recording(context.Background(), testMBID)
	var failure *upstreamError
	if !errors.As(err, &failure) || failure.reason != "local_rate_limit" {
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
		if _, err := m.recording(context.Background(), testMBID); err == nil {
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
		r, err := m.recording(context.Background(), testMBID)
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
	r, err := m.recording(ctx, testMBID)
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
	if _, err := m.recording(context.Background(), testMBID); err == nil {
		t.Fatal("accepted mismatched ID")
	}
	hit, _ := m.cache.get(context.Background(), "recording:"+testMBID)
	if hit != nil {
		t.Fatal("cached invalid record")
	}
}
func TestSearchFailureIsNotSuccessfulEmptyMatch(t *testing.T) {
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) })
	s := &Server{metadata: m}
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
func TestUpstreamRecordingCachesSuccess(t *testing.T) {
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, recordingJSON) })
	r, err := m.recording(context.Background(), testMBID)
	if err != nil || r.source != "musicbrainz-api" {
		t.Fatal(err, r.source)
	}
	var rec musicbrainz.MusicBrainzRecording
	if err = json.Unmarshal(r.body, &rec); err != nil || rec.ID != testMBID {
		t.Fatal("wrong record")
	}
	r, err = m.recording(context.Background(), testMBID)
	if err != nil || r.source != "cache" {
		t.Fatal(err, r.source)
	}
}

func TestMergedRecordingRedirectIsLimitedAndCachesBothIDs(t *testing.T) {
	canonical := "ca891d65-d9b0-4258-89f7-e6ba29d83767"
	var calls atomic.Int32
	var mu sync.Mutex
	var times []time.Time
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		mu.Lock()
		times = append(times, time.Now())
		mu.Unlock()
		if r.URL.Path == "/recording/"+testMBID {
			http.Redirect(w, r, "/recording/"+canonical, http.StatusMovedPermanently)
			return
		}
		if r.URL.Query().Get("fmt") != "json" || r.URL.Query().Get("inc") != "artists releases isrcs" {
			t.Error("redirect lost original JSON/expansion parameters", r.URL)
		}
		fmt.Fprint(w, strings.ReplaceAll(recordingJSON, testMBID, canonical))
	})
	m.limiter = rate.NewLimiter(rate.Every(100*time.Millisecond), 1)
	r, err := m.recording(context.Background(), testMBID)
	if err != nil || r.status != 200 {
		t.Fatal(r, err)
	}
	mu.Lock()
	elapsed := times[1].Sub(times[0])
	mu.Unlock()
	if elapsed < 80*time.Millisecond {
		t.Fatal("redirect bypassed limiter", elapsed)
	}
	for _, id := range []string{testMBID, canonical} {
		r, err = m.recording(context.Background(), id)
		if err != nil || r.source != "cache" {
			t.Fatal(r, err)
		}
	}
	if calls.Load() != 2 {
		t.Fatal("merged IDs were not cached", calls.Load())
	}
}

func TestRedirectCannotSendRequestsToAnotherOrigin(t *testing.T) {
	var calls atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer target.Close()
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL+"/recording/"+testMBID, 302)
	})
	_, err := m.recording(context.Background(), testMBID)
	var failure *upstreamError
	if !errors.As(err, &failure) || failure.reason != "upstream_redirect" || calls.Load() != 0 {
		t.Fatal(err, calls.Load())
	}
}

func TestRetryAfterParsing(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	for _, tc := range []struct {
		value string
		want  time.Duration
	}{
		{"30", 30 * time.Second}, {"0", 0}, {"invalid", 5 * time.Second},
		{now.Add(30 * time.Second).Format(http.TimeFormat), 30 * time.Second},
		{now.Add(-time.Minute).Format(http.TimeFormat), 0},
	} {
		if got := retryDelay(tc.value, now); got != tc.want {
			t.Fatalf("%q: got %s want %s", tc.value, got, tc.want)
		}
	}
}

func TestUpstreamThrottleAndCooldownExposeRetryAfter(t *testing.T) {
	for _, status := range []int{429, 503} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			var calls atomic.Int32
			m := testClient(t, func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Retry-After", "30")
				w.WriteHeader(status)
			})
			for i, reason := range []string{"upstream_http", "upstream_cooldown"} {
				_, err := m.recording(context.Background(), testMBID)
				var failure *upstreamError
				if !errors.As(err, &failure) || failure.reason != reason {
					t.Fatal(err)
				}
				recorder := httptest.NewRecorder()
				ctx := echo.New().NewContext(httptest.NewRequest("GET", "/recording/"+testMBID, nil), recorder)
				if err := metadataError(ctx, err); err != nil {
					t.Fatal(err)
				}
				expected := status
				if i > 0 {
					expected = 503
				}
				if recorder.Code != expected || recorder.Header().Get("X-MusicBrainz-Error") != reason {
					t.Fatal(recorder.Code, recorder.Header())
				}
				retry, err := strconv.Atoi(recorder.Header().Get("Retry-After"))
				if err != nil || retry < 29 || retry > 30 {
					t.Fatal("wrong Retry-After", recorder.Header())
				}
			}
			if calls.Load() != 1 {
				t.Fatal("cooldown called upstream")
			}
			m.save(context.Background(), "recording:"+testMBID, metadataResult{[]byte(recordingJSON), 200, "musicbrainz-api"}, 2, time.Hour)
			if r, err := m.recording(context.Background(), testMBID); err != nil || r.source != "cache" {
				t.Fatal("cooldown blocked cache", r, err)
			}
		})
	}
}

func TestDirectUpstreamIgnoresOldLocalRecordingCache(t *testing.T) {
	var calls atomic.Int32
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); fmt.Fprint(w, recordingJSON) })
	if err := m.cache.put(context.Background(), "recording:"+testMBID, metadataResult{[]byte(recordingJSON), 200, "riff-mb"}, 0, time.Hour); err != nil {
		t.Fatal(err)
	}
	if r, err := m.recording(context.Background(), testMBID); err != nil || r.source != "musicbrainz-api" || calls.Load() != 1 {
		t.Fatal(r, err, calls.Load())
	}
}

func TestNextUpstreamRequestWaitsWithinBudget(t *testing.T) {
	var calls atomic.Int32
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); fmt.Fprint(w, `{"recordings":[]}`) })
	m.limiter = rate.NewLimiter(rate.Every(100*time.Millisecond), 1)
	for _, title := range []string{"first", "second"} {
		if _, err := m.search(context.Background(), musicbrainz.SearchParams{Track: title}); err != nil {
			t.Fatal(err)
		}
	}
	if calls.Load() != 2 {
		t.Fatal("next request was unnecessarily rejected")
	}
}

func TestHandlersKeepResponseShapesWithoutRiff(t *testing.T) {
	var localCalls atomic.Int32
	local := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { localCalls.Add(1); w.WriteHeader(500) }))
	defer local.Close()
	t.Setenv("MBRIFF_URL", local.URL)
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/recording" {
			fmt.Fprint(w, `{"recordings":[`+recordingJSON+`]}`)
			return
		}
		fmt.Fprint(w, recordingJSON)
	})
	m.limiter = rate.NewLimiter(rate.Inf, 1)
	s := &Server{metadata: m, mb: &musicbrainz.MusicBrainzService{}}
	app := echo.New()
	app.POST("/search", s.searchHandler)
	app.POST("/hydrate", s.hydrateHandler)
	app.GET("/recording/:mbid", s.recordingByMbidHandler)
	for _, tc := range []struct{ method, path, body string }{
		{"POST", "/search", `{"Track":"Song","Artist":"Artist"}`},
		{"POST", "/hydrate", `{"name":"Song","artist":[{"name":"Artist"}]}`},
		{"GET", "/recording/" + testMBID, ""},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		app.ServeHTTP(rec, req)
		if rec.Code != 200 {
			t.Fatal(tc.path, rec.Code, rec.Body.String())
		}
		if tc.path == "/search" {
			var rows []musicbrainz.MusicBrainzRecording
			if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil || len(rows) != 1 || rows[0].ID != testMBID {
				t.Fatal("search format changed", rec.Body.String(), err)
			}
		} else {
			var track models.Track
			if err := json.Unmarshal(rec.Body.Bytes(), &track); err != nil || track.Name != "Song" || track.RecordingMBID == nil || *track.RecordingMBID != testMBID {
				t.Fatal("track format changed", rec.Body.String(), err)
			}
		}
	}
	if localCalls.Load() != 0 {
		t.Fatal("riff-mb was contacted")
	}
}

func TestOnlyOfficialUpstreamConfigurationIsAllowed(t *testing.T) {
	for _, raw := range []string{"", officialMusicBrainzURL, officialMusicBrainzURL + "/"} {
		if got, err := officialUpstream(raw); err != nil || got != officialMusicBrainzURL {
			t.Fatal(got, err)
		}
	}
	for _, raw := range []string{"http://localhost:8094", "https://example.com/ws/2", "http://musicbrainz.org/ws/2", "https://musicbrainz.org.evil.test/ws/2", "https://user:pass@musicbrainz.org/ws/2"} {
		if _, err := officialUpstream(raw); err == nil {
			t.Fatal("accepted non-official upstream", raw)
		}
	}
}

func TestTransportUsesIPv4WithoutForwardProxy(t *testing.T) {
	m := testClient(t, func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, recordingJSON) })
	transport := m.http.Transport.(*http.Transport)
	if transport.Proxy != nil {
		t.Fatal("forward proxy is enabled")
	}
	if transport.TLSClientConfig != nil && transport.TLSClientConfig.InsecureSkipVerify {
		t.Fatal("TLS verification disabled")
	}
	// localhost may resolve to both families; this transport must reach IPv4.
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	_, port, _ := net.SplitHostPort(listener.Addr().String())
	conn, err := transport.DialContext(context.Background(), "tcp", "localhost:"+port)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if conn.RemoteAddr().(*net.TCPAddr).IP.To4() == nil {
		t.Fatal("did not dial IPv4")
	}
}
