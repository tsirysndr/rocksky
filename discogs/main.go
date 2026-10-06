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
	"github.com/tsirysndr/rocksky/discogs/service/discogs"
	rotel "github.com/tsirysndr/rocksky/otel"
	"go.opentelemetry.io/contrib/instrumentation/github.com/labstack/echo/otelecho"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// statusClientClosedRequest is nginx's non-standard 499: the caller
// disconnected before we could answer.
const statusClientClosedRequest = 499

type Server struct {
	discogs *discogs.DiscogsService
}

func main() {
	svc, err := discogs.NewDiscogsService()
	if err != nil {
		// A tokenless client gets a quarter of the quota and no images, so
		// starting without one would only fail later, per request.
		fmt.Fprintf(os.Stderr, "discogs: %v — set a personal access token from https://www.discogs.com/settings/developers\n", err)
		os.Exit(1)
	}
	srv := &Server{discogs: svc}

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())

	otelShutdown := rotel.Setup(context.Background(), "discogs")
	defer otelShutdown(context.Background())
	e.Use(otelecho.Middleware("discogs"))
	e.Use(rotel.Metrics())
	e.Use(rotel.RequestLogger())

	e.GET("/health", srv.healthHandler)
	e.GET("/ratelimit", srv.rateLimitHandler)
	e.POST("/enrich", srv.enrichHandler)
	e.POST("/search", srv.enrichHandler)
	e.GET("/search", srv.searchHandler)
	e.GET("/releases/:id", srv.releaseHandler)
	e.GET("/masters/:id", srv.masterHandler)
	e.GET("/artists/:id", srv.artistHandler)
	e.GET("/labels/:id", srv.labelHandler)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	go func() {
		port := os.Getenv("DISCOGS_PORT")
		if port == "" {
			port = os.Getenv("PORT")
		}
		if port == "" {
			port = "8095"
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

func (s *Server) healthHandler(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{
		"status":    "ok",
		"rateLimit": s.discogs.RateLimit(),
		"cooldown":  s.discogs.Cooldown().Seconds(),
	})
}

func (s *Server) rateLimitHandler(c echo.Context) error {
	return c.JSON(http.StatusOK, s.discogs.RateLimit())
}

func spanAttrs(ctx context.Context, attrs ...attribute.KeyValue) {
	trace.SpanFromContext(ctx).SetAttributes(attrs...)
}

// enrichHandler takes { title, artist, album? } and returns the best enriched
// release metadata plus the ranked candidate list.
func (s *Server) enrichHandler(c echo.Context) error {
	var req discogs.SearchParams
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	return s.enrich(c, req)
}

// searchHandler is the GET form, for callers that would rather not POST.
func (s *Server) searchHandler(c echo.Context) error {
	return s.enrich(c, discogs.SearchParams{
		Title:  c.QueryParam("title"),
		Artist: c.QueryParam("artist"),
		Album:  c.QueryParam("album"),
	})
}

func (s *Server) enrich(c echo.Context, req discogs.SearchParams) error {
	if req.Title == "" && req.Artist == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "title or artist is required"})
	}
	ctx := c.Request().Context()
	spanAttrs(ctx,
		attribute.String("discogs.query.title", req.Title),
		attribute.String("discogs.query.artist", req.Artist),
		attribute.String("discogs.query.album", req.Album),
	)

	resp, err := s.discogs.Enrich(ctx, req)
	if err != nil {
		return respondError(c, err)
	}
	attrs := []attribute.KeyValue{
		attribute.Int("discogs.results.count", len(resp.Matches)),
		attribute.Bool("discogs.result.enriched", resp.Track != nil),
		attribute.Int("discogs.ratelimit.remaining", s.discogs.RateLimit().Remaining),
	}
	if resp.Track != nil {
		attrs = append(attrs,
			attribute.String("discogs.result.title", resp.Track.Title),
			attribute.String("discogs.result.artist", resp.Track.Artist),
			attribute.String("discogs.result.album", resp.Track.Album),
			attribute.Int64("discogs.result.release_id", resp.Track.DiscogsReleaseID),
		)
	}
	spanAttrs(ctx, attrs...)
	return c.JSON(http.StatusOK, resp)
}

// respondError answers with the status that describes what actually went
// wrong, so a saturated local queue (429), Discogs refusing us (503), a caller
// that hung up (499), a deadline (504) and a genuine upstream failure (502)
// stop collapsing into one code.
func respondError(c echo.Context, err error) error {
	status := http.StatusBadGateway

	var upstream *discogs.UpstreamError
	switch {
	case errors.As(err, &upstream):
		status = upstream.Status
		if upstream.RetryAfter > 0 {
			c.Response().Header().Set("Retry-After",
				strconv.Itoa(int(upstream.RetryAfter.Seconds())+1))
		}
	case c.Request().Context().Err() != nil:
		_ = c.NoContent(statusClientClosedRequest)
		return err
	case errors.Is(err, context.DeadlineExceeded):
		status = http.StatusGatewayTimeout
	}

	if writeErr := c.JSON(status, map[string]string{"error": err.Error()}); writeErr != nil {
		return writeErr
	}
	// Returning the error once the response is committed hands it to the
	// access log.
	return err
}

func (s *Server) idParam(c echo.Context) (int64, error) {
	return strconv.ParseInt(c.Param("id"), 10, 64)
}

func (s *Server) releaseHandler(c echo.Context) error {
	id, err := s.idParam(c)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid release id"})
	}
	ctx := c.Request().Context()
	spanAttrs(ctx, attribute.Int64("discogs.query.release_id", id))

	release, err := s.discogs.GetRelease(ctx, id)
	if err != nil {
		return respondError(c, err)
	}
	return c.JSON(http.StatusOK, release)
}

func (s *Server) masterHandler(c echo.Context) error {
	id, err := s.idParam(c)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid master id"})
	}
	ctx := c.Request().Context()
	spanAttrs(ctx, attribute.Int64("discogs.query.master_id", id))

	master, err := s.discogs.GetMaster(ctx, id)
	if err != nil {
		return respondError(c, err)
	}
	return c.JSON(http.StatusOK, master)
}

func (s *Server) artistHandler(c echo.Context) error {
	id, err := s.idParam(c)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid artist id"})
	}
	ctx := c.Request().Context()
	spanAttrs(ctx, attribute.Int64("discogs.query.artist_id", id))

	artist, err := s.discogs.GetArtist(ctx, id)
	if err != nil {
		return respondError(c, err)
	}
	return c.JSON(http.StatusOK, artist)
}

func (s *Server) labelHandler(c echo.Context) error {
	id, err := s.idParam(c)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid label id"})
	}
	ctx := c.Request().Context()
	spanAttrs(ctx, attribute.Int64("discogs.query.label_id", id))

	label, err := s.discogs.GetLabel(ctx, id)
	if err != nil {
		return respondError(c, err)
	}
	return c.JSON(http.StatusOK, label)
}
