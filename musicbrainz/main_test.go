package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/teal-fm/piper/service/musicbrainz"
)

func TestMbriffTimeout(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  time.Duration
	}{
		{"", time.Second}, {"250ms", 250 * time.Millisecond}, {"invalid", time.Second}, {"0s", time.Second}, {"-1s", time.Second},
	} {
		t.Run(tc.value, func(t *testing.T) {
			t.Setenv("MBRIFF_TIMEOUT", tc.value)
			if got := newMbriffClient().Timeout; got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestSlowMbriffReleasesFallbackPromptly(t *testing.T) {
	t.Setenv("MBRIFF_TIMEOUT", "20ms")
	local := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer local.Close()
	s := &Server{mbriffURL: local.URL, mbriffClient: newMbriffClient()}
	started := time.Now()
	_, err := s.mbriffSearchRecordings(context.Background(), musicbrainz.SearchParams{Track: "Play My Music"})
	if err == nil {
		t.Fatal("expected local lookup timeout")
	}
	if time.Since(started) > time.Second {
		t.Fatal("local lookup exceeded configured deadline")
	}
}

func TestCanceledHydrateDoesNotStartExternalFallback(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodPost, "/hydrate", strings.NewReader(`{"name":"Play My Music","artist":[{"name":"Jonas Brothers"}]}`)).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	s := &Server{mbriffURL: "http://127.0.0.1:1", mbriffClient: newMbriffClient()}
	// mb is deliberately nil: entering the public API fallback would panic.
	if err := s.hydrateHandler(echo.New().NewContext(req, recorder)); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != 499 {
		t.Fatalf("got %d, want canceled status", recorder.Code)
	}
}
