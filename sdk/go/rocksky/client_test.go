package rocksky

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newTestClient spins up an httptest.Server whose handler is the caller-supplied
// fn, and returns a Client preconfigured to talk to it. The server is
// auto-closed via t.Cleanup. Pass extra Options after WithHTTPClient/WithBaseURL
// — they win because functional options are applied in order.
func newTestClient(t *testing.T, fn http.HandlerFunc, extra ...Option) *Client {
	t.Helper()
	srv := httptest.NewServer(fn)
	t.Cleanup(srv.Close)
	opts := append([]Option{WithBaseURL(srv.URL), WithHTTPClient(srv.Client())}, extra...)
	return NewClient(opts...)
}

func TestNewClientDefaults(t *testing.T) {
	c := NewClient()
	if c.BaseURL() != DefaultBaseURL {
		t.Fatalf("default base URL = %q, want %q", c.BaseURL(), DefaultBaseURL)
	}
	if c.HasAuth() {
		t.Fatalf("HasAuth should be false without WithBearerToken")
	}
	if c.userAgent != DefaultUserAgent {
		t.Fatalf("default user agent = %q, want %q", c.userAgent, DefaultUserAgent)
	}
}

func TestWithBearerTokenSendsAuthorizationHeader(t *testing.T) {
	var gotAuth string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{}`)
	}, WithBearerToken("abc123"))

	if _, err := c.Actor.GetProfile(context.Background(), GetProfileParams{Actor: "tsiry.bsky.social"}); err != nil {
		t.Fatalf("GetProfile: %v", err)
	}
	if gotAuth != "Bearer abc123" {
		t.Fatalf("Authorization = %q, want %q", gotAuth, "Bearer abc123")
	}
}

func TestRequestsTargetXrpcPath(t *testing.T) {
	var gotPath string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = io.WriteString(w, `{}`)
	})
	if _, err := c.Actor.GetProfile(context.Background(), GetProfileParams{Actor: "alice"}); err != nil {
		t.Fatalf("GetProfile: %v", err)
	}
	if gotPath != "/xrpc/app.rocksky.actor.getProfile" {
		t.Fatalf("path = %q, want /xrpc/app.rocksky.actor.getProfile", gotPath)
	}
}

func TestQueryParamsAreEncoded(t *testing.T) {
	var gotQuery string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		_, _ = io.WriteString(w, `{}`)
	})
	_, err := c.Charts.GetTopArtists(context.Background(), TopChartParams{
		PaginationParams: PaginationParams{Limit: 10, Offset: 20},
		StartDate:        "2026-01-01",
	})
	if err != nil {
		t.Fatalf("GetTopArtists: %v", err)
	}
	for _, want := range []string{"limit=10", "offset=20", "startDate=2026-01-01"} {
		if !strings.Contains(gotQuery, want) {
			t.Fatalf("query %q missing %q", gotQuery, want)
		}
	}
}

func TestZeroValuedParamsAreOmitted(t *testing.T) {
	var gotQuery string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		_, _ = io.WriteString(w, `{}`)
	})
	// Limit=0, Offset=0 — neither should appear in the URL.
	if _, err := c.Charts.GetTopTracks(context.Background(), TopChartParams{}); err != nil {
		t.Fatalf("GetTopTracks: %v", err)
	}
	if gotQuery != "" {
		t.Fatalf("expected empty query, got %q", gotQuery)
	}
}

func TestProcedurePostsJSONBody(t *testing.T) {
	var (
		gotMethod      string
		gotContentType string
		gotBody        []byte
	)
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotContentType = r.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"s1","title":"Test"}`)
	}, WithBearerToken("tkn"))

	got, err := c.Scrobble.CreateScrobble(context.Background(), CreateScrobbleInput{
		Title:  "Test",
		Artist: "Acme",
	})
	if err != nil {
		t.Fatalf("CreateScrobble: %v", err)
	}
	if gotMethod != http.MethodPost {
		t.Fatalf("method = %s, want POST", gotMethod)
	}
	if gotContentType != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", gotContentType)
	}
	var payload map[string]any
	if err := json.Unmarshal(gotBody, &payload); err != nil {
		t.Fatalf("body not JSON: %v (raw=%s)", err, gotBody)
	}
	if payload["title"] != "Test" || payload["artist"] != "Acme" {
		t.Fatalf("body payload = %+v", payload)
	}
	if got.Title != "Test" {
		t.Fatalf("decoded title = %q, want Test", got.Title)
	}
}

func TestErrorEnvelopeIsDecoded(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":"AuthRequired","message":"missing bearer"}`)
	})
	_, err := c.Scrobble.CreateScrobble(context.Background(), CreateScrobbleInput{Title: "t", Artist: "a"})
	if err == nil {
		t.Fatal("expected error")
	}
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *rocksky.Error, got %T", err)
	}
	if !apiErr.IsUnauthorized() {
		t.Fatalf("IsUnauthorized = false (status=%d)", apiErr.StatusCode)
	}
	if apiErr.Kind != "AuthRequired" || apiErr.Message != "missing bearer" {
		t.Fatalf("error envelope not decoded: %+v", apiErr)
	}
}

func TestPlainTextErrorFallback(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = io.WriteString(w, "upstream timeout")
	})
	_, err := c.Actor.GetProfile(context.Background(), GetProfileParams{Actor: "x"})
	if err == nil {
		t.Fatal("expected error")
	}
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *rocksky.Error, got %T", err)
	}
	if apiErr.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", apiErr.StatusCode)
	}
	if apiErr.Message != "upstream timeout" {
		t.Fatalf("message = %q", apiErr.Message)
	}
}

func TestUserAgentAndCustomHeader(t *testing.T) {
	var gotUA, gotCustom string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotUA = r.Header.Get("User-Agent")
		gotCustom = r.Header.Get("X-Trace-Id")
		_, _ = io.WriteString(w, `{}`)
	}, WithUserAgent("rocksky-cli/1.2"), WithHeader("X-Trace-Id", "abc"))
	if _, err := c.Actor.GetProfile(context.Background(), GetProfileParams{Actor: "x"}); err != nil {
		t.Fatalf("GetProfile: %v", err)
	}
	if gotUA != "rocksky-cli/1.2" {
		t.Fatalf("UA = %q", gotUA)
	}
	if gotCustom != "abc" {
		t.Fatalf("custom header = %q", gotCustom)
	}
}

func TestContextCancellation(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	})
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // pre-cancel
	_, err := c.Actor.GetProfile(ctx, GetProfileParams{Actor: "x"})
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
}
