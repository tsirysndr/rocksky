//! Carrying the trace across a process boundary.
//!
//! A trace that stops at the edge of a service is three traces where there
//! should be one, and the request that spans them can no longer be looked up
//! by the one id the person debugging has. So the context travels on the wire,
//! as the W3C `traceparent`/`tracestate` headers every backend understands,
//! plus `baggage` for the keys a caller wants to carry along with it.
//!
//! [`crate::init`] installs [`propagator`] globally. Incoming requests are
//! handled by [`crate::middleware`], which extracts with it; outgoing requests
//! are the caller's job, and [`outgoing_headers`] is the one line that does
//! it.

use opentelemetry::propagation::{Injector, TextMapCompositePropagator};
use opentelemetry_sdk::propagation::{BaggagePropagator, TraceContextPropagator};

/// The propagator every Rocksky service uses, in and out.
///
/// W3C trace context rather than B3 or Jaeger's own: it is the format the
/// Go services' `propagation.TraceContext`, the Node SDK's default and the
/// Erlang SDK's `otel_propagator_trace_context` all speak, so a trace started
/// anywhere in the fleet is continued everywhere else without a translation
/// step.
pub fn propagator() -> TextMapCompositePropagator {
    TextMapCompositePropagator::new(vec![
        Box::new(TraceContextPropagator::new()),
        Box::new(BaggagePropagator::new()),
    ])
}

/// Collects `traceparent` — and `tracestate`/`baggage` when there are any —
/// for the span that is currently open.
///
/// Empty when nothing is being traced, which is the case outside a `tracing`
/// span and when the trace was sampled away, so the result can be applied to a
/// request unconditionally:
///
/// ```text
/// let mut request = client.get(url);
/// for (name, value) in rocksky_telemetry::propagation::outgoing_headers() {
///     request = request.header(name, value);
/// }
/// let response = request.send().await?;
/// ```
///
/// This reads the *current* OpenTelemetry context, which `tracing` spans enter
/// on the way in — so the call site needs a span open above it, not a handle
/// passed down to it.
pub fn outgoing_headers() -> Vec<(String, String)> {
    let mut carrier = Headers(Vec::new());
    opentelemetry::global::get_text_map_propagator(|propagator| {
        propagator.inject(&mut carrier);
    });
    carrier.0
}

/// Collects the headers into a list rather than a map: the caller is about to
/// set them on a request one at a time, and a `HashMap` here would mean
/// depending on whichever HTTP client this crate is used from.
struct Headers(Vec<(String, String)>);

impl Injector for Headers {
    fn set(&mut self, key: &str, value: String) {
        self.0.push((key.to_string(), value));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry::baggage::BaggageExt;
    use opentelemetry::propagation::{Extractor, TextMapPropagator};
    use opentelemetry::trace::{
        SpanContext, SpanId, TraceContextExt, TraceFlags, TraceId, TraceState,
    };
    use opentelemetry::Context;

    struct Map(std::collections::HashMap<String, String>);

    impl Extractor for Map {
        fn get(&self, key: &str) -> Option<&str> {
            self.0.get(key).map(String::as_str)
        }
        fn keys(&self) -> Vec<&str> {
            self.0.keys().map(String::as_str).collect()
        }
    }

    fn sampled_context() -> Context {
        Context::new().with_remote_span_context(SpanContext::new(
            TraceId::from_hex("0123456789abcdef0123456789abcdef").unwrap(),
            SpanId::from_hex("0123456789abcdef").unwrap(),
            TraceFlags::SAMPLED,
            true,
            TraceState::default(),
        ))
    }

    /// The whole point of the composite: what one service writes, the next one
    /// reads back as the same trace. Asserted end to end rather than against a
    /// literal header, since the id is what has to survive, not the spelling.
    #[test]
    fn a_trace_survives_a_round_trip_through_the_headers() {
        let propagator = propagator();
        let context = sampled_context();

        let mut carrier = Headers(Vec::new());
        propagator.inject_context(&context, &mut carrier);

        let headers = Map(carrier.0.into_iter().collect());
        assert!(
            headers.get("traceparent").is_some(),
            "nothing to continue the trace with"
        );

        let extracted = propagator.extract(&headers);
        assert_eq!(
            extracted.span().span_context().trace_id(),
            context.span().span_context().trace_id()
        );
    }

    /// Baggage is the half that `TraceContextPropagator` alone would drop, and
    /// dropping it silently is how a key set at the edge goes missing three
    /// services later.
    #[test]
    fn baggage_travels_with_the_trace() {
        let propagator = propagator();
        let context = sampled_context().with_baggage(vec![opentelemetry::KeyValue::new(
            "rocksky.did",
            "did:plc:example",
        )]);

        let mut carrier = Headers(Vec::new());
        propagator.inject_context(&context, &mut carrier);

        let headers = Map(carrier.0.into_iter().collect());
        assert!(headers.get("baggage").is_some());

        let extracted = propagator.extract(&headers);
        assert_eq!(
            extracted
                .baggage()
                .get("rocksky.did")
                .map(ToString::to_string),
            Some("did:plc:example".to_string())
        );
    }

    /// Outside a span there is no context to propagate, and the caller applies
    /// the result unconditionally — so it has to be empty rather than a
    /// `traceparent` of all zeroes, which a backend would read as a trace.
    #[test]
    fn nothing_is_injected_without_an_active_span() {
        let mut carrier = Headers(Vec::new());
        propagator().inject_context(&Context::new(), &mut carrier);
        assert!(carrier.0.is_empty());
    }
}
