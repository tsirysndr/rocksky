package spotify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/time/rate"
)

func newTestService(upstream string, opts ...Option) *SpotifyService {
	base := []Option{
		WithBaseURL(upstream),
		WithLimiter(rate.NewLimiter(rate.Inf, 0)),
	}
	return NewSpotifyService(append(base, opts...)...)
}

func TestCatalogResponsesAreCached(t *testing.T) {
	var hits atomic.Int64
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"abc","name":"Some Artist"}`))
	}))
	defer upstream.Close()

	s := newTestService(upstream.URL)
	ctx := context.Background()

	first, err := s.Proxy(ctx, http.MethodGet, "/artists/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("first call failed: %v", err)
	}
	if first.Cached {
		t.Fatal("first call should not be served from cache")
	}

	second, err := s.Proxy(ctx, http.MethodGet, "/artists/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("second call failed: %v", err)
	}
	if !second.Cached {
		t.Fatal("second call should be served from cache")
	}
	if got := hits.Load(); got != 1 {
		t.Fatalf("expected 1 upstream hit, got %d", got)
	}
	if string(second.Body) != `{"id":"abc","name":"Some Artist"}` {
		t.Fatalf("unexpected cached body: %s", second.Body)
	}
}

func TestStaleResponseServedDuringCooldown(t *testing.T) {
	var hits atomic.Int64
	var rateLimited atomic.Bool
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if rateLimited.Load() {
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":{"status":429,"message":"rate limited"}}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"abc"}`))
	}))
	defer upstream.Close()

	// Fresh window of zero: every request goes upstream but keeps a stale copy.
	s := newTestService(upstream.URL, WithCategorizer(func(path string) category {
		return category{fresh: 0, stale: time.Hour}
	}))
	ctx := context.Background()

	first, err := s.Proxy(ctx, http.MethodGet, "/albums/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("first call failed: %v", err)
	}
	if first.Status != http.StatusOK {
		t.Fatalf("first call: expected 200, got %d", first.Status)
	}

	rateLimited.Store(true)

	second, err := s.Proxy(ctx, http.MethodGet, "/albums/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("second call failed: %v", err)
	}
	if second.Status != http.StatusOK || !second.Stale {
		t.Fatalf("second call: expected stale 200, got status=%d stale=%v", second.Status, second.Stale)
	}

	// The 429 must have started a cooldown: this call is served stale without
	// touching the upstream at all.
	third, err := s.Proxy(ctx, http.MethodGet, "/albums/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("third call failed: %v", err)
	}
	if third.Status != http.StatusOK || !third.Stale {
		t.Fatalf("third call: expected stale 200, got status=%d stale=%v", third.Status, third.Stale)
	}
	if got := hits.Load(); got != 2 {
		t.Fatalf("expected 2 upstream hits, got %d", got)
	}
}

func TestUncachedRequestsAre429DuringCooldown(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "60")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer upstream.Close()

	s := newTestService(upstream.URL)
	ctx := context.Background()

	// Trigger the cooldown with a real upstream 429.
	if _, err := s.Proxy(ctx, http.MethodGet, "/artists/abc", "Bearer user-token", nil); err != nil {
		t.Fatalf("first call failed: %v", err)
	}

	// A different, uncached path must not reach the upstream; it gets a local 429.
	result, err := s.Proxy(ctx, http.MethodGet, "/artists/other", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("second call failed: %v", err)
	}
	if result.Status != http.StatusTooManyRequests {
		t.Fatalf("expected 429 during cooldown, got %d", result.Status)
	}
	if result.RetryAfter == "" {
		t.Fatal("expected Retry-After to be set during cooldown")
	}
}

func TestShortCooldownIsQueuedAndRetried(t *testing.T) {
	var hits atomic.Int64
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only the first call is rate limited, with a Retry-After short enough
		// to wait out inside the queue budget.
		if hits.Add(1) == 1 {
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"abc"}`))
	}))
	defer upstream.Close()

	s := newTestService(upstream.URL, WithMaxQueueWait(10*time.Second))

	start := time.Now()
	result, err := s.Proxy(context.Background(), http.MethodGet, "/artists/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("call failed: %v", err)
	}
	if result.Status != http.StatusOK {
		t.Fatalf("expected the queued retry to return 200, got %d", result.Status)
	}
	if elapsed := time.Since(start); elapsed < time.Second {
		t.Fatalf("expected the request to wait out the cooldown, returned after %s", elapsed)
	}
	if got := hits.Load(); got != 2 {
		t.Fatalf("expected 2 upstream hits (429 then retry), got %d", got)
	}
}

func TestLongCooldownIsNotQueued(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "600")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer upstream.Close()

	s := newTestService(upstream.URL, WithMaxQueueWait(2*time.Second))

	start := time.Now()
	result, err := s.Proxy(context.Background(), http.MethodGet, "/artists/abc", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("call failed: %v", err)
	}
	if result.Status != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", result.Status)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("a 600s cooldown must not be queued, returned after %s", elapsed)
	}
}

func TestSaturatedQueueReturns429NotAnError(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"abc"}`))
	}))
	defer upstream.Close()

	// One request per 10 minutes, no burst left after the first call: the
	// second request cannot get a slot within its budget.
	s := newTestService(upstream.URL,
		WithLimiter(rate.NewLimiter(rate.Every(10*time.Minute), 1)),
		WithMaxQueueWait(time.Second),
	)
	ctx := context.Background()

	if _, err := s.Proxy(ctx, http.MethodGet, "/artists/abc", "Bearer user-token", nil); err != nil {
		t.Fatalf("first call failed: %v", err)
	}

	start := time.Now()
	result, err := s.Proxy(ctx, http.MethodGet, "/artists/other", "Bearer user-token", nil)
	if err != nil {
		t.Fatalf("saturated queue must not surface as an error (it became a 502): %v", err)
	}
	if result.Status != http.StatusTooManyRequests {
		t.Fatalf("expected 429 when the queue is saturated, got %d", result.Status)
	}
	if result.RetryAfter == "" {
		t.Fatal("expected Retry-After to be set when the queue is saturated")
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("saturated request should be rejected within its budget, took %s", elapsed)
	}
}

func TestCallerCancellationIsReportedAsContextError(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"abc"}`))
	}))
	defer upstream.Close()

	// The second call has to wait ~2s for a slot — well inside its budget, so
	// it is genuinely parked in the limiter when the caller gives up.
	s := newTestService(upstream.URL,
		WithLimiter(rate.NewLimiter(rate.Every(2*time.Second), 1)),
		WithMaxQueueWait(time.Minute),
	)
	ctx := context.Background()

	if _, err := s.Proxy(ctx, http.MethodGet, "/artists/abc", "Bearer user-token", nil); err != nil {
		t.Fatalf("first call failed: %v", err)
	}

	cancelCtx, cancel := context.WithCancel(ctx)
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	_, err := s.Proxy(cancelCtx, http.MethodGet, "/artists/other", "Bearer user-token", nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected a context.Canceled error the handler can map to 499, got %v", err)
	}
}

func TestUserEndpointsRequireAuthorization(t *testing.T) {
	s := newTestService("http://unused.invalid")

	_, err := s.Proxy(context.Background(), http.MethodGet, "/me/player/currently-playing", "", nil)
	proxyErr, ok := err.(*ProxyError)
	if !ok {
		t.Fatalf("expected ProxyError, got %v", err)
	}
	if proxyErr.Status != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", proxyErr.Status)
	}
}

func TestUserEndpointsAreCachedPerToken(t *testing.T) {
	var hits atomic.Int64
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"token": r.Header.Get("Authorization")})
	}))
	defer upstream.Close()

	s := newTestService(upstream.URL)
	ctx := context.Background()

	a1, _ := s.Proxy(ctx, http.MethodGet, "/me/player/currently-playing", "Bearer user-a", nil)
	b1, _ := s.Proxy(ctx, http.MethodGet, "/me/player/currently-playing", "Bearer user-b", nil)
	a2, _ := s.Proxy(ctx, http.MethodGet, "/me/player/currently-playing", "Bearer user-a", nil)

	if got := hits.Load(); got != 2 {
		t.Fatalf("expected 2 upstream hits (one per user), got %d", got)
	}
	if !a2.Cached {
		t.Fatal("repeat call for the same user should be cached")
	}
	if string(a1.Body) == string(b1.Body) {
		t.Fatal("users must not share cached responses")
	}
}

func TestForwardsAuthorizationHeader(t *testing.T) {
	var seenAuth atomic.Value
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth.Store(r.Header.Get("Authorization"))
		_, _ = w.Write([]byte(`{}`))
	}))
	defer upstream.Close()

	s := newTestService(upstream.URL)
	if _, err := s.Proxy(context.Background(), http.MethodGet, "/tracks/xyz", "Bearer forwarded-token", nil); err != nil {
		t.Fatalf("call failed: %v", err)
	}
	if got := seenAuth.Load(); got != "Bearer forwarded-token" {
		t.Fatalf("expected forwarded Authorization header, got %v", got)
	}
}

func TestClientCredentialsFallbackForCatalog(t *testing.T) {
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, _ := r.BasicAuth()
		if user != "client-id" || pass != "client-secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(tokenResponse{AccessToken: "app-token", TokenType: "Bearer", ExpiresIn: 3600})
	}))
	defer tokenServer.Close()

	var seenAuth atomic.Value
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth.Store(r.Header.Get("Authorization"))
		_, _ = w.Write([]byte(`{}`))
	}))
	defer upstream.Close()

	s := newTestService(upstream.URL,
		WithTokenURL(tokenServer.URL),
		WithCredentials("client-id", "client-secret"),
	)
	if _, err := s.Proxy(context.Background(), http.MethodGet, "/artists/abc", "", nil); err != nil {
		t.Fatalf("call failed: %v", err)
	}
	if got := seenAuth.Load(); got != "Bearer app-token" {
		t.Fatalf("expected app token to be used, got %v", got)
	}
}

func TestAppPoolFailsOverOn429(t *testing.T) {
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, _, _ := r.BasicAuth()
		_ = json.NewEncoder(w).Encode(tokenResponse{AccessToken: "token-" + user, TokenType: "Bearer", ExpiresIn: 3600})
	}))
	defer tokenServer.Close()

	var appAHits, appBHits atomic.Int64
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Header.Get("Authorization") {
		case "Bearer token-app-a":
			appAHits.Add(1)
			w.Header().Set("Retry-After", "600")
			w.WriteHeader(http.StatusTooManyRequests)
		case "Bearer token-app-b":
			appBHits.Add(1)
			_, _ = w.Write([]byte(`{"id":"abc"}`))
		default:
			t.Errorf("unexpected Authorization header %q", r.Header.Get("Authorization"))
			w.WriteHeader(http.StatusUnauthorized)
		}
	}))
	defer upstream.Close()

	s := newTestService(upstream.URL,
		WithTokenURL(tokenServer.URL),
		WithApps("app-a:secret-a", "app-b:secret-b"),
	)
	ctx := context.Background()

	// Both requests must succeed via app-b, whatever app the cursor tries
	// first; once app-a has answered 429 it must not be contacted again.
	for i, path := range []string{"/artists/abc", "/artists/other"} {
		result, err := s.Proxy(ctx, http.MethodGet, path, "", nil)
		if err != nil {
			t.Fatalf("call %d failed: %v", i, err)
		}
		if result.Status != http.StatusOK {
			t.Fatalf("call %d: expected 200 via failover, got %d", i, result.Status)
		}
	}
	if got := appAHits.Load(); got > 1 {
		t.Fatalf("rate-limited app should be in cooldown after one 429, got %d hits", got)
	}
	if got := appBHits.Load(); got != 2 {
		t.Fatalf("expected 2 hits on the healthy app, got %d", got)
	}
}

func TestDecryptAES256CTRMatchesNode(t *testing.T) {
	// Vector produced with Node: crypto.createCipheriv("aes-256-ctr", key, iv)
	// key = 32 x 0x01, iv = 16 x 0x02, plaintext "super-secret".
	key := bytes.Repeat([]byte{0x01}, 32)
	iv := bytes.Repeat([]byte{0x02}, 16)
	const encrypted = "11db62965692996db68410c1"

	got, err := decryptAES256CTR(encrypted, key, iv)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}
	if got != "super-secret" {
		t.Fatalf("expected %q, got %q", "super-secret", got)
	}
}

func TestPlayerControlsAreNotCached(t *testing.T) {
	var hits atomic.Int64
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.Method != http.MethodPut {
			t.Errorf("expected PUT, got %s", r.Method)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()

	s := newTestService(upstream.URL)
	ctx := context.Background()

	for i := 0; i < 2; i++ {
		result, err := s.Proxy(ctx, http.MethodPut, "/me/player/pause", "Bearer user-token", nil)
		if err != nil {
			t.Fatalf("call %d failed: %v", i, err)
		}
		if result.Status != http.StatusNoContent || result.Cached {
			t.Fatalf("call %d: expected uncached 204, got status=%d cached=%v", i, result.Status, result.Cached)
		}
	}
	if got := hits.Load(); got != 2 {
		t.Fatalf("expected 2 upstream hits, got %d", got)
	}
}
