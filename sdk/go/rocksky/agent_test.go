package rocksky

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/bluesky-social/indigo/xrpc"
	"github.com/tsirysndr/rocksky/sdk/go/rocksky/gen"
)

const testDID = "did:plc:test"

type captured struct {
	Collection string
	Record     map[string]any
}

// fakeAgent stands up a fake PDS (httptest) that captures every createRecord
// call instead of hitting a real server, and returns an Agent pointed at it.
func fakeAgent(t *testing.T, idx *Index) (*Agent, *[]captured) {
	t.Helper()
	var mu sync.Mutex
	var created []captured
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "com.atproto.repo.createRecord") {
			http.Error(w, "unexpected call: "+r.URL.Path, http.StatusInternalServerError)
			return
		}
		var in struct {
			Collection string         `json:"collection"`
			Record     map[string]any `json:"record"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		mu.Lock()
		n++
		created = append(created, captured{in.Collection, in.Record})
		uri := fmt.Sprintf("at://%s/%s/rec%d", testDID, in.Collection, n)
		mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"uri": uri})
	}))
	t.Cleanup(srv.Close)

	a := &Agent{client: &xrpc.Client{Host: srv.URL, Client: srv.Client()}, did: testDID}
	if idx != nil {
		a.UseIndex(idx)
	}
	return a, &created
}

// tempIndex opens a real bbolt dedup index in the test's temp dir (no PDS).
func tempIndex(t *testing.T) *Index {
	t.Helper()
	idx, err := OpenIndex(filepath.Join(t.TempDir(), "idx.db"))
	if err != nil {
		t.Fatalf("OpenIndex: %v", err)
	}
	t.Cleanup(func() { idx.Close() })
	return idx
}

func cols(c []captured) []string {
	out := make([]string, len(c))
	for i, x := range c {
		out[i] = x.Collection
	}
	return out
}

func find(c []captured, col string) map[string]any {
	for _, x := range c {
		if x.Collection == col {
			return x.Record
		}
	}
	return nil
}

func fullScrobble() gen.ScrobbleRecord {
	return gen.ScrobbleRecord{
		Title:       "Song A",
		Artist:      "Artist A",
		AlbumArtist: "Artist A",
		Album:       "Album A",
		Duration:    210000,
		Year:        2021,
		Genre:       "rock",
		SpotifyLink: "https://open.spotify.com/track/xyz",
		AlbumArtURL: "https://cdn.test/art.jpg",
		CreatedAt:   "2024-01-01T00:00:00.000Z",
	}
}

func eq(t *testing.T, got, want []string) {
	t.Helper()
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("collections mismatch:\n got: %v\nwant: %v", got, want)
	}
}

func TestScrobblePublishesMetadataInOrder(t *testing.T) {
	a, created := fakeAgent(t, tempIndex(t))
	if _, err := a.Scrobble(context.Background(), fullScrobble()); err != nil {
		t.Fatal(err)
	}
	eq(t, cols(*created), []string{colArtist, colAlbum, colSong, colScrobble})
}

func TestScrobbleStampsType(t *testing.T) {
	a, created := fakeAgent(t, tempIndex(t))
	if _, err := a.Scrobble(context.Background(), fullScrobble()); err != nil {
		t.Fatal(err)
	}
	for _, c := range *created {
		if c.Record["$type"] != c.Collection {
			t.Errorf("record in %s has $type %v", c.Collection, c.Record["$type"])
		}
	}
}

func TestScrobbleDerivesRecords(t *testing.T) {
	a, created := fakeAgent(t, tempIndex(t))
	if _, err := a.Scrobble(context.Background(), fullScrobble()); err != nil {
		t.Fatal(err)
	}

	artist := find(*created, colArtist)
	if artist["name"] != "Artist A" {
		t.Errorf("artist.name = %v", artist["name"])
	}

	album := find(*created, colAlbum)
	if album["title"] != "Album A" || album["artist"] != "Artist A" {
		t.Errorf("album title/artist = %v/%v", album["title"], album["artist"])
	}
	if album["year"] != float64(2021) || album["spotifyLink"] != "https://open.spotify.com/track/xyz" {
		t.Errorf("album year/spotifyLink = %v/%v", album["year"], album["spotifyLink"])
	}

	song := find(*created, colSong)
	if song["title"] != "Song A" || song["album"] != "Album A" || song["duration"] != float64(210000) {
		t.Errorf("song fields = %v", song)
	}

	// createdAt propagates to every derived record.
	for _, c := range *created {
		if c.Record["createdAt"] != "2024-01-01T00:00:00.000Z" {
			t.Errorf("%s createdAt = %v", c.Collection, c.Record["createdAt"])
		}
	}
}

func TestScrobbleDedupReusesMetadata(t *testing.T) {
	idx := tempIndex(t)
	a, created := fakeAgent(t, idx)
	if _, err := a.Scrobble(context.Background(), fullScrobble()); err != nil {
		t.Fatal(err)
	}
	*created = nil // ignore the first play's writes

	rec := fullScrobble()
	rec.CreatedAt = "2024-01-01T01:00:00.000Z" // a later play of the same song
	if _, err := a.Scrobble(context.Background(), rec); err != nil {
		t.Fatal(err)
	}
	eq(t, cols(*created), []string{colScrobble})
}

func TestScrobbleExactDuplicateWritesNothing(t *testing.T) {
	idx := tempIndex(t)
	a, created := fakeAgent(t, idx)
	uri1, err := a.Scrobble(context.Background(), fullScrobble())
	if err != nil {
		t.Fatal(err)
	}
	*created = nil

	uri2, err := a.Scrobble(context.Background(), fullScrobble())
	if err != nil {
		t.Fatal(err)
	}
	if uri2 != uri1 {
		t.Errorf("expected existing uri %q, got %q", uri1, uri2)
	}
	if len(*created) != 0 {
		t.Errorf("expected no writes, got %v", cols(*created))
	}
}

func TestScrobbleNoIndexRepublishes(t *testing.T) {
	a, created := fakeAgent(t, nil)
	for range 2 {
		if _, err := a.Scrobble(context.Background(), fullScrobble()); err != nil {
			t.Fatal(err)
		}
	}
	eq(t, cols(*created), []string{
		colArtist, colAlbum, colSong, colScrobble,
		colArtist, colAlbum, colSong, colScrobble,
	})
}

func TestScrobbleEmptyAlbumSkipsAlbumAndSong(t *testing.T) {
	a, created := fakeAgent(t, tempIndex(t))
	rec := gen.ScrobbleRecord{Title: "T", Artist: "A", AlbumArtist: "A", Album: ""}
	if _, err := a.Scrobble(context.Background(), rec); err != nil {
		t.Fatal(err)
	}
	eq(t, cols(*created), []string{colArtist, colScrobble})
}

func TestScrobbleEmptyAlbumArtistSkipsArtistAndAlbum(t *testing.T) {
	a, created := fakeAgent(t, tempIndex(t))
	rec := gen.ScrobbleRecord{Title: "T", Artist: "A", AlbumArtist: "", Album: "Alb"}
	if _, err := a.Scrobble(context.Background(), rec); err != nil {
		t.Fatal(err)
	}
	eq(t, cols(*created), []string{colSong, colScrobble})
}
