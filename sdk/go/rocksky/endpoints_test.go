package rocksky

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

// mux returns a handler that dispatches on r.URL.Path, panicking on unknown
// paths. The value is the JSON body that gets written back verbatim.
func mux(t *testing.T, routes map[string]string) http.HandlerFunc {
	t.Helper()
	return func(w http.ResponseWriter, r *http.Request) {
		body, ok := routes[r.URL.Path]
		if !ok {
			t.Errorf("unexpected request path: %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, body)
	}
}

func TestActorGetProfile(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.actor.getProfile": `{
			"id": "u1",
			"did": "did:plc:abc",
			"handle": "tsiry.bsky.social",
			"displayName": "Tsiry",
			"spotifyConnected": true
		}`,
	}))
	got, err := c.Actor.GetProfile(context.Background(), GetProfileParams{Actor: "tsiry.bsky.social"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Handle != "tsiry.bsky.social" || !got.SpotifyConnected {
		t.Fatalf("decoded profile: %+v", got)
	}
}

func TestActorGetActorScrobbles(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.actor.getActorScrobbles": `{
			"scrobbles": [
				{"id":"s1","title":"Song A","artist":"Artist 1"},
				{"id":"s2","title":"Song B","artist":"Artist 2","liked":true,"likesCount":3}
			]
		}`,
	}))
	got, err := c.Actor.GetActorScrobbles(context.Background(), ActorListParams{
		Actor:            "tsiry.bsky.social",
		PaginationParams: PaginationParams{Limit: 2},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Scrobbles) != 2 {
		t.Fatalf("got %d scrobbles", len(got.Scrobbles))
	}
	if !got.Scrobbles[1].Liked || got.Scrobbles[1].LikesCount != 3 {
		t.Fatalf("scrobble[1] = %+v", got.Scrobbles[1])
	}
}

func TestSongGetSong(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.song.getSong": `{
			"id": "song-1",
			"title": "Black Hole Sun",
			"artist": "Soundgarden",
			"playCount": 12,
			"firstScrobble": {"handle":"alice","timestamp":"2025-01-01T00:00:00Z"}
		}`,
	}))
	got, err := c.Song.GetSong(context.Background(), GetSongParams{ISRC: "USXXX1234567"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Black Hole Sun" || got.PlayCount != 12 {
		t.Fatalf("got = %+v", got)
	}
	if got.FirstScrobble == nil || got.FirstScrobble.Handle != "alice" {
		t.Fatalf("firstScrobble = %+v", got.FirstScrobble)
	}
}

func TestAlbumGetAlbumTracks(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.album.getAlbumTracks": `{
			"tracks": [
				{"id":"t1","title":"T1","trackNumber":1},
				{"id":"t2","title":"T2","trackNumber":2}
			]
		}`,
	}))
	got, err := c.Album.GetAlbumTracks(context.Background(), GetAlbumTracksParams{URI: "at://did:plc:abc/app.rocksky.album/x"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Tracks) != 2 || got.Tracks[1].TrackNumber != 2 {
		t.Fatalf("got = %+v", got)
	}
}

func TestScrobbleGetScrobblesFollowing(t *testing.T) {
	var gotQuery string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"scrobbles":[]}`)
	}, WithBearerToken("tkn"))

	_, err := c.Scrobble.GetScrobbles(context.Background(), GetScrobblesParams{Following: true, PaginationParams: PaginationParams{Limit: 5}})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"following=true", "limit=5"} {
		if !strings.Contains(gotQuery, want) {
			t.Fatalf("query %q missing %q", gotQuery, want)
		}
	}
}

func TestStatsGetStats(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.stats.getStats": `{
			"scrobbles": 1234, "artists": 80, "albums": 200, "tracks": 600, "lovedTracks": 42
		}`,
	}))
	got, err := c.Stats.GetStats(context.Background(), GetStatsParams{Actor: "tsiry.bsky.social"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Scrobbles != 1234 || got.LovedTracks != 42 {
		t.Fatalf("got = %+v", got)
	}
}

func TestStatsGetWrapped(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.stats.getWrapped": `{
			"year": 2025,
			"totalScrobbles": 9000,
			"topArtists": [{"id":"a1","name":"Acme","playCount":120}],
			"mostActiveHour": 21,
			"firstScrobble": {"trackTitle":"Hello","artistName":"World","timestamp":"2025-01-01T08:00:00Z"}
		}`,
	}))
	got, err := c.Stats.GetWrapped(context.Background(), GetWrappedParams{Actor: "tsiry.bsky.social", Year: 2025})
	if err != nil {
		t.Fatal(err)
	}
	if got.Year != 2025 || got.MostActiveHour != 21 {
		t.Fatalf("got = %+v", got)
	}
	if len(got.TopArtists) != 1 || got.TopArtists[0].Name != "Acme" {
		t.Fatalf("topArtists = %+v", got.TopArtists)
	}
	if got.FirstScrobble == nil || got.FirstScrobble.TrackTitle != "Hello" {
		t.Fatalf("firstScrobble = %+v", got.FirstScrobble)
	}
}

func TestChartsGetScrobblesChart(t *testing.T) {
	var gotQuery string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"scrobbles":[{"date":"2025-01-01","count":5}]}`)
	})
	got, err := c.Charts.GetScrobblesChart(context.Background(), GetScrobblesChartParams{
		Actor: "tsiry.bsky.social",
		From:  "2025-01-01",
		To:    "2025-12-31",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Scrobbles) != 1 || got.Scrobbles[0].Count != 5 {
		t.Fatalf("got = %+v", got)
	}
	for _, want := range []string{"did=tsiry", "from=2025-01-01", "to=2025-12-31"} {
		if !strings.Contains(gotQuery, want) {
			t.Fatalf("query %q missing %q", gotQuery, want)
		}
	}
}

func TestFeedSearch(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.feed.search": `{
			"hits": [
				{"$type":"app.rocksky.song.defs#songViewBasic","title":"Echo","artist":"Tame"},
				{"$type":"app.rocksky.artist.defs#artistViewBasic","name":"Tame Impala"}
			],
			"estimatedTotalHits": 2,
			"processingTimeMs": 4
		}`,
	}))
	got, err := c.Feed.Search(context.Background(), SearchParams{Query: "tame"})
	if err != nil {
		t.Fatal(err)
	}
	if got.EstimatedTotalHits != 2 || len(got.Hits) != 2 {
		t.Fatalf("got = %+v", got)
	}
	if got.Hits[1]["name"] != "Tame Impala" {
		t.Fatalf("hit[1] = %+v", got.Hits[1])
	}
}

func TestGraphGetFollowersAndFollow(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.graph.getFollowers": `{
			"subject": {"handle":"alice.bsky.social","did":"did:plc:abc"},
			"followers": [{"handle":"bob.bsky.social"}],
			"cursor": "next",
			"count": 1
		}`,
		"/xrpc/app.rocksky.graph.followAccount": `{
			"subject": {"handle":"alice.bsky.social"},
			"followers": [{"handle":"me.bsky.social"}]
		}`,
	}), WithBearerToken("tkn"))

	got, err := c.Graph.GetFollowers(context.Background(), GraphListParams{Actor: "alice.bsky.social"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Subject.Handle != "alice.bsky.social" || got.Count != 1 || got.Cursor != "next" {
		t.Fatalf("followers = %+v", got)
	}

	res, err := c.Graph.Follow(context.Background(), "alice.bsky.social")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Followers) != 1 || res.Followers[0].Handle != "me.bsky.social" {
		t.Fatalf("follow = %+v", res)
	}
}

func TestLikeAndDislikeSong(t *testing.T) {
	var paths []string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"song-1","title":"T"}`)
	}, WithBearerToken("tkn"))

	if _, err := c.Like.LikeSong(context.Background(), "at://example/song/1"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Like.DislikeSong(context.Background(), "at://example/song/1"); err != nil {
		t.Fatal(err)
	}
	if len(paths) != 2 ||
		paths[0] != "/xrpc/app.rocksky.like.likeSong" ||
		paths[1] != "/xrpc/app.rocksky.like.dislikeSong" {
		t.Fatalf("paths = %v", paths)
	}
}

func TestShoutGetAndCreate(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.shout.getTrackShouts": `{
			"shouts": [{"id":"sh1","message":"banger","author":{"handle":"alice.bsky.social"}}]
		}`,
		"/xrpc/app.rocksky.shout.createShout": `{
			"id":"sh-new","message":"yes!","author":{"handle":"me.bsky.social"}
		}`,
	}), WithBearerToken("tkn"))

	got, err := c.Shout.GetTrackShouts(context.Background(), ShoutTargetParams{URI: "at://song/1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Shouts) != 1 || got.Shouts[0].Author.Handle != "alice.bsky.social" {
		t.Fatalf("shouts = %+v", got)
	}

	created, err := c.Shout.CreateShout(context.Background(), CreateShoutInput{Message: "yes!"})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != "sh-new" || created.Message != "yes!" {
		t.Fatalf("created = %+v", created)
	}
}

func TestActorGetActorAlbumsAndArtists(t *testing.T) {
	c := newTestClient(t, mux(t, map[string]string{
		"/xrpc/app.rocksky.actor.getActorAlbums":  `{"albums":[{"id":"a1","title":"Currents"}]}`,
		"/xrpc/app.rocksky.actor.getActorArtists": `{"artists":[{"id":"ar1","name":"Tame Impala"}]}`,
	}))
	albums, err := c.Actor.GetActorAlbums(context.Background(), ActorListParams{Actor: "x"})
	if err != nil {
		t.Fatal(err)
	}
	if len(albums.Albums) != 1 || albums.Albums[0].Title != "Currents" {
		t.Fatalf("albums = %+v", albums)
	}
	artists, err := c.Actor.GetActorArtists(context.Background(), ActorListParams{Actor: "x"})
	if err != nil {
		t.Fatal(err)
	}
	if len(artists.Artists) != 1 || artists.Artists[0].Name != "Tame Impala" {
		t.Fatalf("artists = %+v", artists)
	}
}
