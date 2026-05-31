// scrobble records a single play against the authenticated user's library.
//
// Usage:
//
//	export ROCKSKY_TOKEN=...                # JWT bearer token
//	go run ./examples/scrobble \
//	    -title "Black Hole Sun" \
//	    -artist "Soundgarden" \
//	    -album "Superunknown" \
//	    -duration 320000
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/tsirysndr/rocksky/sdk/go/rocksky"
)

func main() {
	title := flag.String("title", "", "track title (required)")
	artist := flag.String("artist", "", "track artist (required)")
	album := flag.String("album", "", "album title (optional)")
	durationMs := flag.Int("duration", 0, "track duration in milliseconds (optional)")
	mbid := flag.String("mbid", "", "MusicBrainz recording ID (optional)")
	isrc := flag.String("isrc", "", "ISRC (optional)")
	flag.Parse()

	if *title == "" || *artist == "" {
		log.Fatal("-title and -artist are required")
	}

	token := os.Getenv("ROCKSKY_TOKEN")
	if token == "" {
		log.Fatal("ROCKSKY_TOKEN env var is required for scrobble (it's a write op)")
	}

	client := rocksky.NewClient(rocksky.WithBearerToken(token))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Builder style — handy when many fields are optional. The equivalent
	// struct-literal form is:
	//
	//   client.Scrobble.CreateScrobble(ctx, rocksky.CreateScrobbleInput{Title: ..., Artist: ..., ...})
	out, err := client.Scrobble.NewScrobble(*title, *artist).
		Album(*album).
		Duration(*durationMs).
		MBID(*mbid).
		ISRC(*isrc).
		Timestamp(time.Now().Unix()).
		Send(ctx)
	if err != nil {
		log.Fatalf("create scrobble: %v", err)
	}

	fmt.Printf("scrobble created\n  uri:   %s\n  title: %s\n  artist: %s\n", out.URI, out.Title, out.Artist)
}
