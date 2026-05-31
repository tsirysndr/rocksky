package rocksky

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestScrobbleBuilderSendsExpectedPayload(t *testing.T) {
	var gotPath string
	var gotBody []byte
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"s1","title":"Black Hole Sun","artist":"Soundgarden","uri":"at://x/scrobble/1"}`)
	}, WithBearerToken("tkn"))

	out, err := c.Scrobble.NewScrobble("Black Hole Sun", "Soundgarden").
		Album("Superunknown").
		Duration(320_000).
		ISRC("USXXX1234567").
		Year(1994).
		Timestamp(1_700_000_000).
		Send(context.Background())
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if gotPath != "/xrpc/app.rocksky.scrobble.createScrobble" {
		t.Fatalf("path = %q", gotPath)
	}
	var payload map[string]any
	if err := json.Unmarshal(gotBody, &payload); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	for k, want := range map[string]any{
		"title":     "Black Hole Sun",
		"artist":    "Soundgarden",
		"album":     "Superunknown",
		"duration":  float64(320_000),
		"isrc":      "USXXX1234567",
		"year":      float64(1994),
		"timestamp": float64(1_700_000_000),
	} {
		if payload[k] != want {
			t.Fatalf("body[%s] = %v, want %v", k, payload[k], want)
		}
	}
	if out.URI != "at://x/scrobble/1" {
		t.Fatalf("uri = %q", out.URI)
	}
}

func TestScrobbleBuilderInputExposesPendingPayload(t *testing.T) {
	b := (&ScrobbleService{}).NewScrobble("T", "A").Album("X").TrackNumber(3)
	in := b.Input()
	if in.Title != "T" || in.Artist != "A" || in.Album != "X" || in.TrackNumber != 3 {
		t.Fatalf("Input() = %+v", in)
	}
}

func TestShoutBuilderRoundTrip(t *testing.T) {
	var gotBody []byte
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"sh1","message":"on repeat","author":{"handle":"me.bsky.social"}}`)
	}, WithBearerToken("tkn"))

	out, err := c.Shout.NewShout("on repeat").Send(context.Background())
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if !strings.Contains(string(gotBody), `"message":"on repeat"`) {
		t.Fatalf("body = %s", gotBody)
	}
	if out.ID != "sh1" || out.Author.Handle != "me.bsky.social" {
		t.Fatalf("out = %+v", out)
	}
}

func TestReplyBuilderRoundTrip(t *testing.T) {
	var gotBody []byte
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"r1","message":"agreed","parent":"at://parent/1"}`)
	}, WithBearerToken("tkn"))

	out, err := c.Shout.NewReply("at://parent/1", "agreed").Send(context.Background())
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(gotBody, &payload); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	if payload["parent"] != "at://parent/1" || payload["message"] != "agreed" {
		t.Fatalf("body = %+v", payload)
	}
	if out.Parent != "at://parent/1" {
		t.Fatalf("out.Parent = %q", out.Parent)
	}
}

func TestScrobblesChartBuilderEncodesFilters(t *testing.T) {
	var gotQuery string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"scrobbles":[{"date":"2025-01-01","count":3}]}`)
	})

	got, err := c.Charts.NewScrobblesChart().
		Actor("tsiry.bsky.social").
		From("2025-01-01").
		To("2025-12-31").
		Genre("rock").
		Do(context.Background())
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	for _, want := range []string{"did=tsiry", "from=2025-01-01", "to=2025-12-31", "genre=rock"} {
		if !strings.Contains(gotQuery, want) {
			t.Fatalf("query %q missing %q", gotQuery, want)
		}
	}
	if len(got.Scrobbles) != 1 || got.Scrobbles[0].Count != 3 {
		t.Fatalf("got = %+v", got)
	}
}
