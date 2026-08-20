package deezer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	// defaultBaseURL is the public Deezer API root.
	defaultBaseURL = "https://api.deezer.com"

	// Deezer's documented quota is 50 requests per 5 seconds per IP, counted
	// over a rolling window at their edge. We stay a few requests under it:
	// their clock is not ours, and a request we consider spent at T may land
	// slightly later. Override with DEEZER_RATE_LIMIT.
	rateLimitWindow   = 5 * time.Second
	rateLimitRequests = 45

	// defaultCacheTTL is how long search / lookup responses stay cached.
	defaultCacheTTL = 1 * time.Hour

	// failureCacheTTL is how long an upstream failure stays cached. Without it
	// a blocked or quota-exhausted upstream is re-asked the same question by
	// every scrobble that follows, and the quota never recovers.
	failureCacheTTL = 90 * time.Second

	// defaultMaxQueueWait bounds the total time one /enrich may spend queued
	// for rate limiter slots before it is answered with 429. Deezer's window is
	// 5s, so this leaves room for several windows of backlog while still
	// answering long before the caller's own timeout. Override with
	// DEEZER_MAX_WAIT (seconds).
	defaultMaxQueueWait = 20 * time.Second

	// Breaker tuning: five consecutive upstream failures pause outbound calls,
	// starting at 15s and doubling per failed probe up to 5 minutes.
	breakerThreshold    = 5
	breakerBaseCooldown = 15 * time.Second
	breakerMaxCooldown  = 5 * time.Minute

	// maxMatches caps how many ranked candidates we return to callers.
	maxMatches = 10

	// enrichScoreFloor is the score below which a candidate is not worth
	// spending deep-fetch calls on.
	enrichScoreFloor = 0.5

	// janitorInterval is how often expired cache entries are evicted.
	janitorInterval = 10 * time.Minute
)

// errQueueFull means we could not get a rate limiter slot inside the request's
// queue budget. Nothing reached Deezer, so it is answered with 429 and never
// with a 5xx: the caller should simply come back later.
var errQueueFull = errors.New("deezer request queue budget exhausted")

// UpstreamError carries the status the handler should answer with, so that a
// saturated local queue (429) and Deezer refusing us outright (503) are never
// reported as the same thing as a genuine upstream failure (502).
type UpstreamError struct {
	// Status is what we answer our own caller with.
	Status int
	// Upstream is the status Deezer returned, or 0 when we never reached it.
	Upstream int
	// RetryAfter, when non-zero, is how long the caller should wait.
	RetryAfter time.Duration
	Message    string
}

func (e *UpstreamError) Error() string { return e.Message }

// cacheEntry holds an arbitrary decoded payload, or the failure that stands in
// for it, with its expiration.
type cacheEntry struct {
	value     any
	err       error
	expiresAt time.Time
}

// DeezerService talks to the Deezer API with rate limiting and an in-memory
// TTL cache. It is safe for concurrent use.
type DeezerService struct {
	baseURL    string
	httpClient *http.Client
	limiter    *WindowLimiter
	breaker    *breaker
	cache      map[string]cacheEntry
	cacheMutex sync.RWMutex
	cacheTTL   time.Duration
	logger     *log.Logger

	// maxQueueWait is how long one request may stay queued for limiter slots
	// before it is answered with 429 instead of held open.
	maxQueueWait time.Duration

	// group collapses concurrent identical lookups into one upstream call.
	// Scrobbles arrive in bursts of the same album, so without it the same
	// query is asked several times over while the first answer is in flight.
	group singleflight.Group
}

// Option customizes a DeezerService.
type Option func(*DeezerService)

// WithBaseURL overrides the Deezer API root (used in tests to point at a mock).
func WithBaseURL(baseURL string) Option {
	return func(s *DeezerService) { s.baseURL = strings.TrimRight(baseURL, "/") }
}

// WithCacheTTL overrides the cache time-to-live.
func WithCacheTTL(ttl time.Duration) Option {
	return func(s *DeezerService) { s.cacheTTL = ttl }
}

// WithHTTPClient overrides the HTTP client.
func WithHTTPClient(c *http.Client) Option {
	return func(s *DeezerService) { s.httpClient = c }
}

// WithLimiter overrides the rate limiter (used in tests to disable throttling).
func WithLimiter(l *WindowLimiter) Option {
	return func(s *DeezerService) { s.limiter = l }
}

// WithMaxQueueWait overrides how long a request may wait for limiter slots
// before the service answers 429.
func WithMaxQueueWait(d time.Duration) Option {
	return func(s *DeezerService) { s.maxQueueWait = d }
}

// NewDeezerService creates a new service with rate limiting and caching.
func NewDeezerService(opts ...Option) *DeezerService {
	s := &DeezerService{
		baseURL: defaultBaseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		limiter:      NewWindowLimiter(envInt("DEEZER_RATE_LIMIT", rateLimitRequests), rateLimitWindow),
		breaker:      newBreaker(breakerThreshold, breakerBaseCooldown, breakerMaxCooldown),
		cache:        make(map[string]cacheEntry),
		cacheTTL:     defaultCacheTTL,
		maxQueueWait: envDuration("DEEZER_MAX_WAIT", defaultMaxQueueWait),
		logger:       log.New(os.Stdout, "deezer: ", log.LstdFlags|log.Lmsgprefix),
	}
	for _, opt := range opts {
		opt(s)
	}
	go s.janitor()
	return s
}

// cacheGet returns a cached, non-expired value, or the cached failure that
// stands in for it.
func (s *DeezerService) cacheGet(key string) (any, error, bool) {
	s.cacheMutex.RLock()
	entry, found := s.cache[key]
	s.cacheMutex.RUnlock()
	if found && time.Now().UTC().Before(entry.expiresAt) {
		return entry.value, entry.err, true
	}
	return nil, nil, false
}

// cacheSet stores a value with the configured TTL.
func (s *DeezerService) cacheSet(key string, value any) {
	s.cacheMutex.Lock()
	s.cache[key] = cacheEntry{value: value, expiresAt: time.Now().UTC().Add(s.cacheTTL)}
	s.cacheMutex.Unlock()
}

// cacheFailure remembers an upstream failure for a short while so the same
// question is not put to a failing upstream over and over. Local queue and
// breaker rejections are not cached: nothing was learned about the answer, only
// about our own backlog.
func (s *DeezerService) cacheFailure(key string, err error) {
	var upstream *UpstreamError
	if errors.Is(err, errQueueFull) || errors.Is(err, context.Canceled) ||
		errors.Is(err, context.DeadlineExceeded) ||
		(errors.As(err, &upstream) && upstream.Upstream == 0) {
		return
	}

	ttl := failureCacheTTL
	if ttl > s.cacheTTL {
		ttl = s.cacheTTL
	}
	s.cacheMutex.Lock()
	s.cache[key] = cacheEntry{err: err, expiresAt: time.Now().UTC().Add(ttl)}
	s.cacheMutex.Unlock()
}

// janitor evicts expired entries so the cache does not grow without bound. The
// map is only ever written under the lock, so a periodic sweep is enough.
func (s *DeezerService) janitor() {
	ticker := time.NewTicker(janitorInterval)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now().UTC()
		s.cacheMutex.Lock()
		for key, entry := range s.cache {
			if now.After(entry.expiresAt) {
				delete(s.cache, key)
			}
		}
		s.cacheMutex.Unlock()
	}
}

// queueBudgetKey scopes one queue budget to one inbound request.
type queueBudgetKey struct{}

// withQueueBudget stamps a single deadline on the whole enrich fan-out. One
// /enrich costs several upstream calls; without a shared budget each of them
// would get its own, and a saturated queue would hold the caller for the sum.
func withQueueBudget(ctx context.Context, d time.Duration) context.Context {
	return context.WithValue(ctx, queueBudgetKey{}, time.Now().Add(d))
}

// queueDeadline is the point past which this request stops waiting, clamped to
// the caller's own deadline so we never queue past the point anyone is
// listening for the answer.
func (s *DeezerService) queueDeadline(ctx context.Context) time.Time {
	deadline, ok := ctx.Value(queueBudgetKey{}).(time.Time)
	if !ok {
		deadline = time.Now().Add(s.maxQueueWait)
	}
	if caller, ok := ctx.Deadline(); ok && caller.Before(deadline) {
		return caller
	}
	return deadline
}

// get performs a queued, rate-limited, breaker-guarded GET against the Deezer
// API and decodes the JSON body into out. Deezer signals errors with an "error"
// envelope and a 200 status, so we sniff for that too.
//
// Every failure that actually reached Deezer counts against the breaker; a
// local rejection (queue budget spent, caller gone) never does.
func (s *DeezerService) get(ctx context.Context, path string, out any) error {
	endpoint := s.baseURL + path

	// Check the breaker before queueing: when Deezer is refusing us there is no
	// point spending 20 seconds of budget to find that out again.
	allowed, probe, cooldown := s.breaker.allow(time.Now())
	if !allowed {
		return &UpstreamError{
			Status:     http.StatusServiceUnavailable,
			RetryAfter: cooldown,
			Message: fmt.Sprintf("deezer is unavailable, cooling down for another %s",
				cooldown.Round(time.Second)),
		}
	}

	if err := s.limiter.Wait(ctx, s.queueDeadline(ctx)); err != nil {
		if probe {
			s.breaker.abandon()
		}
		if ctx.Err() != nil {
			return fmt.Errorf("caller went away while queued for a rate limiter slot: %w", ctx.Err())
		}
		return &UpstreamError{
			Status:     http.StatusTooManyRequests,
			RetryAfter: rateLimitWindow,
			Message:    err.Error(),
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		if probe {
			s.breaker.abandon()
		}
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "rocksky-deezer/0.1.0 ( https://github.com/tsirysndr/rocksky )")
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			if probe {
				s.breaker.abandon()
			}
			return fmt.Errorf("caller went away during request execution: %w", ctx.Err())
		}
		return s.recordFailure(&UpstreamError{
			Status:  http.StatusBadGateway,
			Message: fmt.Sprintf("failed to execute request to %s: %v", endpoint, err),
		})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return s.recordFailure(&UpstreamError{
			Status:     http.StatusBadGateway,
			Upstream:   resp.StatusCode,
			RetryAfter: parseRetryAfter(resp.Header.Get("Retry-After")),
			Message: fmt.Sprintf("deezer API request to %s returned status %d",
				endpoint, resp.StatusCode),
		})
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return s.recordFailure(&UpstreamError{
			Status:   http.StatusBadGateway,
			Upstream: resp.StatusCode,
			Message:  fmt.Sprintf("failed to read response body from %s: %v", endpoint, err),
		})
	}

	// Deezer returns { "error": {...} } with HTTP 200 for quota / bad requests.
	var apiErr DeezerAPIError
	if err := json.Unmarshal(body, &apiErr); err == nil && apiErr.Error != nil {
		return s.recordFailure(&UpstreamError{
			Status:   http.StatusBadGateway,
			Upstream: resp.StatusCode,
			Message: fmt.Sprintf("deezer API error (code %d, type %s): %s",
				apiErr.Error.Code, apiErr.Error.Type, apiErr.Error.Message),
		})
	}

	if err := json.Unmarshal(body, out); err != nil {
		return s.recordFailure(&UpstreamError{
			Status:   http.StatusBadGateway,
			Upstream: resp.StatusCode,
			Message:  fmt.Sprintf("failed to decode response from %s: %v", endpoint, err),
		})
	}

	s.breaker.success()
	return nil
}

// recordFailure counts one upstream failure against the breaker and logs the
// cooldown when it trips. The error is returned unchanged so callers can keep
// wrapping it.
func (s *DeezerService) recordFailure(err *UpstreamError) error {
	if cooldown, opened := s.breaker.failure(time.Now(), err.RetryAfter); opened {
		s.logger.Printf("pausing deezer calls for %s after: %s", cooldown.Round(time.Second), err.Message)
	} else {
		s.logger.Printf("upstream failure: %s", err.Message)
	}
	return err
}

// parseRetryAfter reads the delta-seconds form of Retry-After. The HTTP-date
// form is rare and the breaker has its own backoff, so an unparseable value
// simply yields zero.
func parseRetryAfter(value string) time.Duration {
	seconds, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || seconds <= 0 {
		return 0
	}
	return time.Duration(seconds) * time.Second
}

// Search queries the Deezer catalogue for candidate tracks. Results are cached
// by their normalized query key.
func (s *DeezerService) Search(ctx context.Context, params SearchParams) ([]DeezerTrack, error) {
	if strings.TrimSpace(params.Title) == "" && strings.TrimSpace(params.Artist) == "" {
		return nil, fmt.Errorf("at least one of title or artist must be provided")
	}

	query := buildSearchQuery(params)
	cacheKey := "search:" + query

	if cached, cachedErr, ok := s.cacheGet(cacheKey); ok {
		s.logger.Printf("cache hit for search: %q", query)
		if cachedErr != nil {
			return nil, cachedErr
		}
		return cached.([]DeezerTrack), nil
	}

	value, err := s.fetchCached(cacheKey, func() (any, error) {
		s.logger.Printf("cache miss for search: %q", query)

		var result DeezerSearchResponse
		path := "/search?q=" + url.QueryEscape(query)
		if err := s.get(ctx, path, &result); err != nil {
			return nil, err
		}

		// Deezer's advanced query is strict; if it returns nothing, retry with
		// a looser free-text query so misspelled/decorated titles still match.
		if len(result.Data) == 0 {
			loose := strings.TrimSpace(params.Title + " " + params.Artist)
			var loosely DeezerSearchResponse
			if err := s.get(ctx, "/search?q="+url.QueryEscape(loose), &loosely); err == nil {
				result.Data = loosely.Data
			}
		}
		return result.Data, nil
	})
	if err != nil {
		return nil, err
	}
	return value.([]DeezerTrack), nil
}

// fetchCached serves key from the cache, or runs fetch exactly once on behalf
// of every caller currently asking the same question. Successes are cached for
// the configured TTL, upstream failures for the much shorter failure TTL.
func (s *DeezerService) fetchCached(key string, fetch func() (any, error)) (any, error) {
	if value, err, ok := s.cacheGet(key); ok {
		return value, err
	}

	return withSingleflight(s.group.Do(key, func() (any, error) {
		// Another caller may have filled the entry while we waited our turn.
		if value, err, ok := s.cacheGet(key); ok {
			return value, err
		}
		value, err := fetch()
		if err != nil {
			s.cacheFailure(key, err)
			return nil, err
		}
		s.cacheSet(key, value)
		return value, nil
	}))
}

// withSingleflight drops singleflight's "shared" flag, which we do not use.
func withSingleflight(value any, err error, _ bool) (any, error) {
	return value, err
}

// GetTrack fetches the full track object by Deezer ID (includes ISRC, disk /
// track position, release date and contributors).
func (s *DeezerService) GetTrack(ctx context.Context, id int64) (*DeezerTrack, error) {
	value, err := s.fetchCached("track:"+strconv.FormatInt(id, 10), func() (any, error) {
		var track DeezerTrack
		if err := s.get(ctx, "/track/"+strconv.FormatInt(id, 10), &track); err != nil {
			return nil, err
		}
		return track, nil
	})
	if err != nil {
		return nil, err
	}
	track := value.(DeezerTrack)
	return &track, nil
}

// GetAlbum fetches the full album object by Deezer ID (includes label, genres
// and UPC).
func (s *DeezerService) GetAlbum(ctx context.Context, id int64) (*DeezerAlbum, error) {
	value, err := s.fetchCached("album:"+strconv.FormatInt(id, 10), func() (any, error) {
		var album DeezerAlbum
		if err := s.get(ctx, "/album/"+strconv.FormatInt(id, 10), &album); err != nil {
			return nil, err
		}
		return album, nil
	})
	if err != nil {
		return nil, err
	}
	album := value.(DeezerAlbum)
	return &album, nil
}

// GetArtist fetches the full artist object by Deezer ID (includes picture).
func (s *DeezerService) GetArtist(ctx context.Context, id int64) (*DeezerArtist, error) {
	value, err := s.fetchCached("artist:"+strconv.FormatInt(id, 10), func() (any, error) {
		var artist DeezerArtist
		if err := s.get(ctx, "/artist/"+strconv.FormatInt(id, 10), &artist); err != nil {
			return nil, err
		}
		return artist, nil
	})
	if err != nil {
		return nil, err
	}
	artist := value.(DeezerArtist)
	return &artist, nil
}

// rankedCandidate pairs a track with its score for sorting.
type rankedCandidate struct {
	track DeezerTrack
	score float64
}

// rankCandidates scores and sorts search results best-first.
func rankCandidates(params SearchParams, tracks []DeezerTrack) []rankedCandidate {
	ranked := make([]rankedCandidate, 0, len(tracks))
	for _, t := range tracks {
		ranked = append(ranked, rankedCandidate{track: t, score: scoreCandidate(params, t)})
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].score != ranked[j].score {
			return ranked[i].score > ranked[j].score
		}
		// Tie-break on Deezer rank (popularity), then ID for determinism.
		if ranked[i].track.Rank != ranked[j].track.Rank {
			return ranked[i].track.Rank > ranked[j].track.Rank
		}
		return ranked[i].track.ID < ranked[j].track.ID
	})
	return ranked
}

// toMatch converts a scored Deezer track into the lightweight Match shape.
// TrackNumber / DiscNumber are only present when the seed track has already
// been deep-fetched (the /search endpoint omits them); hydrateMatches fills
// them in afterwards.
func toMatch(c rankedCandidate) Match {
	t := c.track
	return Match{
		ID:          t.ID,
		Title:       t.Title,
		Artist:      t.Artist.Name,
		Album:       t.Album.Title,
		AlbumArt:    bestCover(t.Album),
		ISRC:        t.ISRC,
		DurationMs:  int64(t.Duration) * 1000,
		TrackNumber: t.TrackPosition,
		DiscNumber:  t.DiskNumber,
		Link:        t.Link,
		Preview:     t.Preview,
		Rank:        t.Rank,
		Explicit:    t.ExplicitLyrics,
		Score:       c.score,
	}
}

// matchHydrateConcurrency bounds how many match deep-fetches run at once. The
// Deezer limiter still governs the overall request rate; this just caps the
// number of in-flight goroutines.
const matchHydrateConcurrency = 5

// maxHydratedMatches caps how many top-ranked matches we deep-fetch to backfill
// track position / disc number. Each deep-fetch costs an extra API call out of a
// fixed per-window quota, so we only spend them on the most relevant
// candidates: one /enrich already costs a search plus up to three lookups for
// the best match, and every call beyond that is throughput taken from the next
// scrobble in the queue.
const maxHydratedMatches = 3

// hydrateMatches deep-fetches the full track for the top maxHydratedMatches
// matches to fill in the track position and disc number, which the /search
// endpoint does not return. GetTrack is cached, so repeated calls (e.g. the top
// match that Enrich also hydrates) are cheap. Failures leave the match's
// numbers at 0.
func (s *DeezerService) hydrateMatches(ctx context.Context, matches []Match) {
	if len(matches) == 0 {
		return
	}

	limit := min(len(matches), maxHydratedMatches)
	sem := make(chan struct{}, matchHydrateConcurrency)
	var wg sync.WaitGroup
	for i := range matches[:limit] {
		if matches[i].ID == 0 || (matches[i].TrackNumber != 0 && matches[i].DiscNumber != 0) {
			continue
		}
		// A candidate this weak is not going to be picked, so its track and
		// disc numbers are not worth a call out of the window.
		if matches[i].Score < enrichScoreFloor {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(i int) {
			defer wg.Done()
			defer func() { <-sem }()
			full, err := s.GetTrack(ctx, matches[i].ID)
			if err != nil || full == nil {
				if err != nil {
					s.logger.Printf("match deep-fetch failed for id=%d: %v", matches[i].ID, err)
				}
				return
			}
			matches[i].TrackNumber = full.TrackPosition
			matches[i].DiscNumber = full.DiskNumber
		}(i)
	}
	wg.Wait()
}

// Enrich searches for the track, ranks candidates, deep-fetches the best one to
// hydrate its full metadata, and returns both the enriched track and the ranked
// match list.
func (s *DeezerService) Enrich(ctx context.Context, params SearchParams) (*EnrichResponse, error) {
	// One budget for the whole fan-out: the search and every deep-fetch below
	// share it, so a backlogged queue delays the caller once rather than once
	// per upstream call.
	ctx = withQueueBudget(ctx, s.maxQueueWait)

	tracks, err := s.Search(ctx, params)
	if err != nil {
		return nil, err
	}

	ranked := rankCandidates(params, tracks)

	matches := make([]Match, 0, min(len(ranked), maxMatches))
	for i, c := range ranked {
		if i >= maxMatches {
			break
		}
		matches = append(matches, toMatch(c))
	}

	// Search results omit track_position / disk_number, so deep-fetch each match
	// to backfill them before returning.
	s.hydrateMatches(ctx, matches)

	resp := &EnrichResponse{Matches: matches}
	if len(ranked) == 0 {
		return resp, nil
	}

	best := ranked[0]
	// Only spend deep-fetch API calls when the top candidate is plausible.
	if best.score < enrichScoreFloor {
		resp.Track = s.buildEnrichedFromSearch(best.track)
		return resp, nil
	}

	resp.Track = s.hydrate(ctx, best.track)
	return resp, nil
}

// hydrate deep-fetches the full track + album (+ artist picture) to fill every
// available field, falling back to the search-result data on any failure.
func (s *DeezerService) hydrate(ctx context.Context, seed DeezerTrack) *EnrichedTrack {
	track := seed
	if full, err := s.GetTrack(ctx, seed.ID); err == nil && full != nil {
		track = *full
		// The full track's album lacks label/genres, so keep the richer album
		// filled in below; carry over the search cover if the full one is empty.
		if track.Album.Cover == "" {
			track.Album.Cover = seed.Album.Cover
		}
	} else if err != nil {
		s.logger.Printf("track deep-fetch failed for id=%d: %v", seed.ID, err)
	}

	enriched := s.buildEnrichedFromSearch(track)

	// Album deep-fetch for label / genres / UPC / release date.
	if track.Album.ID != 0 {
		if album, err := s.GetAlbum(ctx, track.Album.ID); err == nil && album != nil {
			if album.Label != "" {
				enriched.Label = album.Label
			}
			if album.UPC != "" {
				enriched.UPC = album.UPC
			}
			if len(album.Genres.Data) > 0 {
				genres := make([]string, 0, len(album.Genres.Data))
				for _, g := range album.Genres.Data {
					if g.Name != "" {
						genres = append(genres, g.Name)
					}
				}
				enriched.Genres = genres
			}
			if enriched.ReleaseDate == "" && album.ReleaseDate != "" {
				enriched.ReleaseDate = album.ReleaseDate
				enriched.Year = yearFromDate(album.ReleaseDate)
			}
			if art := bestCover(*album); art != "" {
				enriched.AlbumArt = art
			}
		} else if err != nil {
			s.logger.Printf("album deep-fetch failed for id=%d: %v", track.Album.ID, err)
		}
	}

	// Artist picture deep-fetch when the embedded artist has none.
	if enriched.ArtistPicture == "" && track.Artist.ID != 0 {
		if artist, err := s.GetArtist(ctx, track.Artist.ID); err == nil && artist != nil {
			enriched.ArtistPicture = bestPicture(*artist)
		}
	}

	return enriched
}

// buildEnrichedFromSearch maps a (possibly shallow) Deezer track to the
// normalized EnrichedTrack shape without extra network calls.
func (s *DeezerService) buildEnrichedFromSearch(t DeezerTrack) *EnrichedTrack {
	enriched := &EnrichedTrack{
		Title:          t.Title,
		Artist:         t.Artist.Name,
		AlbumArtist:    t.Artist.Name,
		Album:          t.Album.Title,
		AlbumArt:       bestCover(t.Album),
		ISRC:           t.ISRC,
		DurationMs:     int64(t.Duration) * 1000,
		TrackNumber:    t.TrackPosition,
		DiscNumber:     t.DiskNumber,
		ReleaseDate:    t.ReleaseDate,
		Label:          t.Album.Label,
		ArtistPicture:  bestPicture(t.Artist),
		DeezerLink:     t.Link,
		Preview:        t.Preview,
		Explicit:       t.ExplicitLyrics,
		DeezerTrackID:  t.ID,
		DeezerAlbumID:  t.Album.ID,
		DeezerArtistID: t.Artist.ID,
	}
	if t.ReleaseDate != "" {
		enriched.Year = yearFromDate(t.ReleaseDate)
	} else if t.Album.ReleaseDate != "" {
		enriched.ReleaseDate = t.Album.ReleaseDate
		enriched.Year = yearFromDate(t.Album.ReleaseDate)
	}
	return enriched
}

// buildSearchQuery constructs a Deezer advanced-search query string.
func buildSearchQuery(params SearchParams) string {
	var parts []string
	if t := strings.TrimSpace(params.Title); t != "" {
		parts = append(parts, fmt.Sprintf(`track:"%s"`, escapeQuoted(t)))
	}
	if a := strings.TrimSpace(params.Artist); a != "" {
		// Use only the primary artist for the strict query; combined credits
		// often don't match Deezer's per-track primary artist.
		primary := a
		if arts := splitArtists(a); len(arts) > 0 {
			primary = arts[0]
		}
		parts = append(parts, fmt.Sprintf(`artist:"%s"`, escapeQuoted(primary)))
	}
	if al := strings.TrimSpace(params.Album); al != "" {
		parts = append(parts, fmt.Sprintf(`album:"%s"`, escapeQuoted(al)))
	}
	return strings.Join(parts, " ")
}

func escapeQuoted(s string) string {
	return strings.ReplaceAll(s, `"`, "")
}

// bestCover returns the highest-resolution album cover available.
func bestCover(a DeezerAlbum) string {
	switch {
	case a.CoverXL != "":
		return a.CoverXL
	case a.CoverBig != "":
		return a.CoverBig
	case a.CoverMedium != "":
		return a.CoverMedium
	case a.CoverSmall != "":
		return a.CoverSmall
	default:
		return a.Cover
	}
}

// bestPicture returns the highest-resolution artist picture available.
func bestPicture(a DeezerArtist) string {
	switch {
	case a.PictureXL != "":
		return a.PictureXL
	case a.PictureBig != "":
		return a.PictureBig
	case a.PictureMedium != "":
		return a.PictureMedium
	case a.PictureSmall != "":
		return a.PictureSmall
	default:
		return a.Picture
	}
}

// envInt reads a positive integer from the environment.
func envInt(name string, fallback int) int {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}

// envDuration reads a positive number of seconds from the environment.
func envDuration(name string, fallback time.Duration) time.Duration {
	if v := os.Getenv(name); v != "" {
		if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return fallback
}

// yearFromDate extracts the leading YYYY from a Deezer date string.
func yearFromDate(date string) int {
	if len(date) < 4 {
		return 0
	}
	y, err := strconv.Atoi(date[:4])
	if err != nil {
		return 0
	}
	return y
}
