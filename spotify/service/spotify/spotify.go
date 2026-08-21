package spotify

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/time/rate"
)

const (
	// defaultBaseURL is the Spotify Web API root.
	defaultBaseURL = "https://api.spotify.com/v1"

	// defaultTokenURL is the OAuth token endpoint used for the
	// client-credentials grant (catalog requests without a forwarded token).
	defaultTokenURL = "https://accounts.spotify.com/api/token"

	// Spotify enforces a rolling ~30 second window quota. Default to a
	// conservative sustained rate with a small burst; override with
	// SPOTIFY_PROXY_RPS / SPOTIFY_PROXY_BURST.
	defaultRPS   = 5
	defaultBurst = 10

	// maxCooldown caps how long a single 429 Retry-After can pause calls for
	// one app or token. Spotify's app-level penalties run to hours (observed
	// >5000s), and probing before Retry-After expires can extend them — so
	// honor the header up to this cap rather than retrying early.
	maxCooldown = 2 * time.Hour

	// defaultCooldown is used when a 429 comes without a usable Retry-After.
	defaultCooldown = 5 * time.Second

	// defaultMaxQueueWait bounds the total time one request may spend waiting
	// inside the proxy — for a rate limiter slot, or for a short cooldown to
	// expire — before it is answered with a 429. Without a bound the limiter
	// queue grows until clients give up, and every request ends up burning its
	// caller's full timeout before failing. Override with
	// SPOTIFY_PROXY_MAX_WAIT (seconds).
	defaultMaxQueueWait = 20 * time.Second

	// maxCooldownRetries bounds how many times one request may wait out a
	// cooldown and try again before it gives up and returns 429.
	maxCooldownRetries = 3

	janitorInterval = 10 * time.Minute
)

// errQueueFull means the proxy could not get a rate limiter slot within the
// request's queue budget. It is answered with 429, never 502: nothing reached
// Spotify, and the caller should simply come back later.
var errQueueFull = errors.New("proxy queue budget exhausted")

// category describes how responses for a path are cached.
type category struct {
	// fresh is how long a cached response is served without hitting Spotify.
	fresh time.Duration
	// stale is the extra window during which an expired response may still be
	// served when Spotify is rate limiting or erroring.
	stale time.Duration
	// perToken keys the cache by the caller's Authorization header
	// (user-scoped data must never be shared between users).
	perToken bool
}

// categorize picks cache behavior from the request path (query included).
func categorize(path string) category {
	switch {
	case strings.HasPrefix(path, "/me/"):
		// User-scoped data (currently-playing, player state) changes
		// constantly; cache just long enough to absorb tight polling loops.
		return category{fresh: 3 * time.Second, perToken: true}
	case strings.HasPrefix(path, "/search"):
		return category{fresh: time.Hour, stale: 23 * time.Hour}
	default:
		// Catalog objects (tracks, albums, artists) are effectively immutable.
		return category{fresh: 24 * time.Hour, stale: 24 * time.Hour}
	}
}

// cachedResponse is a stored upstream response.
type cachedResponse struct {
	status      int
	contentType string
	body        []byte
}

func (r cachedResponse) result(stale bool) *ProxyResult {
	return &ProxyResult{
		Status:      r.status,
		ContentType: r.contentType,
		Body:        r.body,
		Cached:      true,
		Stale:       stale,
	}
}

type cacheEntry struct {
	response   cachedResponse
	freshUntil time.Time
	evictAt    time.Time
}

// appCred is one client-credentials pair in the app pool, with its cached
// client-credentials token. Spotify rate limits per app (client id), so each
// entry is an independent quota.
type appCred struct {
	clientID     string
	clientSecret string

	mu           sync.Mutex
	token        string
	tokenExpires time.Time
}

// SpotifyService is a rate-limited, caching proxy in front of the Spotify Web
// API. It is safe for concurrent use.
type SpotifyService struct {
	baseURL    string
	tokenURL   string
	httpClient *http.Client
	limiter    *rate.Limiter
	categorize func(path string) category

	// riff answers catalog reads from the local Parquet dump before Spotify is
	// considered. nil disables it. See riff.go.
	riff    *riffClient
	riffURL string

	// maxQueueWait is how long a single request may spend queued inside the
	// proxy before it is answered with 429 instead of held open.
	maxQueueWait time.Duration

	// apps is the client-credentials pool used for catalog requests that
	// arrive without a forwarded Authorization header. Requests round-robin
	// across apps and fail over when one app is rate limited. The pool is
	// loaded from the spotify_apps table and refreshed by the janitor.
	apps      []*appCred
	appsMutex sync.RWMutex
	appCursor atomic.Uint64

	cache      map[string]cacheEntry
	cacheMutex sync.RWMutex

	// cooldowns tracks 429 backoff per app ("app:<clientID>") and per
	// forwarded token ("tok:<hash>"). A penalty on one app must not block
	// requests running under other apps or user tokens.
	cooldowns     map[string]time.Time
	cooldownMutex sync.Mutex

	logger *log.Logger
}

// Option customizes a SpotifyService.
type Option func(*SpotifyService)

// WithBaseURL overrides the Spotify API root (used in tests to point at a mock).
func WithBaseURL(baseURL string) Option {
	return func(s *SpotifyService) { s.baseURL = strings.TrimRight(baseURL, "/") }
}

// WithTokenURL overrides the OAuth token endpoint.
func WithTokenURL(tokenURL string) Option {
	return func(s *SpotifyService) { s.tokenURL = tokenURL }
}

// WithHTTPClient overrides the HTTP client.
func WithHTTPClient(c *http.Client) Option {
	return func(s *SpotifyService) { s.httpClient = c }
}

// WithLimiter overrides the rate limiter (used in tests to disable throttling).
func WithLimiter(l *rate.Limiter) Option {
	return func(s *SpotifyService) { s.limiter = l }
}

// WithCredentials replaces the app pool with a single client-credentials pair.
func WithCredentials(clientID, clientSecret string) Option {
	return func(s *SpotifyService) {
		s.apps = []*appCred{{clientID: clientID, clientSecret: clientSecret}}
	}
}

// WithApps replaces the app pool. Each pair is "clientID:clientSecret".
func WithApps(pairs ...string) Option {
	return func(s *SpotifyService) { s.apps = parseAppPairs(pairs) }
}

// WithMaxQueueWait overrides how long a request may wait for a limiter slot or
// a cooldown before the proxy answers 429.
func WithMaxQueueWait(d time.Duration) Option {
	return func(s *SpotifyService) { s.maxQueueWait = d }
}

// WithRiffURL points catalog reads at a riff instance. An empty string
// disables riff and sends everything to Spotify.
func WithRiffURL(baseURL string) Option {
	return func(s *SpotifyService) { s.riffURL = baseURL }
}

// WithCategorizer overrides cache categorization (used in tests).
func WithCategorizer(fn func(path string) category) Option {
	return func(s *SpotifyService) { s.categorize = fn }
}

// NewSpotifyService creates a new proxy service with rate limiting and caching.
// The app pool is loaded from the spotify_apps table (apps linked from active
// spotify_tokens), falling back to the SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET
// pair only when the database is unavailable.
func NewSpotifyService(opts ...Option) *SpotifyService {
	rps := envFloat("SPOTIFY_PROXY_RPS", defaultRPS)
	burst := envInt("SPOTIFY_PROXY_BURST", defaultBurst)

	s := &SpotifyService{
		baseURL:  defaultBaseURL,
		tokenURL: defaultTokenURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		limiter:      rate.NewLimiter(rate.Limit(rps), burst),
		categorize:   categorize,
		riffURL:      riffURLFromEnv(),
		maxQueueWait: envDuration("SPOTIFY_PROXY_MAX_WAIT", defaultMaxQueueWait),
		cache:        make(map[string]cacheEntry),
		cooldowns:    make(map[string]time.Time),
		logger:       log.New(os.Stdout, "spotify: ", log.LstdFlags|log.Lmsgprefix),
	}
	for _, opt := range opts {
		opt(s)
	}

	// Catalog reads go to riff first; Spotify is the fallback for what riff
	// does not have. Building the client after the options so WithRiffURL wins
	// over RIFF_URL.
	if s.riff = newRiffClient(s.riffURL, s.logger); s.riff != nil {
		s.logger.Printf("catalog reads served by riff at %s (spotify is the fallback)", s.riff.baseURL)
	} else {
		s.logger.Printf("riff disabled, all requests go to spotify")
	}

	if len(s.apps) == 0 {
		if apps, err := loadAppsFromDB(context.Background()); err != nil {
			s.logger.Printf("could not load spotify apps from db: %v", err)
		} else if len(apps) > 0 {
			s.apps = apps
			s.logger.Printf("loaded %d spotify apps from db", len(apps))
		}
	}
	if len(s.apps) == 0 {
		if id, secret := os.Getenv("SPOTIFY_CLIENT_ID"), os.Getenv("SPOTIFY_CLIENT_SECRET"); id != "" && secret != "" {
			s.apps = []*appCred{{clientID: id, clientSecret: secret}}
			s.logger.Printf("app pool empty, falling back to SPOTIFY_CLIENT_ID")
		}
	}
	go s.janitor()
	return s
}

// Proxy forwards one request to the Spotify Web API. GET responses are cached
// per category; during a 429 cooldown, requests are served stale when possible
// instead of hitting Spotify again. Cooldowns are scoped: a forwarded user
// token cools down alone, and catalog requests fail over to the next app in
// the pool.
func (s *SpotifyService) Proxy(ctx context.Context, method, path, authHeader string, body []byte) (*ProxyResult, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	isGet := method == http.MethodGet

	var cat category
	var key string
	if isGet {
		cat = s.categorize(path)
		key = cacheKey(path, authHeader, cat)
		if entry, ok := s.cacheGet(key); ok && time.Now().Before(entry.freshUntil) {
			return entry.response.result(false), nil
		}
	}

	// Catalog reads go to riff — loopback, against our own Parquet dump — and so
	// take no rate limiter slot, no cooldown and no cache entry. Only when riff
	// has nothing do we spend a Spotify request.
	//
	// This sits *after* the cache lookup on purpose. Everything in the cache got
	// there by falling back to Spotify, which means riff already missed that
	// path; asking again on every repeat would re-run a miss that, for a search,
	// is a full scan of a 255M-row parquet. The cost is that a dump refreshed
	// since the fallback is not picked up until that entry expires.
	if isGet && s.riff != nil && riffCanServe(path) {
		if result, ok := s.riff.get(ctx, path); ok {
			return result, nil
		}
	}

	// Every request gets a fixed budget for time spent waiting inside the
	// proxy, tightened to the caller's own deadline when it has one. Anything
	// that cannot be served within it is answered 429 rather than parked.
	deadline := time.Now().Add(s.maxQueueWait)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}

	if authHeader != "" {
		return s.proxyForwarded(ctx, method, path, authHeader, body, isGet, key, cat, deadline)
	}

	if strings.HasPrefix(path, "/me/") {
		return nil, &ProxyError{
			Status:  http.StatusUnauthorized,
			Message: "user-scoped endpoints require an Authorization header",
		}
	}
	apps := s.appPool()
	if len(apps) == 0 {
		return nil, &ProxyError{
			Status:  http.StatusUnauthorized,
			Message: "no Authorization header and no spotify apps available (spotify_apps table empty and no SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET fallback)",
		}
	}

	return s.proxyViaAppPool(ctx, method, path, body, isGet, key, cat, apps, deadline)
}

// proxyForwarded handles a request carrying the caller's own Authorization
// header. Its 429 cooldown is scoped to that token. A cooldown short enough to
// fit in the request's queue budget is waited out and retried; a longer one is
// reported to the caller straight away.
func (s *SpotifyService) proxyForwarded(ctx context.Context, method, path, authHeader string, body []byte, isGet bool, key string, cat category, deadline time.Time) (*ProxyResult, error) {
	ck := tokenCooldownKey(authHeader)

	for attempt := 0; ; attempt++ {
		if wait, coolingDown := s.cooldownRemaining(ck); coolingDown {
			if isGet {
				if entry, ok := s.cacheGet(key); ok {
					s.logger.Printf("cooldown active for %s, serving stale response for %s", ck, path)
					return entry.response.result(true), nil
				}
			}
			queued, err := s.waitOut(ctx, wait, deadline, attempt)
			if err != nil {
				return nil, err
			}
			if queued {
				s.logger.Printf("queued %s behind a %s cooldown for %s", ck, wait.Round(time.Millisecond), path)
				continue
			}
			return cooldownResult(wait), nil
		}

		result, err := s.fetch(ctx, method, path, authHeader, body, deadline)
		if errors.Is(err, errQueueFull) {
			if isGet {
				if entry, ok := s.cacheGet(key); ok {
					s.logger.Printf("proxy queue saturated, serving stale response for %s", path)
					return entry.response.result(true), nil
				}
			}
			return queueFullResult(), nil
		}
		if err != nil {
			return nil, err
		}

		switch {
		case result.Status == http.StatusOK || result.Status == http.StatusNoContent:
			if isGet {
				s.cacheSet(key, cachedResponse{
					status:      result.Status,
					contentType: result.ContentType,
					body:        result.Body,
				}, cat)
			}
		case result.Status == http.StatusTooManyRequests:
			s.startCooldown(ck, result.RetryAfter)
			if isGet {
				if entry, ok := s.cacheGet(key); ok {
					s.logger.Printf("upstream returned 429, serving stale response for %s", path)
					return entry.response.result(true), nil
				}
			}
			// A short Retry-After is worth waiting out here rather than
			// bouncing the caller, which would only retry anyway.
			wait, _ := s.cooldownRemaining(ck)
			queued, err := s.waitOut(ctx, wait, deadline, attempt)
			if err != nil {
				return nil, err
			}
			if queued {
				continue
			}
		case result.Status >= 500:
			if isGet {
				if entry, ok := s.cacheGet(key); ok {
					s.logger.Printf("upstream returned %d, serving stale response for %s", result.Status, path)
					return entry.response.result(true), nil
				}
			}
		}

		return result, nil
	}
}

// proxyViaAppPool handles a catalog request with no forwarded token: it walks
// the app pool round-robin, skipping apps in cooldown and failing over to the
// next app when one answers 429. When the whole pool is cooling down, the
// request queues until the earliest app frees up and walks the pool again —
// as long as that fits inside its queue budget.
func (s *SpotifyService) proxyViaAppPool(ctx context.Context, method, path string, body []byte, isGet bool, key string, cat category, apps []*appCred, deadline time.Time) (*ProxyResult, error) {
	n := len(apps)
	var lastErr error

	for attempt := 0; ; attempt++ {
		start := int(s.appCursor.Add(1)-1) % n
		minWait := time.Duration(-1)

		for i := 0; i < n; i++ {
			app := apps[(start+i)%n]
			ck := appCooldownKey(app.clientID)
			if wait, coolingDown := s.cooldownRemaining(ck); coolingDown {
				if minWait < 0 || wait < minWait {
					minWait = wait
				}
				continue
			}

			token, err := s.getAppToken(ctx, app)
			if err != nil {
				// Bad credentials or token endpoint trouble: remember the error
				// and let another app try.
				lastErr = err
				continue
			}

			result, err := s.fetch(ctx, method, path, "Bearer "+token, body, deadline)
			if errors.Is(err, errQueueFull) {
				if isGet {
					if entry, ok := s.cacheGet(key); ok {
						s.logger.Printf("proxy queue saturated, serving stale response for %s", path)
						return entry.response.result(true), nil
					}
				}
				return queueFullResult(), nil
			}
			if err != nil {
				return nil, err
			}

			if result.Status == http.StatusTooManyRequests {
				s.startCooldown(ck, result.RetryAfter)
				if wait, _ := s.cooldownRemaining(ck); minWait < 0 || wait < minWait {
					minWait = wait
				}
				continue
			}

			switch {
			case result.Status == http.StatusOK || result.Status == http.StatusNoContent:
				if isGet {
					s.cacheSet(key, cachedResponse{
						status:      result.Status,
						contentType: result.ContentType,
						body:        result.Body,
					}, cat)
				}
			case result.Status >= 500:
				if isGet {
					if entry, ok := s.cacheGet(key); ok {
						s.logger.Printf("upstream returned %d, serving stale response for %s", result.Status, path)
						return entry.response.result(true), nil
					}
				}
			}

			return result, nil
		}

		// Every app is cooling down or failed to authenticate.
		if isGet {
			if entry, ok := s.cacheGet(key); ok {
				s.logger.Printf("all %d apps cooling down, serving stale response for %s", n, path)
				return entry.response.result(true), nil
			}
		}
		if minWait < 0 {
			if lastErr != nil {
				return nil, lastErr
			}
			minWait = defaultCooldown
		}

		queued, err := s.waitOut(ctx, minWait, deadline, attempt)
		if err != nil {
			return nil, err
		}
		if !queued {
			return cooldownResult(minWait), nil
		}
		s.logger.Printf("all %d apps cooling down, queued %s for %s", n, minWait.Round(time.Millisecond), path)
	}
}

// fetch performs one rate-limited request against the Spotify API with the
// given Authorization value. It records no cooldown itself — callers scope
// that to the app or token that made the request.
func (s *SpotifyService) fetch(ctx context.Context, method, path, auth string, body []byte, deadline time.Time) (*ProxyResult, error) {
	if err := s.waitForSlot(ctx, deadline); err != nil {
		return nil, err
	}

	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, s.baseURL+path, reader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", auth)
	req.Header.Set("Accept", "application/json")
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("context error during request execution: %w", ctx.Err())
		}
		return nil, fmt.Errorf("failed to execute request to %s: %w", path, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body from %s: %w", path, err)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}

	result := &ProxyResult{Status: resp.StatusCode, ContentType: contentType, Body: data}
	if resp.StatusCode == http.StatusTooManyRequests {
		result.RetryAfter = resp.Header.Get("Retry-After")
	}
	return result, nil
}

// waitForSlot blocks until the rate limiter admits this request, bounded by the
// request's queue budget. Past that point the caller gets an immediate 429
// instead of a connection held open until it times out — an unbounded limiter
// queue simply converts load into a wall of client timeouts.
func (s *SpotifyService) waitForSlot(ctx context.Context, deadline time.Time) error {
	waitCtx, cancel := context.WithDeadline(ctx, deadline)
	defer cancel()

	if err := s.limiter.Wait(waitCtx); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("caller went away while waiting for a rate limiter slot: %w", ctx.Err())
		}
		return errQueueFull
	}
	return nil
}

// waitOut queues a request behind an active cooldown, but only when the wait
// fits in what is left of its budget and it has not already retried too often.
// It reports whether it waited (so the caller should try again); false means
// answer the caller now rather than sit on the connection.
func (s *SpotifyService) waitOut(ctx context.Context, wait time.Duration, deadline time.Time, attempt int) (bool, error) {
	if attempt >= maxCooldownRetries {
		return false, nil
	}
	if wait <= 0 {
		return true, nil
	}
	if time.Now().Add(wait).After(deadline) {
		return false, nil
	}

	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-timer.C:
		return true, nil
	case <-ctx.Done():
		return false, fmt.Errorf("caller went away while queued behind a cooldown: %w", ctx.Err())
	}
}

// getAppToken returns a valid client-credentials token for one app,
// refreshing it when it is about to expire.
func (s *SpotifyService) getAppToken(ctx context.Context, app *appCred) (string, error) {
	app.mu.Lock()
	defer app.mu.Unlock()

	if app.token != "" && time.Now().Before(app.tokenExpires) {
		return app.token, nil
	}

	form := url.Values{"grant_type": {"client_credentials"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("failed to create token request: %w", err)
	}
	req.SetBasicAuth(app.clientID, app.clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute token request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read token response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token request returned status %d: %s", resp.StatusCode, body)
	}

	var token tokenResponse
	if err := json.Unmarshal(body, &token); err != nil {
		return "", fmt.Errorf("failed to decode token response: %w", err)
	}
	if token.AccessToken == "" {
		return "", fmt.Errorf("token response contained no access_token")
	}

	app.token = token.AccessToken
	// Refresh 30 seconds before actual expiry.
	app.tokenExpires = time.Now().Add(time.Duration(token.ExpiresIn)*time.Second - 30*time.Second)
	return app.token, nil
}

// startCooldown pauses one app or token after a 429, honoring Retry-After.
func (s *SpotifyService) startCooldown(key, retryAfter string) {
	seconds, err := strconv.Atoi(strings.TrimSpace(retryAfter))
	d := defaultCooldown
	if err == nil && seconds > 0 {
		d = time.Duration(seconds) * time.Second
	}
	if d > maxCooldown {
		d = maxCooldown
	}

	s.cooldownMutex.Lock()
	until := time.Now().Add(d)
	if until.After(s.cooldowns[key]) {
		s.cooldowns[key] = until
	}
	s.cooldownMutex.Unlock()

	s.logger.Printf("spotify returned 429 (Retry-After: %q) for %s, cooling down for %s", retryAfter, key, d)
}

// cooldownRemaining reports whether calls for one app or token are paused.
func (s *SpotifyService) cooldownRemaining(key string) (time.Duration, bool) {
	s.cooldownMutex.Lock()
	defer s.cooldownMutex.Unlock()
	remaining := time.Until(s.cooldowns[key])
	return remaining, remaining > 0
}

// queueFullResult tells the caller the proxy itself is saturated. It is a 429
// rather than a 5xx so the Retry-After handling clients already have applies,
// and so a local queue problem is never mistaken for Spotify being down.
func queueFullResult() *ProxyResult {
	return &ProxyResult{
		Status:      http.StatusTooManyRequests,
		ContentType: "application/json",
		Body:        []byte(`{"error":{"status":429,"message":"spotify proxy request queue is saturated"}}`),
		RetryAfter:  strconv.Itoa(int(defaultCooldown.Seconds())),
	}
}

func cooldownResult(wait time.Duration) *ProxyResult {
	return &ProxyResult{
		Status:      http.StatusTooManyRequests,
		ContentType: "application/json",
		Body:        []byte(`{"error":{"status":429,"message":"spotify proxy is cooling down after an upstream rate limit"}}`),
		RetryAfter:  strconv.Itoa(int(wait.Seconds()) + 1),
	}
}

// appCooldownKey scopes a cooldown to one client-credentials app.
func appCooldownKey(clientID string) string {
	return "app:" + truncate(clientID, 8)
}

// tokenCooldownKey scopes a cooldown to one forwarded Authorization header.
func tokenCooldownKey(authHeader string) string {
	sum := sha256.Sum256([]byte(authHeader))
	return "tok:" + hex.EncodeToString(sum[:8])
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// cacheKey builds the cache key; user-scoped entries include a hash of the
// caller's Authorization header so tokens never share responses.
func cacheKey(path, authHeader string, cat category) string {
	if cat.perToken {
		sum := sha256.Sum256([]byte(authHeader))
		return path + "|" + hex.EncodeToString(sum[:8])
	}
	return path
}

// cacheGet returns an entry that has not been evicted yet (it may be stale;
// the caller checks freshUntil).
func (s *SpotifyService) cacheGet(key string) (cacheEntry, bool) {
	s.cacheMutex.RLock()
	entry, found := s.cache[key]
	s.cacheMutex.RUnlock()
	if found && time.Now().Before(entry.evictAt) {
		return entry, true
	}
	return cacheEntry{}, false
}

// cacheSet stores a response with its category's fresh + stale windows.
func (s *SpotifyService) cacheSet(key string, response cachedResponse, cat category) {
	now := time.Now()
	s.cacheMutex.Lock()
	s.cache[key] = cacheEntry{
		response:   response,
		freshUntil: now.Add(cat.fresh),
		evictAt:    now.Add(cat.fresh + cat.stale),
	}
	s.cacheMutex.Unlock()
}

// appPool returns a snapshot of the current app pool.
func (s *SpotifyService) appPool() []*appCred {
	s.appsMutex.RLock()
	defer s.appsMutex.RUnlock()
	return s.apps
}

// refreshApps reloads the pool from the database, keeping existing appCred
// instances (and their cached client-credentials tokens) for apps that are
// still present.
func (s *SpotifyService) refreshApps() {
	loaded, err := loadAppsFromDB(context.Background())
	if err != nil || len(loaded) == 0 {
		return
	}

	s.appsMutex.Lock()
	existing := make(map[string]*appCred, len(s.apps))
	for _, app := range s.apps {
		existing[app.clientID] = app
	}
	merged := make([]*appCred, 0, len(loaded))
	changed := len(loaded) != len(s.apps)
	for _, app := range loaded {
		if prev, ok := existing[app.clientID]; ok {
			merged = append(merged, prev)
		} else {
			merged = append(merged, app)
			changed = true
		}
	}
	s.apps = merged
	s.appsMutex.Unlock()

	if changed {
		s.logger.Printf("refreshed spotify app pool: %d apps", len(merged))
	}
}

// janitor evicts expired cache entries and elapsed cooldowns so neither map
// grows without bound, and refreshes the app pool from the database.
func (s *SpotifyService) janitor() {
	ticker := time.NewTicker(janitorInterval)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		s.cacheMutex.Lock()
		for key, entry := range s.cache {
			if now.After(entry.evictAt) {
				delete(s.cache, key)
			}
		}
		s.cacheMutex.Unlock()

		s.cooldownMutex.Lock()
		for key, until := range s.cooldowns {
			if now.After(until) {
				delete(s.cooldowns, key)
			}
		}
		s.cooldownMutex.Unlock()

		s.refreshApps()
	}
}

func parseAppPairs(pairs []string) []*appCred {
	var apps []*appCred
	for _, pair := range pairs {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		id, secret, ok := strings.Cut(pair, ":")
		if !ok || id == "" || secret == "" {
			continue
		}
		apps = append(apps, &appCred{clientID: id, clientSecret: secret})
	}
	return apps
}

func envFloat(name string, fallback float64) float64 {
	if v := os.Getenv(name); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			return f
		}
	}
	return fallback
}

// envDuration reads a duration given in whole seconds.
func envDuration(name string, fallback time.Duration) time.Duration {
	if v := os.Getenv(name); v != "" {
		if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return fallback
}

func envInt(name string, fallback int) int {
	if v := os.Getenv(name); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i > 0 {
			return i
		}
	}
	return fallback
}
