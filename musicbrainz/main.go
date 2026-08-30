package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/teal-fm/piper/db"
	"github.com/teal-fm/piper/models"
	"github.com/teal-fm/piper/service/musicbrainz"
	"golang.org/x/time/rate"
)

type Server struct {
	mb      *musicbrainz.MusicBrainzService
	limiter *rate.Limiter
	// Local riff-mb instance (the MusicBrainz dumps served from DuckDB).
	// Queried first on every request — no rate limit — with the real,
	// rate-limited MusicBrainz API as fallback when it has nothing.
	mbriffURL    string
	mbriffClient *http.Client
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

	srv := &Server{
		mb:           musicbrainz.NewMusicBrainzService(database),
		limiter:      rate.NewLimiter(rate.Every(time.Second), 1),
		mbriffURL:    strings.TrimRight(mbriffURL, "/"),
		mbriffClient: &http.Client{Timeout: 5 * time.Second},
	}

	e := echo.New()

	e.POST("/search", srv.searchHandler)
	e.POST("/hydrate", srv.hydrateHandler)
	e.GET("/recording/:mbid", srv.recordingByMbidHandler)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

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

	if local, err := s.mbriffSearchRecordings(c.Request().Context(), req); err == nil && len(local) > 0 {
		return c.JSON(http.StatusOK, local)
	}

	resp, _ := s.mb.SearchMusicBrainz(c.Request().Context(), req)

	return c.JSON(http.StatusOK, resp)
}

func (s *Server) hydrateHandler(c echo.Context) error {
	var req models.Track

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	req.Name = cleanTitle(req.Name)

	if resp := s.hydrateFromMbriff(c.Request().Context(), req); resp != nil {
		return c.JSON(http.StatusOK, resp)
	}

	resp, _ := musicbrainz.HydrateTrack(s.mb, req)

	return c.JSON(http.StatusOK, resp)
}

// hydrateFromMbriff is HydrateTrack against riff-mb: same search, same
// first-result pick, but nil-safe on releases. Returns nil when riff-mb has
// no answer so the caller falls back to the real API.
func (s *Server) hydrateFromMbriff(ctx context.Context, track models.Track) *models.Track {
	artistArray := make([]string, len(track.Artist))
	for i, a := range track.Artist {
		artistArray[i] = a.Name
	}
	params := musicbrainz.SearchParams{
		Track:   track.Name,
		Artist:  strings.Join(artistArray, ", "),
		Release: track.Album,
	}

	recordings, err := s.mbriffSearchRecordings(ctx, params)
	if err != nil || len(recordings) == 0 {
		return nil
	}

	hydrated := s.recordingToTrack(&recordings[0])
	hydrated.HasStamped = track.HasStamped
	hydrated.PlayID = track.PlayID
	hydrated.Name = track.Name
	hydrated.URL = track.URL
	hydrated.ServiceBaseUrl = track.ServiceBaseUrl
	hydrated.Timestamp = track.Timestamp
	hydrated.ProgressMs = track.ProgressMs
	return &hydrated
}

func (s *Server) recordingByMbidHandler(c echo.Context) error {
	id := c.Param("mbid")
	if id == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "mbid is required"})
	}

	if recording, err := s.mbriffRecording(c.Request().Context(), id); err == nil {
		return c.JSON(http.StatusOK, s.recordingToTrack(recording))
	}

	if err := s.limiter.Wait(c.Request().Context()); err != nil {
		if c.Request().Context().Err() != nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "request cancelled"})
		}
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "rate limiter error"})
	}

	endpoint := fmt.Sprintf("https://musicbrainz.org/ws/2/recording/%s?inc=artists+releases+isrcs&fmt=json", id)

	req, err := http.NewRequestWithContext(c.Request().Context(), "GET", endpoint, nil)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create request"})
	}
	req.Header.Set("User-Agent", "piper/0.0.1 ( https://github.com/teal-fm/piper )")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("failed to fetch recording: %v", err)})
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "recording not found"})
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "MusicBrainz rate limit exceeded"})
	}
	if resp.StatusCode != http.StatusOK {
		return c.JSON(http.StatusBadGateway, map[string]string{"error": fmt.Sprintf("MusicBrainz API returned status %d", resp.StatusCode)})
	}

	var recording musicbrainz.MusicBrainzRecording
	if err := json.NewDecoder(resp.Body).Decode(&recording); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to decode response"})
	}

	return c.JSON(http.StatusOK, s.recordingToTrack(&recording))
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
