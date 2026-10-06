package discogs

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// WindowLimiter admits at most n sends in any rolling window and queues the rest. A token bucket would emit 2n across a window boundary and trip the quota.
type WindowLimiter struct {
	mu sync.Mutex
	// spacing carries a guard band: a sleeping goroutine wakes late, never early.
	spacing time.Duration
	slots   []time.Time
	next    int
}

func NewWindowLimiter(n int, window time.Duration) *WindowLimiter {
	if n < 1 {
		n = 1
	}
	guard := window / 20
	if guard < 50*time.Millisecond {
		guard = 50 * time.Millisecond
	}
	return &WindowLimiter{spacing: window + guard, slots: make([]time.Time, n)}
}

// A slot past the deadline is not claimed, so a request that gives up never burns quota.
func (l *WindowLimiter) reserve(now, deadline time.Time) (wait time.Duration, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	at := now
	if earliest := l.slots[l.next].Add(l.spacing); earliest.After(at) {
		at = earliest
	}
	if at.After(deadline) {
		return at.Sub(now), false
	}

	l.slots[l.next] = at
	l.next = (l.next + 1) % len(l.slots)
	return at.Sub(now), true
}

func (l *WindowLimiter) Wait(ctx context.Context, deadline time.Time) error {
	wait, ok := l.reserve(time.Now(), deadline)
	if !ok {
		return fmt.Errorf("%w: next slot is %s away", errQueueFull, wait.Round(time.Millisecond))
	}
	if wait <= 0 {
		return nil
	}

	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
