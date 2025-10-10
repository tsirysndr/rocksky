package main

import (
	"context"
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
)

type Server struct {
	mb *musicbrainz.MusicBrainzService
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
		mb: musicbrainz.NewMusicBrainzService(database),
	}

	e := echo.New()

	e.POST("/search", srv.searchHandler)
	e.POST("/hydrate", srv.hydrateHandler)

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
