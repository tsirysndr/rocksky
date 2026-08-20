package deezer

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestSmokeRealDeezerAPI hits the live Deezer API to verify the enrichment
// end-to-end against the real service. It is skipped by default; run it with:
//
//	DEEZER_SMOKE=1 go test ./service/deezer -run TestSmokeRealDeezerAPI -v
//
// It makes a single Enrich call (a handful of requests total), which is far
// under Deezer's 50 req / 5 s quota, so it will not trip rate limits.
func TestSmokeRealDeezerAPI(t *testing.T) {
	if os.Getenv("DEEZER_SMOKE") == "" {
		t.Skip("set DEEZER_SMOKE=1 to run the live Deezer API smoke test")
	}

	// Real base URL, real rolling-window limiter and circuit breaker. This is
	// also the quickest way to tell whether Deezer is refusing a given host:
	// run it there and read the upstream status out of the failure.
	svc := NewDeezerService()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	resp, err := svc.Enrich(ctx, SearchParams{
		Title:  "Get Lucky",
		Artist: "Daft Punk",
		Album:  "Random Access Memories",
	})
	if err != nil {
		t.Fatalf("live Enrich error: %v", err)
	}
	if resp.Track == nil {
		t.Fatal("expected an enriched track from live Deezer")
	}

	tr := resp.Track
	t.Logf("enriched: title=%q artist=%q album=%q isrc=%q label=%q year=%d durationMs=%d genres=%v art=%q",
		tr.Title, tr.Artist, tr.Album, tr.ISRC, tr.Label, tr.Year, tr.DurationMs, tr.Genres, tr.AlbumArt)

	if tr.Title == "" || tr.Artist == "" {
		t.Error("live track missing title/artist")
	}
	// Duration unit alignment with Spotify's `duration_ms`: Deezer's API returns
	// seconds, which the service multiplies to milliseconds. A real song is
	// minutes long, so the value must be in the hundreds-of-thousands (ms), not
	// the low hundreds (seconds).
	if tr.DurationMs < 60_000 {
		t.Errorf("durationMs=%d looks like seconds, not milliseconds — unit misaligned with Spotify", tr.DurationMs)
	}
	if tr.ISRC == "" {
		t.Error("expected ISRC from live full-track fetch")
	}
	if tr.AlbumArt == "" {
		t.Error("expected album art from live Deezer")
	}
	if tr.DeezerTrackID == 0 {
		t.Error("expected a Deezer track id")
	}
	if len(resp.Matches) == 0 {
		t.Error("expected at least one match from live Deezer")
	}
	for i, m := range resp.Matches {
		t.Logf("match[%d]: id=%d title=%q artist=%q score=%.3f", i, m.ID, m.Title, m.Artist, m.Score)
	}
}
