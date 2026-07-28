// Remote control over the WebSocket: a controllable player and a controller.
//
//	ROCKSKY_TOKEN=<jwt> go run ./examples/remote player
//	ROCKSKY_TOKEN=<jwt> go run ./examples/remote controller
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"

	"github.com/tsirysndr/rocksky/sdk/go/rocksky"
)

func main() {
	token := os.Getenv("ROCKSKY_TOKEN")
	if token == "" {
		panic("set ROCKSKY_TOKEN to a Rocksky access token")
	}
	role := "player"
	if len(os.Args) > 1 {
		role = os.Args[1]
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if role == "controller" {
		runController(ctx, token)
	} else {
		runPlayer(ctx, token)
	}
}

func runPlayer(ctx context.Context, token string) {
	p := rocksky.NewRemotePlayer(rocksky.RemotePlayerOptions{
		Token: token,
		Name:  "Go Example Player",
		Handlers: rocksky.RemotePlayerHandlers{
			Play:     func() { fmt.Println("▶ play") },
			Pause:    func() { fmt.Println("⏸ pause") },
			Next:     func() { fmt.Println("⏭ next") },
			Previous: func() { fmt.Println("⏮ previous") },
			Seek:     func(ms int64) { fmt.Printf("⏩ seek %dms\n", ms) },
			Enqueue: func(cmd rocksky.EnqueueCommand) {
				fmt.Printf("+ enqueue %d track(s) (%s)\n", len(cmd.Tracks), cmd.Mode)
			},
		},
	})
	go p.Run(ctx)

	p.SetNowPlaying(rocksky.RemoteNowPlaying{
		Title: "Chaser", Artist: "Calibro 35", Album: "Jazzploitation",
		DurationMs: 182320, IsPlaying: true,
	})
	p.SetStatus("playing")

	fmt.Println("player connected — waiting for commands (Ctrl-C to quit)…")
	<-ctx.Done()
}

func runController(ctx context.Context, token string) {
	// Declared first so the handlers can close over it (they run after connect).
	var c *rocksky.RemoteController
	c = rocksky.NewRemoteController(rocksky.RemoteControllerOptions{
		Token: token,
		Name:  "Go Example Controller",
		Handlers: rocksky.RemoteControllerHandlers{
			Devices: func(primary string, devices []rocksky.RemoteDevice) {
				fmt.Printf("devices: %d (primary %q)\n", len(devices), primary)
				for _, d := range devices {
					np := "(idle)"
					if d.NowPlaying != nil {
						np = fmt.Sprintf("%s — %s", d.NowPlaying.Artist, d.NowPlaying.Title)
					}
					fmt.Printf("  · %s [%s] %s\n", d.Name, d.DeviceID, np)
				}
				// Make the first device primary and pause it, as a demo.
				if len(devices) > 0 {
					c.SetPrimary(devices[0].DeviceID)
					c.Pause(devices[0].DeviceID)
				}
			},
			NowPlaying: func(id, name string, t rocksky.RemoteNowPlaying) {
				fmt.Printf("♪ %s: %s — %s\n", name, t.Artist, t.Title)
			},
			Status:         func(id, name, status string) { fmt.Printf("● %s: %s\n", name, status) },
			PrimaryChanged: func(id string) { fmt.Printf("★ primary → %s\n", id) },
		},
	})
	go c.Run(ctx)

	fmt.Println("controller connected — listening for devices (Ctrl-C to quit)…")
	<-ctx.Done()
}
