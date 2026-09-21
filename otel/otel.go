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
//
// # What ties the three signals together
//
// The same resource is on all three, so a backend groups them as one process:
// service.name, service.version, service.namespace and service.instance.id,
// matching what crates/telemetry stamps on the Rust services and what
// apps/api/src/otel.ts stamps on the Node ones.
//
// Logs carry the trace and span id of whatever span was open when they were
// written, which is why RequestLogger logs through the *request's* context —
// a slog call with context.Background() reaches the collector unlinked.
//
// The trace itself continues across the fleet through the W3C propagator set
// below: otelecho extracts it from incoming requests, and an outgoing client
// wrapped in otelhttp.NewTransport injects it into the next hop.
//
// And exemplars — a trace id hanging off one histogram sample, so a chart
// clicks straight through to the slow request behind the spike — are the link
// the Go SDK can give and the Rust, Node and Deno ones cannot. They are on by
// default here; WithExemplarFilter below says so out loud rather than leaving
// a link that only some of the fleet has resting on a default.
package otel

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"runtime/debug"
	"strings"
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
	"go.opentelemetry.io/otel/sdk/metric/exemplar"
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
	// The rest of the identity goes the same way, for the same reason:
	// OTEL_RESOURCE_ATTRIBUTES is read by the default resource's own detector,
	// so these land on all three signals without a Merge to go wrong. Appended
	// to whatever is already set rather than replacing it — the earlier entries
	// win in the SDK's parser, so anything configured in the environment
	// overrides these defaults.
	addResourceAttributes(map[string]string{
		"service.version": buildVersion(),
		// Every Rocksky process shares a namespace, which is what lets a
		// backend show "all of Rocksky" without naming the services by hand.
		"service.namespace": "rocksky",
		// Distinguishes two processes of the same service, and survives a
		// restart as a different value so a trace can be pinned to the run
		// that produced it. Legible on purpose: pid and start time match up
		// with ps and journalctl without a lookup.
		"service.instance.id": fmt.Sprintf("%d-%d", os.Getpid(), time.Now().UnixNano()),
		"process.pid":         fmt.Sprintf("%d", os.Getpid()),
	})
	if environment := os.Getenv("DEPLOYMENT_ENVIRONMENT"); environment != "" {
		addResourceAttributes(map[string]string{"deployment.environment.name": environment})
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
			// Attach the trace and span id of the sampled span a measurement
			// was taken under to the data point. This is the SDK's default;
			// naming it keeps a future default change from quietly removing
			// the only click-through from a chart to a trace that Rocksky has.
			// It is also why every Record call must be given the request's
			// context — see Metrics in echo.go.
			sdkmetric.WithExemplarFilter(exemplar.TraceBasedFilter),
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

// addResourceAttributes appends to OTEL_RESOURCE_ATTRIBUTES rather than
// setting it, and appends rather than prepends: the SDK's parser keeps the
// first value it sees for a key, so anything already in the environment
// overrides what is added here.
func addResourceAttributes(attributes map[string]string) {
	pairs := make([]string, 0, len(attributes))
	// Sorted, so the variable does not churn between runs for no reason.
	for _, key := range sortedKeys(attributes) {
		pairs = append(pairs, key+"="+attributes[key])
	}
	existing := os.Getenv("OTEL_RESOURCE_ATTRIBUTES")
	if existing != "" {
		pairs = append([]string{existing}, pairs...)
	}
	os.Setenv("OTEL_RESOURCE_ATTRIBUTES", strings.Join(pairs, ","))
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}

// buildVersion is the module's version as the Go toolchain recorded it. These
// services are built from a checkout rather than installed from a proxy, so
// the usual answer is the VCS revision stamped into the binary; "dev" when the
// build carried neither.
func buildVersion() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "dev"
	}
	for _, setting := range info.Settings {
		if setting.Key == "vcs.revision" && setting.Value != "" {
			return setting.Value
		}
	}
	if info.Main.Version != "" && info.Main.Version != "(devel)" {
		return info.Main.Version
	}
	return "dev"
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
