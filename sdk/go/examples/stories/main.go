// stories fetches the latest scrobble per user, optionally filtering by feed
// generator or restricting to people the viewer follows.
//
// Usage:
//
//	go run ./examples/stories
//	go run ./examples/stories -feed metalcore
//	ROCKSKY_TOKEN=<jwt> go run ./examples/stories -following
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

var feeds = map[string]string{
	"metalcore": "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore",
	"trap":      "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/trap",
	"synthwave": "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/synthwave",
}

func main() {
	size := flag.Int("size", 10, "number of stories to fetch")
	feed := flag.String("feed", "", "feed name (metalcore|trap|synthwave) or full at-uri")
	following := flag.Bool("following", false, "only stories from users you follow (requires ROCKSKY_TOKEN)")
	flag.Parse()

	var opts []rocksky.Option
	if token := os.Getenv("ROCKSKY_TOKEN"); token != "" {
		opts = append(opts, rocksky.WithBearerToken(token))
	}
	client := rocksky.NewClient(opts...)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	feedURI := *feed
	if uri, ok := feeds[feedURI]; ok {
		feedURI = uri
	}

	res, err := client.Feed.GetStories(ctx, rocksky.GetStoriesParams{
		Size:      *size,
		Feed:      feedURI,
		Following: *following,
	})
	if err != nil {
		log.Fatalf("get stories: %v", err)
	}

	for _, s := range res.Stories {
		fmt.Printf("@%-24s %s — %s\n", s.Handle, s.Artist, s.Title)
	}
	fmt.Printf("\n%d stories\n", len(res.Stories))
}
