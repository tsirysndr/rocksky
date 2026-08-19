package spotify

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
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

	// maxCooldown caps how long a single 429 Retry-After can pause upstream
	// calls, so one huge header value cannot lock the proxy out for hours.
	maxCooldown = 5 * time.Minute

	// defaultCooldown is used when a 429 comes without a usable Retry-After.
	defaultCooldown = 5 * time.Second

	janitorInterval = 10 * time.Minute
)

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

// SpotifyService is a rate-limited, caching proxy in front of the Spotify Web
// API. It is safe for concurrent use.
type SpotifyService struct {
	baseURL    string
	tokenURL   string
	httpClient *http.Client
	limiter    *rate.Limiter
	categorize func(path string) category

	clientID     string
	clientSecret string

	cache      map[string]cacheEntry
	cacheMutex sync.RWMutex

	cooldownUntil time.Time
	cooldownMutex sync.Mutex

	appToken        string
	appTokenExpires time.Time
	appTokenMutex   sync.Mutex

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

// WithCredentials sets the client-credentials pair used for catalog requests
// that arrive without a forwarded Authorization header.
func WithCredentials(clientID, clientSecret string) Option {
	return func(s *SpotifyService) {
		s.clientID = clientID
		s.clientSecret = clientSecret
	}
}

// WithCategorizer overrides cache categorization (used in tests).
func WithCategorizer(fn func(path string) category) Option {
	return func(s *SpotifyService) { s.categorize = fn }
}

// NewSpotifyService creates a new proxy service with rate limiting and caching.
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
		clientID:     os.Getenv("SPOTIFY_CLIENT_ID"),
		clientSecret: os.Getenv("SPOTIFY_CLIENT_SECRET"),
		cache:        make(map[string]cacheEntry),
		logger:       log.New(os.Stdout, "spotify: ", log.LstdFlags|log.Lmsgprefix),
	}
	for _, opt := range opts {
		opt(s)
	}
	go s.janitor()
	return s
}

// Proxy forwards one request to the Spotify Web API. GET responses are cached
// per category; during a 429 cooldown, catalog requests are served stale when
// possible instead of hitting Spotify again. Non-GET requests (player
// controls) pass straight through the limiter, uncached.
func (s *SpotifyService) Proxy(ctx context.Context, method, path, authHeader string, body []byte) (*ProxyResult, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	if method != http.MethodGet {
		if wait, coolingDown := s.cooldownRemaining(); coolingDown {
			return cooldownResult(wait), nil
		}
		return s.fetch(ctx, method, path, authHeader, body)
	}

	cat := s.categorize(path)
	key := cacheKey(path, authHeader, cat)

	if entry, ok := s.cacheGet(key); ok && time.Now().Before(entry.freshUntil) {
		return entry.response.result(false), nil
	}

	if wait, coolingDown := s.cooldownRemaining(); coolingDown {
		if entry, ok := s.cacheGet(key); ok {
			s.logger.Printf("cooldown active, serving stale response for %s", path)
			return entry.response.result(true), nil
		}
		return cooldownResult(wait), nil
	}

	result, err := s.fetch(ctx, http.MethodGet, path, authHeader, nil)
	if err != nil {
		return nil, err
	}

	switch {
	case result.Status == http.StatusOK || result.Status == http.StatusNoContent:
		s.cacheSet(key, cachedResponse{
			status:      result.Status,
			contentType: result.ContentType,
			body:        result.Body,
		}, cat)
	case result.Status == http.StatusTooManyRequests || result.Status >= 500:
		if entry, ok := s.cacheGet(key); ok {
			s.logger.Printf("upstream returned %d, serving stale response for %s", result.Status, path)
			return entry.response.result(true), nil
		}
	}

	return result, nil
}

// fetch performs one rate-limited request against the Spotify API and records
// a cooldown when Spotify answers 429.
func (s *SpotifyService) fetch(ctx context.Context, method, path, authHeader string, body []byte) (*ProxyResult, error) {
	auth, err := s.resolveAuth(ctx, path, authHeader)
	if err != nil {
		return nil, err
	}

	if err := s.limiter.Wait(ctx); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("context cancelled during rate limiter wait: %w", ctx.Err())
		}
		return nil, fmt.Errorf("rate limiter error: %w", err)
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
		s.startCooldown(result.RetryAfter)
	}
	return result, nil
}

// resolveAuth picks the Authorization value: the caller's forwarded header
// wins; catalog requests fall back to a client-credentials app token.
func (s *SpotifyService) resolveAuth(ctx context.Context, path, authHeader string) (string, error) {
	if authHeader != "" {
		return authHeader, nil
	}
	if strings.HasPrefix(path, "/me/") {
		return "", &ProxyError{
			Status:  http.StatusUnauthorized,
			Message: "user-scoped endpoints require an Authorization header",
		}
	}
	if s.clientID == "" || s.clientSecret == "" {
		return "", &ProxyError{
			Status:  http.StatusUnauthorized,
			Message: "no Authorization header and no SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET configured",
		}
	}
	token, err := s.getAppToken(ctx)
	if err != nil {
		return "", err
	}
	return "Bearer " + token, nil
}

// getAppToken returns a valid client-credentials token, refreshing it when it
// is about to expire.
func (s *SpotifyService) getAppToken(ctx context.Context) (string, error) {
	s.appTokenMutex.Lock()
	defer s.appTokenMutex.Unlock()

	if s.appToken != "" && time.Now().Before(s.appTokenExpires) {
		return s.appToken, nil
	}

	form := url.Values{"grant_type": {"client_credentials"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("failed to create token request: %w", err)
	}
	req.SetBasicAuth(s.clientID, s.clientSecret)
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

	s.appToken = token.AccessToken
	// Refresh 30 seconds before actual expiry.
	s.appTokenExpires = time.Now().Add(time.Duration(token.ExpiresIn)*time.Second - 30*time.Second)
	return s.appToken, nil
}

// startCooldown pauses upstream calls after a 429, honoring Retry-After.
func (s *SpotifyService) startCooldown(retryAfter string) {
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
	if until.After(s.cooldownUntil) {
		s.cooldownUntil = until
	}
	s.cooldownMutex.Unlock()

	s.logger.Printf("spotify returned 429, cooling down for %s", d)
}

// cooldownRemaining reports whether upstream calls are currently paused.
func (s *SpotifyService) cooldownRemaining() (time.Duration, bool) {
	s.cooldownMutex.Lock()
	defer s.cooldownMutex.Unlock()
	remaining := time.Until(s.cooldownUntil)
	return remaining, remaining > 0
}

func cooldownResult(wait time.Duration) *ProxyResult {
	return &ProxyResult{
		Status:      http.StatusTooManyRequests,
		ContentType: "application/json",
		Body:        []byte(`{"error":{"status":429,"message":"spotify proxy is cooling down after an upstream rate limit"}}`),
		RetryAfter:  strconv.Itoa(int(wait.Seconds()) + 1),
	}
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

// janitor evicts expired entries so the cache does not grow without bound.
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
	}
}

func envFloat(name string, fallback float64) float64 {
	if v := os.Getenv(name); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			return f
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
