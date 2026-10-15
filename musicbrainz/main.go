package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/teal-fm/piper/db"
	"github.com/teal-fm/piper/models"
	"github.com/teal-fm/piper/service/musicbrainz"
	rotel "github.com/tsirysndr/rocksky/otel"
	"go.opentelemetry.io/contrib/instrumentation/github.com/labstack/echo/otelecho"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type Server struct {
	mb       *musicbrainz.MusicBrainzService
	metadata *metadataClient
	// Local riff-mb instance (the MusicBrainz dumps served from DuckDB).
	// Queried first on every request — no rate limit — with the real,
	// rate-limited MusicBrainz API as fallback when it has nothing.
	mbriffURL    string
	mbriffClient *http.Client
}

// Keep the local-first probe below callers' overall metadata deadlines. A
// stalled riff-mb must leave time for the public MusicBrainz fallback.
func newMbriffClient() *http.Client {
	timeout := time.Second
	if raw := os.Getenv("MBRIFF_TIMEOUT"); raw != "" {
		parsed, err := time.ParseDuration(raw)
		if err != nil || parsed <= 0 {
			log.Printf("invalid MBRIFF_TIMEOUT %q; using 1s", raw)
		} else {
			timeout = parsed
		}
	}
	return &http.Client{Timeout: timeout}
}

// mbriffSearchRecordings asks riff-mb the same query piper would send
// upstream. Any failure (riff-mb down, non-200, bad JSON) returns an error so
// the caller falls back to the real API.
func (s *Server) mbriffSearchRecordings(ctx context.Context, params musicbrainz.SearchParams) ([]musicbrainz.MusicBrainzRecording, error) {
	queryParts := []string{}
	if params.Track != "" {
		queryParts = append(queryParts, fmt.Sprintf(`recording:"%s"`, params.Track))
	}
	if params.Artist != "" {
		queryParts = append(queryParts, fmt.Sprintf(`artist:"%s"`, params.Artist))
	}
	if params.Release != "" {
		queryParts = append(queryParts, fmt.Sprintf(`release:"%s"`, params.Release))
	}
	if len(queryParts) == 0 {
		return nil, fmt.Errorf("empty query")
	}
	endpoint := fmt.Sprintf("%s/ws/2/recording?query=%s&fmt=json&inc=artists+releases+isrcs",
		s.mbriffURL, url.QueryEscape(strings.Join(queryParts, " AND ")))

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.mbriffClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("riff-mb returned status %d", resp.StatusCode)
	}
	var result musicbrainz.MusicBrainzSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Recordings, nil
}

// mbriffRecording looks a recording up on riff-mb. notFound distinguishes a
// definite local miss from riff-mb being unreachable; either way the caller
// falls back — riff-mb's recording table is only the standalone subset, so a
// local 404 says nothing about the real API.
func (s *Server) mbriffRecording(ctx context.Context, id string) (rec *musicbrainz.MusicBrainzRecording, err error) {
	endpoint := fmt.Sprintf("%s/ws/2/recording/%s?inc=artists+releases+isrcs&fmt=json", s.mbriffURL, id)
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.mbriffClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("riff-mb returned status %d", resp.StatusCode)
	}
	var recording musicbrainz.MusicBrainzRecording
	if err := json.NewDecoder(resp.Body).Decode(&recording); err != nil {
		return nil, err
	}
	return &recording, nil
}

// recordingToTrack maps a ws/2 recording onto the track shape this service
// answers with, tolerating recordings that carry no releases (riff-mb's never
// do — the dumps have none).
func (s *Server) recordingToTrack(recording *musicbrainz.MusicBrainzRecording) models.Track {
	bestRelease := s.mb.GetBestRelease(recording.Releases, recording.Title)

	var bestISRC string
	if len(recording.ISRCs) >= 1 {
		bestISRC = recording.ISRCs[0]
	}

	artists := make([]models.Artist, len(recording.ArtistCredit))
	for i, a := range recording.ArtistCredit {
		artistID := a.Artist.ID
		artists[i] = models.Artist{
			Name: a.Name,
			ID:   artistID,
			MBID: &artistID,
		}
	}

	recordingMBID := recording.ID
	track := models.Track{
		Name:          recording.Title,
		RecordingMBID: &recordingMBID,
		ISRC:          bestISRC,
		DurationMs:    int64(recording.Length),
		Artist:        artists,
	}
	if bestRelease != nil {
		track.Album = bestRelease.Title
		track.ReleaseMBID = &bestRelease.ID
	}
	return track
}

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./piper.db"
	}

	database, err := db.New(dbPath)
	if err != nil {
		log.Fatalf("Error connecting to database: %v", err)
	}

	if err := database.Initialize(); err != nil {
		log.Fatalf("Error initializing database: %v", err)
	}

	mbriffURL := os.Getenv("MBRIFF_URL")
	if mbriffURL == "" {
		mbriffURL = "http://localhost:8094"
	}

	cachePath := os.Getenv("MB_CACHE_PATH")
	if cachePath == "" {
		cachePath = dbPath + ".metadata.sqlite"
	}
	if err := os.MkdirAll(filepath.Dir(cachePath), 0700); err != nil {
		log.Fatal(err)
	}
	cacheTTL := 30 * 24 * time.Hour
	if raw := os.Getenv("MB_CACHE_TTL"); raw != "" {
		parsed, err := time.ParseDuration(raw)
		if err != nil || parsed < time.Minute {
			log.Fatal("MB_CACHE_TTL must be a duration of at least 1m")
		}
		cacheTTL = parsed
	}
	cache, err := openMetadataCache(cachePath, cacheTTL)
	if err != nil {
		log.Fatalf("metadata cache initialization: %v", err)
	}
	defer cache.db.Close()
	upstream := os.Getenv("MB_UPSTREAM_URL")
	if upstream == "" {
		upstream = "https://musicbrainz.org/ws/2"
	}
	srv := &Server{
		mb:           musicbrainz.NewMusicBrainzService(database),
		metadata:     newMetadataClient(cache, upstream),
		mbriffURL:    strings.TrimRight(mbriffURL, "/"),
		mbriffClient: newMbriffClient(),
	}

	e := echo.New()

	// Telemetry first, so every request below is traced and counted. The
	// shutdown flush runs on the way out — without it a short-lived process
	// exports nothing at all.
	otelShutdown := rotel.Setup(context.Background(), "musicbrainz")
	defer otelShutdown(context.Background())
	e.Use(otelecho.Middleware("musicbrainz"))
	e.Use(rotel.Metrics())
	e.Use(rotel.RequestLogger())

	e.POST("/search", srv.searchHandler)
	e.POST("/hydrate", srv.hydrateHandler)
	e.GET("/recording/:mbid", srv.recordingByMbidHandler)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go cache.cleanup(ctx)

	go func() {
		port := os.Getenv("PORT")

		if port == "" {
			port = "8088"
		}

		if err := e.Start(fmt.Sprintf(":%s", port)); err != nil && err != http.ErrServerClosed {
			e.Logger.Fatal(err)
		}
	}()

	<-ctx.Done() // wait for Ctrl+C
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = e.Shutdown(shutdownCtx)
}

// spanAttrs records lookup details on the request's active span (opened by
// the otelecho middleware), so a trace shows what was asked and what
// answered. Identifiers and counts, not payloads: whole responses would
// bloat every span for data the store already has.
func spanAttrs(ctx context.Context, attrs ...attribute.KeyValue) {
	trace.SpanFromContext(ctx).SetAttributes(attrs...)
}

func (s *Server) searchHandler(c echo.Context) error {
	var req musicbrainz.SearchParams

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	req.Track = cleanTitle(req.Track)
	ctx := c.Request().Context()
	spanAttrs(ctx,
		attribute.String("mb.query.track", req.Track),
		attribute.String("mb.query.artist", req.Artist),
		attribute.String("mb.query.release", req.Release),
	)

	if strings.TrimSpace(req.Track) == "" && strings.TrimSpace(req.Artist) == "" && strings.TrimSpace(req.Release) == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "empty query"})
	}
	result, err := s.metadata.search(ctx, req, func(work context.Context) ([]musicbrainz.MusicBrainzRecording, error) {
		return s.mbriffSearchRecordings(work, req)
	})
	if err != nil {
		return metadataError(c, err)
	}
	spanAttrs(ctx, attribute.String("mb.source", result.source))
	c.Response().Header().Set("X-MusicBrainz-Source", result.source)
	return c.Blob(result.status, "application/json", result.body)
}

func (s *Server) hydrateHandler(c echo.Context) error {
	var req models.Track

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	req.Name = cleanTitle(req.Name)
	ctx := c.Request().Context()
	artistNames := make([]string, len(req.Artist))
	for i, a := range req.Artist {
		artistNames[i] = a.Name
	}
	spanAttrs(ctx,
		attribute.String("mb.query.track", req.Name),
		attribute.String("mb.query.artist", strings.Join(artistNames, ", ")),
		attribute.String("mb.query.release", req.Album),
	)

	if ctx.Err() != nil {
		return c.NoContent(499)
	}
	params := musicbrainz.SearchParams{Track: req.Name, Artist: strings.Join(artistNames, ", "), Release: req.Album}
	if strings.TrimSpace(params.Track) == "" && strings.TrimSpace(params.Artist) == "" && strings.TrimSpace(params.Release) == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "empty query"})
	}
	result, err := s.metadata.search(ctx, params, func(work context.Context) ([]musicbrainz.MusicBrainzRecording, error) {
		return s.mbriffSearchRecordings(work, params)
	})
	if err != nil {
		return metadataError(c, err)
	}
	var recordings []musicbrainz.MusicBrainzRecording
	if err = json.Unmarshal(result.body, &recordings); err != nil {
		return metadataError(c, err)
	}
	c.Response().Header().Set("X-MusicBrainz-Source", result.source)
	spanAttrs(ctx, attribute.String("mb.source", result.source))
	if len(recordings) == 0 {
		return c.JSON(http.StatusOK, nil)
	}
	hydrated := s.recordingToTrack(&recordings[0])
	hydrated.HasStamped = req.HasStamped
	hydrated.PlayID = req.PlayID
	hydrated.Name = req.Name
	hydrated.URL = req.URL
	hydrated.ServiceBaseUrl = req.ServiceBaseUrl
	hydrated.Timestamp = req.Timestamp
	hydrated.ProgressMs = req.ProgressMs
	return c.JSON(http.StatusOK, hydrated)
}

func (s *Server) recordingByMbidHandler(c echo.Context) error {
	id := strings.ToLower(c.Param("mbid"))
	if !validMBID(id) {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid mbid"})
	}
	result, err := s.metadata.recording(c.Request().Context(), id, func(work context.Context) (*musicbrainz.MusicBrainzRecording, error) {
		return s.mbriffRecording(work, id)
	})
	if err != nil {
		return metadataError(c, err)
	}
	c.Response().Header().Set("X-MusicBrainz-Source", result.source)
	spanAttrs(c.Request().Context(), attribute.String("mb.source", result.source), attribute.String("mb.query.mbid", id))
	if result.status != http.StatusOK {
		return c.Blob(result.status, "application/json", result.body)
	}
	var recording musicbrainz.MusicBrainzRecording
	if err = json.Unmarshal(result.body, &recording); err != nil {
		return metadataError(c, err)
	}
	return c.JSON(http.StatusOK, s.recordingToTrack(&recording))
}

var mbidPattern = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)

func validMBID(id string) bool { return mbidPattern.MatchString(id) }
func metadataError(c echo.Context, err error) error {
	if c.Request().Context().Err() != nil || errors.Is(err, context.Canceled) {
		return c.NoContent(499)
	}
	log.Printf("metadata fallback failed route=%s: %v", c.Path(), err)
	c.Response().Header().Set("Retry-After", "5")
	return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "MusicBrainz temporarily unavailable"})
}

func cleanTitle(title string) string {
	removePatterns := []string{
		" - Album Version (Edited)",
		" - Album Version (Explicit)",
		" - Album Version",
		" (Album Version (Edited))",
		" (Album Version (Explicit))",
		" (Album Version)",
		" - Edited",
		" - Explicit",
		" - Radio Edit",
		" (Edited)",
		" (Explicit)",
		" (Radio Edit)",
	}

	for _, pattern := range removePatterns {
		title = strings.ReplaceAll(title, pattern, "")
	}

	return strings.TrimSpace(title)
}
