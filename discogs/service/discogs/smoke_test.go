package discogs

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestSmokeRealDiscogsAPI hits the live Discogs API. It is skipped by default;
// run it with a real token:
//
//	DISCOGS_SMOKE=1 DISCOGS_TOKEN=... go test ./service/discogs -run TestSmokeRealDiscogsAPI -v
//
// One Enrich call costs at most three requests, well under the 60 per minute a
// token is allowed.
func TestSmokeRealDiscogsAPI(t *testing.T) {
	if os.Getenv("DISCOGS_SMOKE") == "" {
		t.Skip("set DISCOGS_SMOKE=1 to run the live Discogs API smoke test")
	}

	svc, err := NewDiscogsService()
	if err != nil {
		t.Fatalf("NewDiscogsService: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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
		t.Fatal("expected an enriched track from live Discogs")
	}

	tr := resp.Track
	t.Logf("enriched: title=%q artist=%q album=%q label=%q catno=%q year=%d originalYear=%d durationMs=%d genres=%v styles=%v art=%q",
		tr.Title, tr.Artist, tr.Album, tr.Label, tr.CatalogNumber, tr.Year, tr.OriginalYear,
		tr.DurationMs, tr.Genres, tr.Styles, tr.AlbumArt)
	t.Logf("quota: %+v", svc.RateLimit())

	if tr.Title == "" || tr.Artist == "" || tr.Album == "" {
		t.Error("live track missing title/artist/album")
	}
	if tr.DiscogsReleaseID == 0 {
		t.Error("expected a Discogs release id")
	}
	if tr.Label == "" {
		t.Error("expected a label from the live release")
	}
	// Discogs serves images only to authenticated clients, so an empty one
	// here usually means the token was not sent.
	if tr.AlbumArt == "" {
		t.Error("expected album art from live Discogs")
	}
	if len(resp.Matches) == 0 {
		t.Error("expected at least one match from live Discogs")
	}
	for i, m := range resp.Matches {
		t.Logf("match[%d]: id=%d artist=%q album=%q year=%d score=%.3f", i, m.ID, m.Artist, m.Album, m.Year, m.Score)
	}
}
