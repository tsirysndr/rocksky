package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/teal-fm/piper/db"
	"github.com/teal-fm/piper/models"
	"github.com/teal-fm/piper/service/musicbrainz"
)

type Server struct {
	mb       *musicbrainz.MusicBrainzService
	metadata *metadataClient
}

// recordingToTrack maps a ws/2 recording onto the track shape this service
// answers with, tolerating recordings that carry no releases.
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
	upstream, err := officialUpstream(os.Getenv("MB_UPSTREAM_URL"))
	if err != nil {
		log.Fatal(err)
	}
	srv := &Server{
		mb:       musicbrainz.NewMusicBrainzService(database),
		metadata: newMetadataClient(cache, upstream),
	}

	e := echo.New()

	// Ordinary HTTP logs only; no OpenTelemetry exporters or instrumentation.
	e.Use(middleware.Logger())

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

func (s *Server) searchHandler(c echo.Context) error {
	var req musicbrainz.SearchParams

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	req.Track = cleanTitle(req.Track)
	ctx := c.Request().Context()

	if strings.TrimSpace(req.Track) == "" && strings.TrimSpace(req.Artist) == "" && strings.TrimSpace(req.Release) == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "empty query"})
	}
	result, err := s.metadata.search(ctx, req)
	if err != nil {
		return metadataError(c, err)
	}
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

	if ctx.Err() != nil {
		return c.NoContent(499)
	}
	params := musicbrainz.SearchParams{Track: req.Name, Artist: strings.Join(artistNames, ", "), Release: req.Album}
	if strings.TrimSpace(params.Track) == "" && strings.TrimSpace(params.Artist) == "" && strings.TrimSpace(params.Release) == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "empty query"})
	}
	result, err := s.metadata.search(ctx, params)
	if err != nil {
		return metadataError(c, err)
	}
	var recordings []musicbrainz.MusicBrainzRecording
	if err = json.Unmarshal(result.body, &recordings); err != nil {
		return metadataError(c, err)
	}
	c.Response().Header().Set("X-MusicBrainz-Source", result.source)
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
	result, err := s.metadata.recording(c.Request().Context(), id)
	if err != nil {
		return metadataError(c, err)
	}
	c.Response().Header().Set("X-MusicBrainz-Source", result.source)
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
	status, reason, retry := http.StatusBadGateway, "invalid_upstream_response", 0
	var failure *upstreamError
	if errors.As(err, &failure) {
		status, reason, retry = failure.status, failure.reason, failure.retrySeconds()
	}
	log.Printf("metadata request failed route=%s reason=%s: %v", c.Path(), reason, err)
	c.Response().Header().Set("X-MusicBrainz-Error", reason)
	if retry > 0 {
		c.Response().Header().Set("Retry-After", strconv.Itoa(retry))
	}
	return c.JSON(status, map[string]string{"error": "MusicBrainz temporarily unavailable"})
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
