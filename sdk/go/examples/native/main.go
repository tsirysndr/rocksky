// Read-only tour of the Rocksky Go SDK (no auth needed).
//   go run ./examples/native
package main

import (
	"context"
	"fmt"

	"github.com/tsirysndr/rocksky/sdk/go/rocksky"
)

func main() {
	ctx := context.Background()
	c := rocksky.NewClient("") // pass a base URL to override https://api.rocksky.app

	s, err := c.GlobalStats(ctx)
	if err != nil {
		panic(err)
	}
	fmt.Printf("global: %d scrobbles · %d users · %d tracks\n", s.Scrobbles, s.Users, s.Tracks)

	fmt.Println("top tracks:")
	tt, _ := c.TopTracks(ctx, 5, 0)
	for _, t := range tt {
		fmt.Printf("  %s — %s\n", t.Artist, t.Title)
	}

	fmt.Println("song hash:", rocksky.SongHash("Chaser", "Calibro 35", "Jazzploitation"))

	// --- write side (uncomment with real credentials) ---
	// agent, _ := rocksky.Login(ctx, "alice.bsky.social", "app-password")
	// idx, _ := rocksky.OpenIndex("./dedup.db"); defer idx.Close(); agent.UseIndex(idx)
	// agent.SyncRepo(ctx)                       // backfill the dedup index
	// uri, _ := agent.Scrobble(ctx, gen.ScrobbleRecord{Title: "Chaser", Artist: "Calibro 35",
	//   Album: "Jazzploitation", AlbumArtist: "Calibro 35", Duration: 182320})
	// go agent.HydrateFromJetstream(ctx)        // keep the index live

	// --- library: your uploaded music (needs an access token) ---
	// lib, _ := rocksky.NewClient("").WithToken("YOUR_ACCESS_TOKEN").Library()
	// genres, _ := lib.GetGenres(ctx); fmt.Println(string(genres))
	// albums, _ := lib.GetAlbumList(ctx, "newest", map[string]any{"size": 10}); fmt.Println(string(albums))
	// song, _ := lib.GetSong(ctx, "<song-id>"); fmt.Println(string(song))
}
