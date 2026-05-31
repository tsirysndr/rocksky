// profile prints the public profile and lifetime stats of a Rocksky user.
//
// Usage:
//
//	go run ./examples/profile -actor tsiry.bsky.social
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
	actor := flag.String("actor", "tsiry.bsky.social", "handle or DID to look up")
	flag.Parse()

	client := rocksky.NewClient()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	profile, err := client.Actor.GetProfile(ctx, rocksky.GetProfileParams{Actor: *actor})
	if err != nil {
		log.Fatalf("get profile: %v", err)
	}
	stats, err := client.Stats.GetStats(ctx, rocksky.GetStatsParams{Actor: *actor})
	if err != nil {
		log.Fatalf("get stats: %v", err)
	}

	fmt.Printf("@%s (%s)\n", profile.Handle, profile.DID)
	if profile.DisplayName != "" {
		fmt.Printf("  display name: %s\n", profile.DisplayName)
	}
	fmt.Printf("  scrobbles:    %d\n", stats.Scrobbles)
	fmt.Printf("  artists:      %d\n", stats.Artists)
	fmt.Printf("  albums:       %d\n", stats.Albums)
	fmt.Printf("  tracks:       %d\n", stats.Tracks)
	fmt.Printf("  loved tracks: %d\n", stats.LovedTracks)
}
