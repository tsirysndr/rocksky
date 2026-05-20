package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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

	srv := &Server{
		mb:      musicbrainz.NewMusicBrainzService(database),
		limiter: rate.NewLimiter(rate.Every(time.Second), 1),
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
	resp, _ := s.mb.SearchMusicBrainz(c.Request().Context(), req)

	return c.JSON(http.StatusOK, resp)
}

func (s *Server) hydrateHandler(c echo.Context) error {
	var req models.Track

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	req.Name = cleanTitle(req.Name)
	resp, _ := musicbrainz.HydrateTrack(s.mb, req)

	return c.JSON(http.StatusOK, resp)
}

func (s *Server) recordingByMbidHandler(c echo.Context) error {
	id := c.Param("mbid")
	if id == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "mbid is required"})
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

	return c.JSON(http.StatusOK, track)
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
