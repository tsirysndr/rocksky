package main

import (
	"context"
	"errors"
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

// statusClientClosedRequest is nginx's non-standard 499: the caller
// disconnected before we could answer.
const statusClientClosedRequest = 499

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
		return respondError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// respondError answers with the status that describes what actually went wrong,
// so the access log stops collapsing four different problems into one 502: a
// saturated local queue (429), Deezer refusing us (503), a caller that hung up
// (499), a deadline (504), and only then a genuine upstream failure (502).
//
// The error is returned once the response is committed, which hands it to
// echo's logger — without that the access log records an empty "error" field
// for every failure and the upstream status stays invisible.
func respondError(c echo.Context, err error) error {
	status := http.StatusBadGateway

	var upstream *deezer.UpstreamError
	switch {
	case errors.As(err, &upstream):
		status = upstream.Status
		if upstream.RetryAfter > 0 {
			c.Response().Header().Set("Retry-After",
				strconv.Itoa(int(upstream.RetryAfter.Seconds())+1))
		}
	case c.Request().Context().Err() != nil:
		// Nobody is left to write to; report it as 499 so that real upstream
		// failures stay visible as 502.
		_ = c.NoContent(statusClientClosedRequest)
		return err
	case errors.Is(err, context.DeadlineExceeded):
		status = http.StatusGatewayTimeout
	}

	if writeErr := c.JSON(status, map[string]string{"error": err.Error()}); writeErr != nil {
		return writeErr
	}
	// Returning the error once the response is committed hands it to the access
	// log; echo's error handler skips a response that is already written.
	return err
}

// trackHandler returns a single fully-hydrated track by Deezer ID.
func (s *Server) trackHandler(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid track id"})
	}

	track, err := s.deezer.GetTrack(c.Request().Context(), id)
	if err != nil {
		return respondError(c, err)
	}
	return c.JSON(http.StatusOK, track)
}
