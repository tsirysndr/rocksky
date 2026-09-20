package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	rotel "github.com/tsirysndr/rocksky/otel"
	"github.com/tsirysndr/rocksky/spotify/service/spotify"
	"go.opentelemetry.io/contrib/instrumentation/github.com/labstack/echo/otelecho"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// statusClientClosedRequest is nginx's non-standard 499: the client
// disconnected before the response was written.
const statusClientClosedRequest = 499

type Server struct {
	spotify *spotify.SpotifyService
}

func main() {
	srv := &Server{
		spotify: spotify.NewSpotifyService(),
	}

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())

	// Telemetry first, so every request below is traced and counted. The
	// shutdown flush runs on the way out — without it a short-lived process
	// exports nothing at all.
	otelShutdown := rotel.Setup(context.Background(), "spotify-proxy")
	defer otelShutdown(context.Background())
	e.Use(otelecho.Middleware("spotify-proxy"))
	e.Use(rotel.Metrics())
	e.Use(rotel.RequestLogger())

	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	// Mirror the Spotify Web API paths so switching a client to this proxy is
	// just a base-URL change (https://api.spotify.com/v1 -> http://host:8091/v1).
	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete} {
		e.Add(method, "/v1/*", srv.proxyHandler)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	go func() {
		// Prefer the service-specific SPOTIFY_PROXY_PORT, falling back to PORT
		// and finally the default.
		port := os.Getenv("SPOTIFY_PROXY_PORT")
		if port == "" {
			port = os.Getenv("PORT")
		}
		if port == "" {
			port = "8091"
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

// spanAttrs records proxy details on the request's active span (opened by
// the otelecho middleware), so a trace shows what was asked upstream and
// where the answer came from.
func spanAttrs(ctx context.Context, attrs ...attribute.KeyValue) {
	trace.SpanFromContext(ctx).SetAttributes(attrs...)
}

// proxyHandler forwards the request to the Spotify Web API, serving cached
// responses when fresh and stale ones while Spotify is rate limiting us.
func (s *Server) proxyHandler(c echo.Context) error {
	path := "/" + c.Param("*")
	if qs := c.QueryString(); qs != "" {
		path += "?" + qs
	}
	// The otelecho span is named for the catch-all route ("/v1/*"), which
	// says nothing; the proxied path and query are the actual request. The
	// Authorization header is deliberately not recorded.
	spanAttrs(c.Request().Context(),
		attribute.String("spotify.proxy.path", "/"+c.Param("*")),
		attribute.String("spotify.proxy.query", c.QueryString()),
	)

	var body []byte
	if c.Request().Body != nil && c.Request().Method != http.MethodGet {
		data, err := io.ReadAll(io.LimitReader(c.Request().Body, 1<<20))
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "failed to read request body"})
		}
		body = data
	}

	result, err := s.spotify.Proxy(
		c.Request().Context(),
		c.Request().Method,
		path,
		c.Request().Header.Get("Authorization"),
		body,
	)
	if err != nil {
		var proxyErr *spotify.ProxyError
		switch {
		case errors.As(err, &proxyErr):
			return c.JSON(proxyErr.Status, map[string]string{"error": proxyErr.Message})
		case c.Request().Context().Err() != nil:
			// The caller hung up before we could answer; there is nobody left
			// to write to. Log it as 499 (nginx's convention) so that genuine
			// upstream failures stay visible as 502 in the access log.
			return c.NoContent(statusClientClosedRequest)
		case errors.Is(err, context.DeadlineExceeded):
			return c.JSON(http.StatusGatewayTimeout, map[string]string{"error": err.Error()})
		default:
			return c.JSON(http.StatusBadGateway, map[string]string{"error": err.Error()})
		}
	}

	if result.RetryAfter != "" {
		c.Response().Header().Set("Retry-After", result.RetryAfter)
	}
	// X-Source: riff means the answer came from the local Parquet catalog and
	// cost no Spotify quota; spotify means it did.
	source := result.Source
	if source == "" {
		source = spotify.SourceSpotify
	}
	c.Response().Header().Set("X-Source", source)
	cache := "MISS"
	switch {
	case result.Stale:
		cache = "STALE"
	case result.Cached:
		cache = "HIT"
	}
	c.Response().Header().Set("X-Cache", cache)
	// Where the answer came from and what it cost: riff or cache answers
	// spend no Spotify quota, upstream ones do.
	spanAttrs(c.Request().Context(),
		attribute.String("spotify.proxy.source", source),
		attribute.String("spotify.proxy.cache", cache),
		attribute.Int("spotify.proxy.upstream_status", result.Status),
	)

	if result.Status == http.StatusNoContent {
		return c.NoContent(http.StatusNoContent)
	}
	return c.Blob(result.Status, result.ContentType, result.Body)
}
