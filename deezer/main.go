package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/tsirysndr/rocksky/deezer/service/deezer"
)

type Server struct {
	deezer *deezer.DeezerService
}

func main() {
	srv := &Server{
		deezer: deezer.NewDeezerService(),
	}

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})
	e.POST("/search", srv.searchHandler)
	e.POST("/enrich", srv.enrichHandler)
	e.GET("/track/:id", srv.trackHandler)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	go func() {
		// Prefer the service-specific DEEZER_PORT, falling back to PORT and
		// finally the default.
		port := os.Getenv("DEEZER_PORT")
		if port == "" {
			port = os.Getenv("PORT")
		}
		if port == "" {
			port = "8090"
		}
		if err := e.Start(fmt.Sprintf(":%s", port)); err != nil && err != http.ErrServerClosed {
			e.Logger.Fatal(err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = e.Shutdown(shutdownCtx)
}

// searchHandler returns the enriched best track plus the ranked match list.
func (s *Server) searchHandler(c echo.Context) error {
	return s.enrichHandler(c)
}

// enrichHandler takes { title, artist, album? } and returns the enriched track
// with all metadata Deezer can provide, plus a list of best matches.
func (s *Server) enrichHandler(c echo.Context) error {
	var req deezer.SearchParams
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if req.Title == "" && req.Artist == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title or artist is required"})
	}

	resp, err := s.deezer.Enrich(c.Request().Context(), req)
	if err != nil {
		return c.JSON(http.StatusBadGateway, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, resp)
}

// trackHandler returns a single fully-hydrated track by Deezer ID.
func (s *Server) trackHandler(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid track id"})
	}

	track, err := s.deezer.GetTrack(c.Request().Context(), id)
	if err != nil {
		return c.JSON(http.StatusBadGateway, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, track)
}
