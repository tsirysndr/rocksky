// search runs a global Rocksky search and prints heterogeneous hits
// (songs, albums, artists, playlists, profiles) in a single feed.
//
// Usage:
//
//	go run ./examples/search -q "tame impala"
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/tsirysndr/rocksky/sdk/go/rocksky"
)

func main() {
	q := flag.String("q", "", "search query (required)")
	flag.Parse()

	if *q == "" {
		log.Fatal("-q is required")
	}

	client := rocksky.NewClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	res, err := client.Feed.Search(ctx, rocksky.SearchParams{Query: *q})
	if err != nil {
		log.Fatalf("search: %v", err)
	}

	fmt.Printf("%d hits (search took %dms)\n\n", res.EstimatedTotalHits, res.ProcessingTimeMS)
	for i, hit := range res.Hits {
		label := pickLabel(hit)
		fmt.Printf("%2d. [%s] %s\n", i+1, hit["$type"], label)
	}
}

// pickLabel extracts a human-readable label from a heterogeneous search hit.
// Different hit types use different field names — try them in priority order.
func pickLabel(hit map[string]any) string {
	for _, key := range []string{"title", "name", "displayName", "handle"} {
		if v, ok := hit[key].(string); ok && v != "" {
			return v
		}
	}
	return "(no label)"
}
