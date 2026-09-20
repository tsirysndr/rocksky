package otel

import (
	"log/slog"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// Metrics counts and times every request, labelled by route rather than by
// path so an id-bearing URL does not become a time series of its own. The
// instrument names match the HTTP semantic conventions, so these land in the
// same charts as the other services'.
func Metrics() echo.MiddlewareFunc {
	meter := otel.Meter("rocksky")
	requests, _ := meter.Int64Counter("http.server.requests",
		metric.WithDescription("HTTP requests served"))
	duration, _ := meter.Float64Histogram("http.server.request.duration",
		metric.WithDescription("How long each HTTP request took"),
		metric.WithUnit("s"))

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			started := time.Now()
			err := next(c)
			// The error has not been written yet when middleware unwinds, so
			// take the status the error handler will produce.
			status := c.Response().Status
			if err != nil {
				if httpErr, ok := err.(*echo.HTTPError); ok {
					status = httpErr.Code
				} else {
					status = 500
				}
			}
			attrs := metric.WithAttributes(
				attribute.String("http.route", c.Path()),
				attribute.String("http.request.method", c.Request().Method),
				attribute.Int("http.response.status_code", status),
			)
			requests.Add(c.Request().Context(), 1, attrs)
			duration.Record(c.Request().Context(), time.Since(started).Seconds(), attrs)
			return err
		}
	}
}

// RequestLogger logs one line per request through slog, which Setup fans out
// to both the console and the collector. This replaces echo's own Logger
// middleware, which prints straight to stdout in its own format and so never
// reached the log exporter — the reason the Go services showed traces and
// metrics in the viewer but not a single log line.
//
// Register it after the otelecho middleware: logging with the request context
// is what lets the bridge attach the active span, so a log line links to the
// trace of the request that produced it.
func RequestLogger() echo.MiddlewareFunc {
	return middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{
		LogStatus:    true,
		LogMethod:    true,
		LogURI:       true,
		LogRoutePath: true,
		LogLatency:   true,
		LogError:     true,
		LogValuesFunc: func(c echo.Context, v middleware.RequestLoggerValues) error {
			level := slog.LevelInfo
			if v.Status >= 500 {
				level = slog.LevelError
			} else if v.Status >= 400 {
				level = slog.LevelWarn
			}
			attrs := []slog.Attr{
				slog.String("http.request.method", v.Method),
				slog.String("url.path", v.URI),
				slog.String("http.route", v.RoutePath),
				slog.Int("http.response.status_code", v.Status),
				slog.Float64("duration_ms", float64(v.Latency.Microseconds())/1000.0),
			}
			if v.Error != nil {
				attrs = append(attrs, slog.String("error", v.Error.Error()))
			}
			slog.LogAttrs(c.Request().Context(), level, "http request", attrs...)
			return nil
		},
	})
}
