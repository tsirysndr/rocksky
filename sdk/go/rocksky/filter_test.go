package rocksky

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFilterCanonicalVectors(t *testing.T) {
	a := Eq("artist", "Radiohead")
	b := Eq("artist", "Muse")
	cases := []struct {
		name string
		f    Filter
		want string
	}{
		{"eq bare", Eq("artist", "Radiohead"), `artist==Radiohead`},
		{"eq quoted space", Eq("artist", "Daft Punk"), `artist=="Daft Punk"`},
		{"eq escaped quotes", Eq("title", `He said "hi"`), `title=="He said \"hi\""`},
		{"eq wildcard", Eq("artist", "Daft*"), `artist==Daft*`},
		{"ne", Ne("artist", "Eminem"), `artist!=Eminem`},
		{"gt", Gt("duration", 200000), `duration=gt=200000`},
		{"ge", Ge("year", 2000), `year=ge=2000`},
		{"lt", Lt("trackNumber", 5), `trackNumber=lt=5`},
		{"le", Le("year", 1999), `year=le=1999`},
		{"in", In("genre", "house", "electro"), `genre=in=(house,electro)`},
		{"out quoted", Out("genre", "hip hop"), `genre=out=("hip hop")`},
		{"is null", IsNull("uri"), `uri==null`},
		{"is not null", IsNotNull("uri"), `uri!=null`},
		{"and", Eq("artist", "Radiohead").And(Gt("duration", 200000)),
			`artist==Radiohead;duration=gt=200000`},
		{"or", Eq("artist", "Radiohead").Or(Eq("artist", "Muse")),
			`artist==Radiohead,artist==Muse`},
		{"or then and parenthesized", a.Or(b).And(Gt("duration", 200000)),
			`(artist==Radiohead,artist==Muse);duration=gt=200000`},
		{"and with or operand parenthesized",
			Eq("artist", "Radiohead").And(Eq("genre", "house").Or(Eq("genre", "electro"))),
			`artist==Radiohead;(genre==house,genre==electro)`},
		{"and then or no parens",
			Eq("artist", "Radiohead").And(Gt("duration", 200000)).Or(Eq("genre", "house")),
			`artist==Radiohead;duration=gt=200000,genre==house`},
		{"dotted field", Eq("track.artist", "Daft Punk"), `track.artist=="Daft Punk"`},
		{"bool", Eq("liked", true), `liked==true`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.f.Build(); got != tc.want {
				t.Errorf("Build() = %q, want %q", got, tc.want)
			}
			if got := tc.f.String(); got != tc.want {
				t.Errorf("String() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestFilterEmptyInOutPanics(t *testing.T) {
	for _, tc := range []struct {
		name string
		call func()
	}{
		{"In", func() { In("genre") }},
		{"Out", func() { Out("genre") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Errorf("%s with no values did not panic", tc.name)
				}
			}()
			tc.call()
		})
	}
}

// The filter param must reach the AppView verbatim as the `filter` query param.
func TestCatalogSongsSendsFilterParam(t *testing.T) {
	var gotFilter string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotFilter = r.URL.Query().Get("filter")
		_ = json.NewEncoder(w).Encode(map[string]any{"tracks": []any{}})
	}))
	t.Cleanup(srv.Close)

	c := NewClient(srv.URL)
	if _, err := c.CatalogSongs(context.Background(), 10, 0, "", Eq("artist", "Daft Punk").Build()); err != nil {
		t.Fatalf("CatalogSongs: %v", err)
	}
	if want := `artist=="Daft Punk"`; gotFilter != want {
		t.Errorf("server received filter=%q, want %q", gotFilter, want)
	}
}
