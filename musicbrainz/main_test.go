package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestCanceledHydrateDoesNotStartExternalFallback(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodPost, "/hydrate", strings.NewReader(`{"name":"Play My Music","artist":[{"name":"Jonas Brothers"}]}`)).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	s := &Server{}
	// mb is deliberately nil: entering the public API fallback would panic.
	if err := s.hydrateHandler(echo.New().NewContext(req, recorder)); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != 499 {
		t.Fatalf("got %d, want canceled status", recorder.Code)
	}
}
