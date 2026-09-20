// Package otel wires the three OpenTelemetry signals for the small Go
// services (spotify-proxy, musicbrainz, deezer), mirroring what the Rust
// services get from rocksky-telemetry and the Node services from otel.ts:
// traces and a per-request metric from middleware, runtime metrics, and logs
// bridged from the standard library into OTLP.
//
// Configuration is the standard environment: OTEL_EXPORTER_OTLP_ENDPOINT
// (defaulting to the local collector, http://127.0.0.1:4318) and
// OTEL_EXPORTER_OTLP_HEADERS for the collector's ingest token — the same
// variable the Node services already receive, so a service run under doppler
// needs nothing extra.
package otel

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"time"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// Setup installs tracer, meter and logger providers for this process and
// returns a shutdown function that flushes them. Telemetry must never take
// the service down: any exporter that cannot be built is reported on stderr
// and skipped, and the returned shutdown is safe to call regardless.
func Setup(ctx context.Context, serviceName string) func(context.Context) error {
	// The default endpoint is the local collector. Set through the standard
	// variable rather than exporter options, so anything actually configured
	// in the environment wins untouched.
	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" {
		os.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318")
	}
	// The name goes through the environment the default resource reads, not
	// through resource.Merge: merging a resource carrying a semconv schema
	// URL against Default()'s own conflicts whenever the two SDK versions
	// disagree, and the silent fallback shipped every service as
	// "unknown_service:main".
	if os.Getenv("OTEL_SERVICE_NAME") == "" {
		os.Setenv("OTEL_SERVICE_NAME", serviceName)
	}
	res := resource.Default()

	var shutdowns []func(context.Context) error

	// The trace of an incoming request continues across services.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{}, propagation.Baggage{},
	))

	if exporter, err := otlptracehttp.New(ctx); err == nil {
		provider := sdktrace.NewTracerProvider(
			sdktrace.WithBatcher(exporter),
			sdktrace.WithResource(res),
		)
		otel.SetTracerProvider(provider)
		shutdowns = append(shutdowns, provider.Shutdown)
	} else {
		slog.Error("otel: trace exporter disabled", "error", err)
	}

	if exporter, err := otlpmetrichttp.New(ctx); err == nil {
		provider := sdkmetric.NewMeterProvider(
			sdkmetric.WithReader(sdkmetric.NewPeriodicReader(
				exporter, sdkmetric.WithInterval(10*time.Second),
			)),
			sdkmetric.WithResource(res),
		)
		otel.SetMeterProvider(provider)
		shutdowns = append(shutdowns, provider.Shutdown)
		if err := runtime.Start(); err != nil {
			slog.Error("otel: runtime metrics disabled", "error", err)
		}
	} else {
		slog.Error("otel: metric exporter disabled", "error", err)
	}

	if exporter, err := otlploghttp.New(ctx); err == nil {
		provider := sdklog.NewLoggerProvider(
			sdklog.WithProcessor(sdklog.NewBatchProcessor(exporter)),
			sdklog.WithResource(res),
		)
		global.SetLoggerProvider(provider)
		shutdowns = append(shutdowns, provider.Shutdown)

		// Everything logged through slog — and through the standard log
		// package, which slog.SetDefault reroutes — goes to both the console
		// (journalctl keeps working) and the collector.
		console := slog.NewTextHandler(os.Stderr, nil)
		bridge := otelslog.NewHandler(serviceName, otelslog.WithLoggerProvider(provider))
		slog.SetDefault(slog.New(fanout{console, bridge}))
	} else {
		slog.Error("otel: log exporter disabled", "error", err)
	}

	return func(ctx context.Context) error {
		var errs []error
		for _, shutdown := range shutdowns {
			errs = append(errs, shutdown(ctx))
		}
		return errors.Join(errs...)
	}
}

// fanout sends every record to all of its handlers.
type fanout []slog.Handler

func (f fanout) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range f {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (f fanout) Handle(ctx context.Context, r slog.Record) error {
	var errs []error
	for _, h := range f {
		if h.Enabled(ctx, r.Level) {
			errs = append(errs, h.Handle(ctx, r.Clone()))
		}
	}
	return errors.Join(errs...)
}

func (f fanout) WithAttrs(attrs []slog.Attr) slog.Handler {
	out := make(fanout, len(f))
	for i, h := range f {
		out[i] = h.WithAttrs(attrs)
	}
	return out
}

func (f fanout) WithGroup(name string) slog.Handler {
	out := make(fanout, len(f))
	for i, h := range f {
		out[i] = h.WithGroup(name)
	}
	return out
}
