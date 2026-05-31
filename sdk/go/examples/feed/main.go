// feed streams the public scrobble feed and prints each entry.
//
// Usage:
//
//	go run ./examples/feed -limit 10
//	go run ./examples/feed -actor tsiry.bsky.social -limit 20
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/tsirysndr/rocksky/sdk/go/rocksky"
)

func main() {
	actor := flag.String("actor", "", "if set, restrict to scrobbles for this actor")
	limit := flag.Int("limit", 10, "number of scrobbles to print")
	flag.Parse()

	client := rocksky.NewClient()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	res, err := client.Scrobble.GetScrobbles(ctx, rocksky.GetScrobblesParams{
		Actor:            *actor,
		PaginationParams: rocksky.PaginationParams{Limit: *limit},
	})
	if err != nil {
		var apiErr *rocksky.Error
		if errors.As(err, &apiErr) && apiErr.IsRateLimited() {
			log.Fatalf("rate limited — back off and retry")
		}
		log.Fatalf("get scrobbles: %v", err)
	}

	for _, s := range res.Scrobbles {
		fmt.Printf("[%s] %s — %s · @%s\n", s.Date, s.Title, s.Artist, s.User)
	}
	fmt.Printf("\n%d scrobbles\n", len(res.Scrobbles))
}
