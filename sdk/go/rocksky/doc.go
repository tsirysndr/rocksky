// Package rocksky is the official Go SDK for the Rocksky XRPC API.
//
// Rocksky is an open music-scrobbling network built on the AT Protocol.
// This SDK wraps the app.rocksky.* XRPC endpoints exposed by the public
// API service at https://api.rocksky.app.
//
// # Getting started
//
//	client := rocksky.NewClient()
//	profile, err := client.Actor.GetProfile(ctx, rocksky.GetProfileParams{
//	    Actor: "tsiry.bsky.social",
//	})
//
// Procedures that mutate state (creating a scrobble, liking a song, following
// an account) require an authenticated bearer token:
//
//	client := rocksky.NewClient(rocksky.WithBearerToken(os.Getenv("ROCKSKY_TOKEN")))
//	_, err := client.Scrobble.CreateScrobble(ctx, rocksky.CreateScrobbleInput{
//	    Title: "Black Hole Sun", Artist: "Soundgarden",
//	})
//
// All endpoint methods take a context.Context and return typed structs that
// mirror the lexicon view definitions under apps/api/lexicons.
package rocksky
