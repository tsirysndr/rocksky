package deezer

import (
	"context"
	"encoding/json"
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

	"golang.org/x/time/rate"
)

const (
	// defaultBaseURL is the public Deezer API root.
	defaultBaseURL = "https://api.deezer.com"

	// Deezer rate limit: 50 requests per 5 seconds. We model this as a steady
	// 10 req/s with a burst of 50 so short spikes are allowed while the
	// sustained rate stays within quota.
	rateLimitWindow   = 5 * time.Second
	rateLimitRequests = 50

	// defaultCacheTTL is how long search / lookup responses stay cached.
	defaultCacheTTL = 1 * time.Hour

	// maxMatches caps how many ranked candidates we return to callers.
	maxMatches = 10

	// enrichCandidates is how many top-scoring candidates we deep-fetch to
	// enrich (each deep fetch costs extra API calls, so keep it small).
	enrichScoreFloor = 0.5
)

// cacheEntry holds an arbitrary decoded payload with its expiration.
type cacheEntry struct {
	value     any
	expiresAt time.Time
}

// DeezerService talks to the Deezer API with rate limiting and an in-memory
// TTL cache. It is safe for concurrent use.
type DeezerService struct {
	baseURL    string
	httpClient *http.Client
	limiter    *rate.Limiter
	cache      map[string]cacheEntry
	cacheMutex sync.RWMutex
	cacheTTL   time.Duration
	logger     *log.Logger
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
func WithLimiter(l *rate.Limiter) Option {
	return func(s *DeezerService) { s.limiter = l }
}

// NewDeezerService creates a new service with rate limiting and caching.
func NewDeezerService(opts ...Option) *DeezerService {
	s := &DeezerService{
		baseURL: defaultBaseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		limiter:  rate.NewLimiter(rate.Every(rateLimitWindow/rateLimitRequests), rateLimitRequests),
		cache:    make(map[string]cacheEntry),
		cacheTTL: defaultCacheTTL,
		logger:   log.New(os.Stdout, "deezer: ", log.LstdFlags|log.Lmsgprefix),
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// cacheGet returns a cached, non-expired value.
func (s *DeezerService) cacheGet(key string) (any, bool) {
	s.cacheMutex.RLock()
	entry, found := s.cache[key]
	s.cacheMutex.RUnlock()
	if found && time.Now().UTC().Before(entry.expiresAt) {
		return entry.value, true
	}
	return nil, false
}

// cacheSet stores a value with the configured TTL.
func (s *DeezerService) cacheSet(key string, value any) {
	s.cacheMutex.Lock()
	s.cache[key] = cacheEntry{value: value, expiresAt: time.Now().UTC().Add(s.cacheTTL)}
	s.cacheMutex.Unlock()
}

// get performs a rate-limited, cached GET against the Deezer API and decodes
// the JSON body into out. Deezer signals errors with an "error" envelope and a
// 200 status, so we sniff for that too.
func (s *DeezerService) get(ctx context.Context, path string, out any) error {
	endpoint := s.baseURL + path

	if err := s.limiter.Wait(ctx); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("context cancelled during rate limiter wait: %w", ctx.Err())
		}
		return fmt.Errorf("rate limiter error: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "rocksky-deezer/0.1.0 ( https://github.com/tsirysndr/rocksky )")
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("context error during request execution: %w", ctx.Err())
		}
		return fmt.Errorf("failed to execute request to %s: %w", endpoint, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return fmt.Errorf("deezer rate limit exceeded (429) for %s", endpoint)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("deezer API request to %s returned status %d", endpoint, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body from %s: %w", endpoint, err)
	}

	// Deezer returns { "error": {...} } with HTTP 200 for quota / bad requests.
	var apiErr DeezerAPIError
	if err := json.Unmarshal(body, &apiErr); err == nil && apiErr.Error != nil {
		return fmt.Errorf("deezer API error (code %d, type %s): %s",
			apiErr.Error.Code, apiErr.Error.Type, apiErr.Error.Message)
	}

	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("failed to decode response from %s: %w", endpoint, err)
	}
	return nil
}

// Search queries the Deezer catalogue for candidate tracks. Results are cached
// by their normalized query key.
func (s *DeezerService) Search(ctx context.Context, params SearchParams) ([]DeezerTrack, error) {
	if strings.TrimSpace(params.Title) == "" && strings.TrimSpace(params.Artist) == "" {
		return nil, fmt.Errorf("at least one of title or artist must be provided")
	}

	query := buildSearchQuery(params)
	cacheKey := "search:" + query

	if cached, ok := s.cacheGet(cacheKey); ok {
		s.logger.Printf("cache hit for search: %q", query)
		return cached.([]DeezerTrack), nil
	}
	s.logger.Printf("cache miss for search: %q", query)

	var result DeezerSearchResponse
	path := "/search?q=" + url.QueryEscape(query)
	if err := s.get(ctx, path, &result); err != nil {
		return nil, err
	}

	// Deezer's advanced query is strict; if it returns nothing, retry with a
	// looser free-text query so misspelled/decorated titles still match.
	if len(result.Data) == 0 {
		loose := strings.TrimSpace(params.Title + " " + params.Artist)
		var loosely DeezerSearchResponse
		if err := s.get(ctx, "/search?q="+url.QueryEscape(loose), &loosely); err == nil {
			result.Data = loosely.Data
		}
	}

	s.cacheSet(cacheKey, result.Data)
	return result.Data, nil
}

// GetTrack fetches the full track object by Deezer ID (includes ISRC, disk /
// track position, release date and contributors).
func (s *DeezerService) GetTrack(ctx context.Context, id int64) (*DeezerTrack, error) {
	cacheKey := "track:" + strconv.FormatInt(id, 10)
	if cached, ok := s.cacheGet(cacheKey); ok {
		t := cached.(DeezerTrack)
		return &t, nil
	}

	var track DeezerTrack
	if err := s.get(ctx, "/track/"+strconv.FormatInt(id, 10), &track); err != nil {
		return nil, err
	}
	s.cacheSet(cacheKey, track)
	return &track, nil
}

// GetAlbum fetches the full album object by Deezer ID (includes label, genres
// and UPC).
func (s *DeezerService) GetAlbum(ctx context.Context, id int64) (*DeezerAlbum, error) {
	cacheKey := "album:" + strconv.FormatInt(id, 10)
	if cached, ok := s.cacheGet(cacheKey); ok {
		a := cached.(DeezerAlbum)
		return &a, nil
	}

	var album DeezerAlbum
	if err := s.get(ctx, "/album/"+strconv.FormatInt(id, 10), &album); err != nil {
		return nil, err
	}
	s.cacheSet(cacheKey, album)
	return &album, nil
}

// GetArtist fetches the full artist object by Deezer ID (includes picture).
func (s *DeezerService) GetArtist(ctx context.Context, id int64) (*DeezerArtist, error) {
	cacheKey := "artist:" + strconv.FormatInt(id, 10)
	if cached, ok := s.cacheGet(cacheKey); ok {
		a := cached.(DeezerArtist)
		return &a, nil
	}

	var artist DeezerArtist
	if err := s.get(ctx, "/artist/"+strconv.FormatInt(id, 10), &artist); err != nil {
		return nil, err
	}
	s.cacheSet(cacheKey, artist)
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
func toMatch(c rankedCandidate) Match {
	t := c.track
	return Match{
		ID:         t.ID,
		Title:      t.Title,
		Artist:     t.Artist.Name,
		Album:      t.Album.Title,
		AlbumArt:   bestCover(t.Album),
		ISRC:       t.ISRC,
		DurationMs: int64(t.Duration) * 1000,
		Link:       t.Link,
		Preview:    t.Preview,
		Rank:       t.Rank,
		Explicit:   t.ExplicitLyrics,
		Score:      c.score,
	}
}

// Enrich searches for the track, ranks candidates, deep-fetches the best one to
// hydrate its full metadata, and returns both the enriched track and the ranked
// match list.
func (s *DeezerService) Enrich(ctx context.Context, params SearchParams) (*EnrichResponse, error) {
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
