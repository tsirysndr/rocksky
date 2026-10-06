package discogs

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
	defaultBaseURL = "https://api.discogs.com"

	// Discogs allows 60 authenticated requests per rolling minute per token.
	// We stay under it: their clock is not ours. Override with
	// DISCOGS_RATE_LIMIT.
	rateLimitWindow   = 1 * time.Minute
	rateLimitRequests = 55

	// Discogs' catalogue is near-static, and the quota is an order of
	// magnitude tighter than Deezer's, so successes are cached for longer.
	defaultCacheTTL = 6 * time.Hour
	failureCacheTTL = 90 * time.Second

	// defaultMaxQueueWait bounds the total time one /enrich may spend queued
	// before it is answered 429. Override with DISCOGS_MAX_WAIT (seconds).
	defaultMaxQueueWait = 30 * time.Second

	breakerThreshold    = 5
	breakerBaseCooldown = 30 * time.Second
	breakerMaxCooldown  = 5 * time.Minute

	maxMatches       = 10
	enrichScoreFloor = 0.5
	searchPerPage    = 10

	// lowQuotaWarning is the remaining-request count below which the quota
	// Discogs reports is logged as a warning.
	lowQuotaWarning = 5

	janitorInterval = 10 * time.Minute

	// userAgent identifies this service to Discogs. They reject requests from
	// default library agents outright, so this must stay non-generic.
	userAgent = "rocksky-discogs/0.1.0 +https://github.com/tsirysndr/rocksky"
)

// errQueueFull means no rate limiter slot came free inside the request's queue
// budget. Nothing reached Discogs, so it is answered 429, never 5xx.
var errQueueFull = errors.New("discogs request queue budget exhausted")

// ErrMissingToken is returned when no personal access token is configured.
var ErrMissingToken = errors.New("DISCOGS_TOKEN is not set")

// UpstreamError carries the status the handler should answer with.
type UpstreamError struct {
	Status     int
	Upstream   int
	RetryAfter time.Duration
	Message    string
}

func (e *UpstreamError) Error() string { return e.Message }

type cacheEntry struct {
	value     any
	err       error
	expiresAt time.Time
}

// DiscogsService talks to the Discogs API with rate limiting, a circuit
// breaker and an in-memory TTL cache. It is safe for concurrent use.
type DiscogsService struct {
	baseURL    string
	token      string
	httpClient *http.Client
	limiter    *WindowLimiter
	breaker    *breaker
	cache      map[string]cacheEntry
	cacheMutex sync.RWMutex
	cacheTTL   time.Duration
	logger     *log.Logger

	maxQueueWait time.Duration

	quotaMutex sync.RWMutex
	quota      RateLimitSnapshot

	group singleflight.Group
}

type Option func(*DiscogsService)

func WithBaseURL(baseURL string) Option {
	return func(s *DiscogsService) { s.baseURL = strings.TrimRight(baseURL, "/") }
}

func WithToken(token string) Option {
	return func(s *DiscogsService) { s.token = strings.TrimSpace(token) }
}

func WithCacheTTL(ttl time.Duration) Option {
	return func(s *DiscogsService) { s.cacheTTL = ttl }
}

func WithHTTPClient(c *http.Client) Option {
	return func(s *DiscogsService) { s.httpClient = c }
}

func WithLimiter(l *WindowLimiter) Option {
	return func(s *DiscogsService) { s.limiter = l }
}

func WithMaxQueueWait(d time.Duration) Option {
	return func(s *DiscogsService) { s.maxQueueWait = d }
}

// NewDiscogsService creates a service that reads its token from DISCOGS_TOKEN
// unless WithToken overrides it. It fails rather than starting tokenless: an
// unauthenticated Discogs client gets a smaller quota and no images.
func NewDiscogsService(opts ...Option) (*DiscogsService, error) {
	s := &DiscogsService{
		baseURL:      defaultBaseURL,
		token:        strings.TrimSpace(os.Getenv("DISCOGS_TOKEN")),
		httpClient:   &http.Client{Timeout: 10 * time.Second},
		limiter:      NewWindowLimiter(envInt("DISCOGS_RATE_LIMIT", rateLimitRequests), rateLimitWindow),
		breaker:      newBreaker(breakerThreshold, breakerBaseCooldown, breakerMaxCooldown),
		cache:        make(map[string]cacheEntry),
		cacheTTL:     defaultCacheTTL,
		maxQueueWait: envDuration("DISCOGS_MAX_WAIT", defaultMaxQueueWait),
		logger:       log.New(os.Stdout, "discogs: ", log.LstdFlags|log.Lmsgprefix),
	}
	for _, opt := range opts {
		opt(s)
	}
	if s.token == "" {
		return nil, ErrMissingToken
	}
	go s.janitor()
	return s, nil
}

func (s *DiscogsService) cacheGet(key string) (any, error, bool) {
	s.cacheMutex.RLock()
	entry, found := s.cache[key]
	s.cacheMutex.RUnlock()
	if found && time.Now().UTC().Before(entry.expiresAt) {
		return entry.value, entry.err, true
	}
	return nil, nil, false
}

func (s *DiscogsService) cacheSet(key string, value any) {
	s.cacheMutex.Lock()
	s.cache[key] = cacheEntry{value: value, expiresAt: time.Now().UTC().Add(s.cacheTTL)}
	s.cacheMutex.Unlock()
}

// cacheFailure remembers an upstream failure briefly. Local queue and breaker
// rejections are not cached: they say nothing about the answer.
func (s *DiscogsService) cacheFailure(key string, err error) {
	var upstream *UpstreamError
	if errors.Is(err, errQueueFull) || errors.Is(err, context.Canceled) ||
		errors.Is(err, context.DeadlineExceeded) ||
		(errors.As(err, &upstream) && upstream.Upstream == 0) {
		return
	}

	ttl := min(failureCacheTTL, s.cacheTTL)
	s.cacheMutex.Lock()
	s.cache[key] = cacheEntry{err: err, expiresAt: time.Now().UTC().Add(ttl)}
	s.cacheMutex.Unlock()
}

func (s *DiscogsService) janitor() {
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

type queueBudgetKey struct{}

// withQueueBudget stamps one deadline on a whole enrich fan-out, so a
// backlogged queue delays the caller once rather than once per upstream call.
func withQueueBudget(ctx context.Context, d time.Duration) context.Context {
	return context.WithValue(ctx, queueBudgetKey{}, time.Now().Add(d))
}

func (s *DiscogsService) queueDeadline(ctx context.Context) time.Time {
	deadline, ok := ctx.Value(queueBudgetKey{}).(time.Time)
	if !ok {
		deadline = time.Now().Add(s.maxQueueWait)
	}
	if caller, ok := ctx.Deadline(); ok && caller.Before(deadline) {
		return caller
	}
	return deadline
}

// RateLimit reports the quota Discogs last told us about.
func (s *DiscogsService) RateLimit() RateLimitSnapshot {
	s.quotaMutex.RLock()
	defer s.quotaMutex.RUnlock()
	return s.quota
}

// Cooldown is how long the breaker stays open, 0 when it is closed.
func (s *DiscogsService) Cooldown() time.Duration {
	return s.breaker.remaining(time.Now())
}

func (s *DiscogsService) observeQuota(h http.Header) {
	limit, errLimit := strconv.Atoi(h.Get("X-Discogs-Ratelimit"))
	if errLimit != nil {
		return
	}
	used, _ := strconv.Atoi(h.Get("X-Discogs-Ratelimit-Used"))
	remaining, err := strconv.Atoi(h.Get("X-Discogs-Ratelimit-Remaining"))
	if err != nil {
		remaining = limit - used
	}

	s.quotaMutex.Lock()
	s.quota = RateLimitSnapshot{Limit: limit, Used: used, Remaining: remaining, ObservedAt: time.Now().UTC()}
	s.quotaMutex.Unlock()

	if remaining <= lowQuotaWarning {
		s.logger.Printf("quota nearly spent: %d of %d requests left in this window", remaining, limit)
	}
}

// answered reports whether a status is Discogs answering the question rather
// than refusing to. A 404 is a real answer, so it must not open the breaker.
func answered(status int) bool {
	switch status {
	case http.StatusNotFound, http.StatusBadRequest, http.StatusUnprocessableEntity:
		return true
	}
	return false
}

// get performs a queued, rate-limited, breaker-guarded GET and decodes the
// JSON body into out.
func (s *DiscogsService) get(ctx context.Context, path string, out any) error {
	endpoint := s.baseURL + path

	allowed, probe, cooldown := s.breaker.allow(time.Now())
	if !allowed {
		return &UpstreamError{
			Status:     http.StatusServiceUnavailable,
			RetryAfter: cooldown,
			Message: fmt.Sprintf("discogs is unavailable, cooling down for another %s",
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
	// Discogs blocks requests that do not identify themselves, and
	// authenticates personal access tokens with this header form.
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Authorization", "Discogs token="+s.token)
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

	s.observeQuota(resp.Header)

	if resp.StatusCode != http.StatusOK {
		upstream := &UpstreamError{
			Status:     http.StatusBadGateway,
			Upstream:   resp.StatusCode,
			RetryAfter: parseRetryAfter(resp.Header.Get("Retry-After")),
			Message: fmt.Sprintf("discogs API request to %s returned status %d%s",
				endpoint, resp.StatusCode, apiMessage(resp.Body)),
		}
		switch resp.StatusCode {
		case http.StatusNotFound:
			upstream.Status = http.StatusNotFound
		case http.StatusUnauthorized, http.StatusForbidden:
			s.logger.Printf("discogs rejected DISCOGS_TOKEN: %s", upstream.Message)
		}
		if answered(resp.StatusCode) {
			s.breaker.success()
			return upstream
		}
		return s.recordFailure(upstream)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return s.recordFailure(&UpstreamError{
			Status:   http.StatusBadGateway,
			Upstream: resp.StatusCode,
			Message:  fmt.Sprintf("failed to read response body from %s: %v", endpoint, err),
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

// apiMessage extracts Discogs' error message, as " (<message>)" or "".
func apiMessage(r io.Reader) string {
	var apiErr APIError
	if err := json.NewDecoder(io.LimitReader(r, 4<<10)).Decode(&apiErr); err != nil || apiErr.Message == "" {
		return ""
	}
	return fmt.Sprintf(" (%s)", strings.TrimSpace(apiErr.Message))
}

func (s *DiscogsService) recordFailure(err *UpstreamError) error {
	if cooldown, opened := s.breaker.failure(time.Now(), err.RetryAfter); opened {
		s.logger.Printf("pausing discogs calls for %s after: %s", cooldown.Round(time.Second), err.Message)
	} else {
		s.logger.Printf("upstream failure: %s", err.Message)
	}
	return err
}

func parseRetryAfter(value string) time.Duration {
	seconds, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || seconds <= 0 {
		return 0
	}
	return time.Duration(seconds) * time.Second
}

// Search queries the Discogs database for candidate releases.
func (s *DiscogsService) Search(ctx context.Context, params SearchParams) ([]SearchResult, error) {
	if strings.TrimSpace(params.Title) == "" && strings.TrimSpace(params.Artist) == "" {
		return nil, fmt.Errorf("at least one of title or artist must be provided")
	}

	strict := buildSearchQuery(params)
	cacheKey := "search:" + strict

	value, err := s.fetchCached(cacheKey, func() (any, error) {
		s.logger.Printf("cache miss for search: %q", strict)

		var result SearchResponse
		if err := s.get(ctx, "/database/search?"+strict, &result); err != nil {
			return nil, err
		}

		// The fielded search is strict; fall back to free text so decorated or
		// misspelled titles still match.
		if len(result.Results) == 0 {
			loose := url.Values{}
			loose.Set("q", strings.TrimSpace(strings.Join([]string{params.Artist, params.Album, params.Title}, " ")))
			loose.Set("type", "release")
			loose.Set("per_page", strconv.Itoa(searchPerPage))
			var loosely SearchResponse
			if err := s.get(ctx, "/database/search?"+loose.Encode(), &loosely); err == nil {
				result.Results = loosely.Results
			}
		}
		return result.Results, nil
	})
	if err != nil {
		return nil, err
	}
	return value.([]SearchResult), nil
}

// fetchCached serves key from the cache, or runs fetch once on behalf of every
// caller currently asking the same question.
func (s *DiscogsService) fetchCached(key string, fetch func() (any, error)) (any, error) {
	if value, err, ok := s.cacheGet(key); ok {
		return value, err
	}

	return withSingleflight(s.group.Do(key, func() (any, error) {
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

func withSingleflight(value any, err error, _ bool) (any, error) {
	return value, err
}

// GetRelease fetches a release by Discogs ID: tracklist, labels, formats,
// genres, styles, identifiers and images.
func (s *DiscogsService) GetRelease(ctx context.Context, id int64) (*Release, error) {
	value, err := s.fetchCached("release:"+strconv.FormatInt(id, 10), func() (any, error) {
		var release Release
		if err := s.get(ctx, "/releases/"+strconv.FormatInt(id, 10), &release); err != nil {
			return nil, err
		}
		return release, nil
	})
	if err != nil {
		return nil, err
	}
	release := value.(Release)
	return &release, nil
}

// GetMaster fetches a master by Discogs ID, whose year is the original release
// year rather than this pressing's.
func (s *DiscogsService) GetMaster(ctx context.Context, id int64) (*Master, error) {
	value, err := s.fetchCached("master:"+strconv.FormatInt(id, 10), func() (any, error) {
		var master Master
		if err := s.get(ctx, "/masters/"+strconv.FormatInt(id, 10), &master); err != nil {
			return nil, err
		}
		return master, nil
	})
	if err != nil {
		return nil, err
	}
	master := value.(Master)
	return &master, nil
}

func (s *DiscogsService) GetArtist(ctx context.Context, id int64) (*Artist, error) {
	value, err := s.fetchCached("artist:"+strconv.FormatInt(id, 10), func() (any, error) {
		var artist Artist
		if err := s.get(ctx, "/artists/"+strconv.FormatInt(id, 10), &artist); err != nil {
			return nil, err
		}
		return artist, nil
	})
	if err != nil {
		return nil, err
	}
	artist := value.(Artist)
	return &artist, nil
}

func (s *DiscogsService) GetLabel(ctx context.Context, id int64) (*Label, error) {
	value, err := s.fetchCached("label:"+strconv.FormatInt(id, 10), func() (any, error) {
		var label Label
		if err := s.get(ctx, "/labels/"+strconv.FormatInt(id, 10), &label); err != nil {
			return nil, err
		}
		return label, nil
	})
	if err != nil {
		return nil, err
	}
	label := value.(Label)
	return &label, nil
}

type rankedCandidate struct {
	result SearchResult
	score  float64
}

func rankCandidates(params SearchParams, results []SearchResult) []rankedCandidate {
	ranked := make([]rankedCandidate, 0, len(results))
	for _, r := range results {
		ranked = append(ranked, rankedCandidate{result: r, score: scoreCandidate(params, r)})
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].score != ranked[j].score {
			return ranked[i].score > ranked[j].score
		}
		// Collection counts stand in for popularity, then the earliest known
		// pressing, then the id for determinism.
		hi, hj := ranked[i].result.Community.Have, ranked[j].result.Community.Have
		if hi != hj {
			return hi > hj
		}
		yi, yj := yearFromDate(ranked[i].result.Year.String()), yearFromDate(ranked[j].result.Year.String())
		if yi != yj {
			if yi == 0 || yj == 0 {
				return yj == 0
			}
			return yi < yj
		}
		return ranked[i].result.ID < ranked[j].result.ID
	})
	return ranked
}

func toMatch(c rankedCandidate) Match {
	r := c.result
	artist, album := splitResultTitle(r.Title)
	return Match{
		ID:            r.ID,
		MasterID:      r.MasterID,
		Type:          r.Type,
		Artist:        stripDisambiguator(artist),
		Album:         album,
		AlbumArt:      firstNonEmpty(r.CoverImage, r.Thumb),
		Year:          yearFromDate(r.Year.String()),
		Country:       r.Country,
		Label:         first(r.Label),
		CatalogNumber: r.CatNo,
		Barcode:       first(r.Barcode),
		Formats:       r.Format,
		Genres:        r.Genre,
		Styles:        r.Style,
		URL:           releaseURL(r.URI),
		Score:         c.score,
	}
}

// Enrich searches for the track, ranks candidate releases and deep-fetches the
// best one. Matches are deliberately not hydrated: at 60 requests per minute a
// per-match release fetch would cost more quota than the answer is worth.
func (s *DiscogsService) Enrich(ctx context.Context, params SearchParams) (*EnrichResponse, error) {
	ctx = withQueueBudget(ctx, s.maxQueueWait)

	results, err := s.Search(ctx, params)
	if err != nil {
		return nil, err
	}

	ranked := rankCandidates(params, results)

	matches := make([]Match, 0, min(len(ranked), maxMatches))
	for i, c := range ranked {
		if i >= maxMatches {
			break
		}
		matches = append(matches, toMatch(c))
	}

	resp := &EnrichResponse{Matches: matches}
	if len(ranked) == 0 {
		return resp, nil
	}

	best := ranked[0]
	if best.score < enrichScoreFloor {
		resp.Track = buildFromSearch(params, best.result)
		return resp, nil
	}

	resp.Track = s.hydrate(ctx, params, best.result)
	return resp, nil
}

// hydrate deep-fetches the best release, and its master when the pressing's
// own year is missing or clearly a reissue.
func (s *DiscogsService) hydrate(ctx context.Context, params SearchParams, seed SearchResult) *EnrichedTrack {
	enriched := buildFromSearch(params, seed)

	release, err := s.GetRelease(ctx, seed.ID)
	if err != nil || release == nil {
		if err != nil {
			s.logger.Printf("release deep-fetch failed for id=%d: %v", seed.ID, err)
		}
		return enriched
	}

	if release.Title != "" {
		enriched.Album = release.Title
	}
	if credit := joinCredits(release.Artists); credit != "" {
		enriched.AlbumArtist = credit
		if enriched.Artist == "" {
			enriched.Artist = credit
		}
	}
	if len(release.Artists) > 0 {
		enriched.DiscogsArtistID = release.Artists[0].ID
	}
	if release.Year != 0 {
		enriched.Year = release.Year
	}
	if release.Released != "" {
		enriched.ReleaseDate = release.Released
		if enriched.Year == 0 {
			enriched.Year = yearFromDate(release.Released)
		}
	}
	if release.Country != "" {
		enriched.Country = release.Country
	}
	if len(release.Labels) > 0 {
		enriched.Label = release.Labels[0].Name
		enriched.CatalogNumber = release.Labels[0].CatNo
	}
	if len(release.Genres) > 0 {
		enriched.Genres = release.Genres
	}
	if len(release.Styles) > 0 {
		enriched.Styles = release.Styles
	}
	if formats := formatNames(release.Formats); len(formats) > 0 {
		enriched.Formats = formats
	}
	if barcode := identifierValue(release.Identifiers, "barcode"); barcode != "" {
		enriched.Barcode = barcode
	}
	if art := primaryImage(release.Images); art != "" {
		enriched.AlbumArt = art
	}
	if release.URI != "" {
		enriched.DiscogsURL = release.URI
	}
	if release.MasterID != 0 {
		enriched.DiscogsMasterID = release.MasterID
	}

	if track, ok := findTrack(release.Tracklist, params.Title); ok {
		enriched.Title = track.Title
		enriched.TrackPosition = track.Position
		enriched.DiscNumber, enriched.TrackNumber = parsePosition(track.Position)
		enriched.DurationMs = parseDuration(track.Duration)
		if credit := joinCredits(track.Artists); credit != "" {
			enriched.Artist = credit
		}
	}

	if enriched.DiscogsMasterID != 0 && (enriched.Year == 0 || isReissue(release.Formats)) {
		if master, err := s.GetMaster(ctx, enriched.DiscogsMasterID); err == nil && master != nil {
			enriched.OriginalYear = master.Year
			if enriched.Year == 0 {
				enriched.Year = master.Year
			}
		} else if err != nil {
			s.logger.Printf("master deep-fetch failed for id=%d: %v", enriched.DiscogsMasterID, err)
		}
	}

	return enriched
}

// buildFromSearch maps a search result onto the normalized shape without extra
// network calls.
func buildFromSearch(params SearchParams, r SearchResult) *EnrichedTrack {
	artist, album := splitResultTitle(r.Title)
	artist = stripDisambiguator(artist)
	return &EnrichedTrack{
		Title:            params.Title,
		Artist:           firstNonEmpty(artist, params.Artist),
		AlbumArtist:      artist,
		Album:            album,
		AlbumArt:         firstNonEmpty(r.CoverImage, r.Thumb),
		Year:             yearFromDate(r.Year.String()),
		Label:            first(r.Label),
		CatalogNumber:    r.CatNo,
		Country:          r.Country,
		Barcode:          first(r.Barcode),
		Formats:          r.Format,
		Genres:           r.Genre,
		Styles:           r.Style,
		DiscogsURL:       releaseURL(r.URI),
		DiscogsReleaseID: r.ID,
		DiscogsMasterID:  r.MasterID,
	}
}

// buildSearchQuery builds the fielded /database/search query.
func buildSearchQuery(params SearchParams) string {
	q := url.Values{}
	if t := strings.TrimSpace(params.Title); t != "" {
		q.Set("track", t)
	}
	if a := strings.TrimSpace(params.Artist); a != "" {
		// Combined credits rarely match Discogs' release artist.
		primary := a
		if arts := splitArtists(a); len(arts) > 0 {
			primary = arts[0]
		}
		q.Set("artist", primary)
	}
	if al := strings.TrimSpace(params.Album); al != "" {
		q.Set("release_title", al)
	}
	q.Set("type", "release")
	q.Set("per_page", strconv.Itoa(searchPerPage))
	return q.Encode()
}

func joinCredits(credits []ArtistCredit) string {
	var b strings.Builder
	for i, c := range credits {
		name := stripDisambiguator(firstNonEmpty(c.ANV, c.Name))
		if name == "" {
			continue
		}
		if b.Len() > 0 {
			join := strings.TrimSpace(credits[i-1].Join)
			switch join {
			case "", ",":
				b.WriteString(", ")
			default:
				b.WriteString(" " + join + " ")
			}
		}
		b.WriteString(name)
	}
	return b.String()
}

func formatNames(formats []Format) []string {
	out := make([]string, 0, len(formats))
	for _, f := range formats {
		parts := []string{}
		if f.Name != "" {
			parts = append(parts, f.Name)
		}
		parts = append(parts, f.Descriptions...)
		if len(parts) > 0 {
			out = append(out, strings.Join(parts, ", "))
		}
	}
	return out
}

func isReissue(formats []Format) bool {
	for _, f := range formats {
		for _, d := range f.Descriptions {
			switch strings.ToLower(d) {
			case "reissue", "repress", "remastered", "compilation":
				return true
			}
		}
	}
	return false
}

func identifierValue(identifiers []Identifier, kind string) string {
	for _, id := range identifiers {
		if strings.EqualFold(id.Type, kind) && id.Value != "" {
			return id.Value
		}
	}
	return ""
}

// primaryImage prefers the release's primary image over the secondary scans.
func primaryImage(images []Image) string {
	for _, img := range images {
		if strings.EqualFold(img.Type, "primary") && img.URI != "" {
			return img.URI
		}
	}
	for _, img := range images {
		if img.URI != "" {
			return img.URI
		}
	}
	return ""
}

// releaseURL turns a search result's relative uri into an absolute one.
func releaseURL(uri string) string {
	switch {
	case uri == "":
		return ""
	case strings.HasPrefix(uri, "http"):
		return uri
	default:
		return "https://www.discogs.com" + uri
	}
}

func first(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func envInt(name string, fallback int) int {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}

func envDuration(name string, fallback time.Duration) time.Duration {
	if v := os.Getenv(name); v != "" {
		if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return fallback
}
